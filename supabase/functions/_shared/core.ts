// Request handling for the three public endpoints. Runtime-neutral and storage-agnostic so the
// exact same logic runs in the Edge Functions, in the browser demo backend and in the tests.
import { aiStatus, type AppConfig } from './config.ts';
import { buildPrompt, callProvider, type AiErrorKind, type FetchFn } from './gemini.ts';
import { SLUG_RE, validateDrafts, validateEvent, validateGenerateRequest, type EventType, type Language } from './validate.ts';

export interface PublicAttribute { id: string; label: string; labelHi: string | null }

/** Everything a customer-facing funnel page may know. Nothing private belongs here. */
export interface PublicFunnel {
  id: string;
  slug: string;
  businessId: string;
  businessName: string;
  businessCategory: string;
  logoUrl: string | null;
  heading: string;
  description: string;
  instructions: string;
  ctaText: string;
  primaryColor: string;
  backgroundColor: string;
  languages: Language[];
  defaultLanguage: Language;
  aiEnabled: boolean;
  allowNotes: boolean;
  maxSelections: number;
  maxRegenerations: number;
  reviewUrl: string;
  attributes: PublicAttribute[];
}

/** Shape of `funnels` joined with its business and attributes (snake_case = database columns). */
export interface FunnelRow {
  id: string;
  slug: string;
  heading: string;
  description: string;
  instructions: string;
  cta_text: string;
  show_logo: boolean;
  primary_color: string | null;
  background_color: string | null;
  languages: string[];
  ai_enabled: boolean;
  allow_notes: boolean;
  max_selections: number;
  max_regenerations: number;
  review_url: string | null;
  businesses: {
    id: string; name: string; category: string; logo_url: string | null; brand_primary: string; brand_background: string;
    default_language: string; google_review_url: string | null; status: string;
  };
  funnel_feedback_attributes: { id: string; label: string; label_hi: string | null; position: number; enabled: boolean }[];
}

export function toPublicFunnel(r: FunnelRow): PublicFunnel | null {
  const b = r.businesses;
  const reviewUrl = r.review_url || b.google_review_url;
  if (b.status !== 'active' || !reviewUrl) return null;
  const languages = (r.languages.length ? r.languages : ['en']) as Language[];
  return {
    id: r.id,
    slug: r.slug,
    businessId: b.id,
    businessName: b.name,
    businessCategory: b.category,
    logoUrl: r.show_logo ? b.logo_url : null,
    heading: r.heading,
    description: r.description,
    instructions: r.instructions,
    ctaText: r.cta_text,
    primaryColor: r.primary_color || b.brand_primary,
    backgroundColor: r.background_color || b.brand_background,
    languages,
    defaultLanguage: languages.includes(b.default_language as Language) ? (b.default_language as Language) : languages[0],
    aiEnabled: r.ai_enabled,
    allowNotes: r.allow_notes,
    maxSelections: r.max_selections,
    maxRegenerations: r.max_regenerations,
    reviewUrl,
    attributes: r.funnel_feedback_attributes
      .filter((a) => a.enabled)
      .sort((a, b2) => a.position - b2.position)
      .map((a) => ({ id: a.id, label: a.label, labelHi: a.label_hi })),
  };
}

export type GenerationStatus = 'success' | AiErrorKind;

export interface GenerationRecord {
  funnelId: string; sessionId: string; ipHash: string | null; language: string; attributeCount: number;
  regenerate: boolean; status: GenerationStatus; provider: string; model: string;
}
export interface EventRecord {
  funnelId: string; businessId: string; sessionId: string; type: EventType; source: string;
  attributeId: string | null; ipHash: string | null;
}
export interface Store {
  getPublishedFunnel(slug: string): Promise<PublicFunnel | null>;
  countGenerations(q: { funnelId?: string; sessionId?: string; ipHash?: string; status?: GenerationStatus; sinceIso: string }): Promise<number>;
  recordGeneration(r: GenerationRecord): Promise<void>;
  countEvents(q: { funnelId: string; sessionId?: string; sinceIso: string }): Promise<number>;
  recordEvent(e: EventRecord): Promise<void>;
}

export interface HandlerResult { status: number; body: Record<string, unknown> }

const err = (status: number, error: string, message: string, extra: Record<string, unknown> = {}): HandlerResult =>
  ({ status, body: { error, message, ...extra } });
const iso = (ms: number) => new Date(ms).toISOString();
const DAY_MS = 86_400_000;

export async function resolveFunnel(store: Store, cfg: AppConfig, slug: unknown): Promise<HandlerResult> {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return err(400, 'invalid_request', 'Invalid feedback link.');
  const funnel = await store.getPublishedFunnel(slug);
  if (!funnel) return err(404, 'not_found', 'This feedback page is not available.');
  return {
    status: 200,
    body: { funnel, ai: { available: funnel.aiEnabled && aiStatus(cfg) === 'ok' }, limits: { maxNoteChars: cfg.maxNoteChars } },
  };
}

export async function trackEvent(store: Store, cfg: AppConfig, body: unknown, ipHash: string | null, now: number): Promise<HandlerResult> {
  const v = validateEvent(body);
  if (!v.ok) return err(400, 'invalid_request', v.error);
  const e = v.value;
  const funnel = await store.getPublishedFunnel(e.slug);
  if (!funnel) return err(404, 'not_found', 'This feedback page is not available.');
  if (e.attributeId && !funnel.attributes.some((a) => a.id === e.attributeId)) return err(400, 'invalid_request', 'Invalid attribute.');
  const sinceIso = iso(now - 60_000);
  if (
    (await store.countEvents({ funnelId: funnel.id, sessionId: e.sessionId, sinceIso })) >= cfg.maxEventsPerSessionMinute ||
    (await store.countEvents({ funnelId: funnel.id, sinceIso })) >= cfg.maxEventsPerFunnelMinute
  ) {
    return err(429, 'rate_limited', 'Too many requests.');
  }
  await store.recordEvent({ funnelId: funnel.id, businessId: funnel.businessId, sessionId: e.sessionId, type: e.type, source: e.source, attributeId: e.attributeId, ipHash });
  return { status: 202, body: { ok: true } };
}

/** How many AI generations one visitor session may request for a funnel (first try + regenerations). */
export function generationAllowance(cfg: Pick<AppConfig, 'maxAiRequestsPerSession' | 'maxRegenerationsPerSession'>, funnelMaxRegenerations: number): number {
  return Math.min(cfg.maxAiRequestsPerSession, 1 + Math.min(funnelMaxRegenerations, cfg.maxRegenerationsPerSession));
}

export function checkGenerationLimits(
  counts: { session: number; funnelWindow: number; ipWindow: number },
  cfg: Pick<AppConfig, 'maxAiRequestsPerFunnelWindow' | 'maxAiRequestsPerIpWindow'>,
  allowance: number,
): 'session_limit' | 'rate_limited' | null {
  if (counts.session >= allowance) return 'session_limit';
  if (counts.funnelWindow >= cfg.maxAiRequestsPerFunnelWindow || counts.ipWindow >= cfg.maxAiRequestsPerIpWindow) return 'rate_limited';
  return null;
}

export interface AiDeps { fetch: FetchFn; apiKey: string | undefined; baseUrl?: string; now: number }

const UNAVAILABLE = 'AI suggestions are not available right now. You can still write your own words or use a simple template.';

export async function generateDrafts(store: Store, cfg: AppConfig, deps: AiDeps, body: unknown, ipHash: string | null): Promise<HandlerResult> {
  const v = validateGenerateRequest(body, cfg);
  if (!v.ok) return err(400, 'invalid_request', v.error);
  const r = v.value;
  const funnel = await store.getPublishedFunnel(r.slug);
  if (!funnel) return err(404, 'not_found', 'This feedback page is not available.');

  const labels = r.attributeIds.map((id) => funnel.attributes.find((a) => a.id === id)?.label);
  if (labels.includes(undefined) || labels.length > funnel.maxSelections) return err(400, 'invalid_request', 'Invalid attribute selection.');
  if (!funnel.languages.includes(r.language)) return err(400, 'invalid_request', 'Unsupported language.');

  // Never reveal which switch is off; a paid provider is simply never called while prohibited.
  const status = aiStatus(cfg);
  if (!funnel.aiEnabled || status !== 'ok' || !deps.apiKey) {
    return err(503, status === 'ok' ? 'ai_disabled' : status === 'not_configured' ? 'ai_not_configured' : 'ai_disabled', UNAVAILABLE, { fallback: true });
  }

  // Circuit breaker: after a quota error, do not call the provider again until the cooldown passes.
  const quotaHits = await store.countGenerations({ status: 'quota', sinceIso: iso(deps.now - cfg.quotaCooldownSeconds * 1000) });
  if (quotaHits > 0) {
    return err(429, 'quota_exhausted', UNAVAILABLE, { fallback: true, retryAfterSeconds: cfg.quotaCooldownSeconds });
  }

  const windowIso = iso(deps.now - cfg.windowSeconds * 1000);
  const session = await store.countGenerations({ funnelId: funnel.id, sessionId: r.sessionId, sinceIso: iso(deps.now - DAY_MS) });
  const allowance = generationAllowance(cfg, funnel.maxRegenerations);
  const limited = checkGenerationLimits(
    {
      session,
      funnelWindow: await store.countGenerations({ funnelId: funnel.id, sinceIso: windowIso }),
      ipWindow: ipHash ? await store.countGenerations({ ipHash, sinceIso: windowIso }) : 0,
    },
    cfg,
    allowance,
  );
  if (limited === 'session_limit') {
    return err(429, 'session_limit', 'You have used all AI suggestions for this visit. You can still edit a draft or write your own.', { fallback: true, remaining: 0 });
  }
  if (limited) return err(429, 'rate_limited', 'AI suggestions are busy right now. You can still write your own words or use a simple template.', { fallback: true });

  const regenerate = session > 0;
  const event = (type: EventType) =>
    store.recordEvent({ funnelId: funnel.id, businessId: funnel.businessId, sessionId: r.sessionId, type, source: r.source, attributeId: null, ipHash });
  await event(regenerate ? 'regenerate' : 'generate_request');

  const ai = await callProvider(cfg, deps.fetch, {
    apiKey: deps.apiKey,
    baseUrl: deps.baseUrl,
    model: cfg.model,
    maxOutputTokens: cfg.maxOutputTokens,
    timeoutMs: cfg.providerTimeoutMs,
    prompt: buildPrompt({
      businessName: funnel.businessName, category: funnel.businessCategory, attributes: labels as string[],
      notes: r.notes, language: r.language, style: r.style, maxDraftChars: cfg.maxDraftChars,
    }),
  });
  const drafts = ai.ok ? validateDrafts(ai.raw, cfg) : null;
  const outcome: GenerationStatus = !ai.ok ? ai.kind : drafts?.ok ? 'success' : 'malformed';

  // Only metadata is stored. Customer notes and draft text are never persisted.
  await store.recordGeneration({
    funnelId: funnel.id, sessionId: r.sessionId, ipHash, language: r.language, attributeCount: labels.length,
    regenerate, status: outcome, provider: cfg.provider, model: cfg.model,
  });
  await event(outcome === 'success' ? 'generate_success' : 'generate_error');

  if (outcome === 'quota') return err(429, 'quota_exhausted', UNAVAILABLE, { fallback: true, retryAfterSeconds: cfg.quotaCooldownSeconds });
  if (outcome === 'timeout') return err(504, 'provider_timeout', 'AI suggestions took too long. Your selections are saved; you can try once more or write your own.', { fallback: true });
  if (!drafts?.ok) return err(502, 'provider_error', UNAVAILABLE, { fallback: true });
  return { status: 200, body: { drafts: drafts.value, label: 'ai_generated_draft', remaining: Math.max(0, allowance - session - 1) } };
}
