import type { AppConfig } from './config.ts';

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export const LANGUAGES = ['en', 'hi'] as const;
export type Language = (typeof LANGUAGES)[number];
export const STYLES = ['neutral', 'casual', 'detailed'] as const;
export type Style = (typeof STYLES)[number];

// generate_* and regenerate are recorded by the server only, so a client cannot inflate them.
export const CLIENT_EVENT_TYPES = [
  'visit', 'attribute_select', 'notes_added', 'draft_select', 'manual_write', 'template_used', 'copy', 'google_click',
] as const;
export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];
export const EVENT_TYPES = [...CLIENT_EVENT_TYPES, 'generate_request', 'generate_success', 'generate_error', 'regenerate'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
export const SOURCE_RE = /^[a-z0-9_-]{1,32}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export function slugify(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');
}

export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname.includes('.') && !u.username && !u.password;
  } catch {
    return false;
  }
}

// Advisory only: used to warn the business owner, never to block a valid HTTPS URL.
export function looksLikeGoogleUrl(value: string): boolean {
  try {
    const h = new URL(value).hostname;
    return /(^|\.)google\.(com|[a-z]{2}|com?\.[a-z]{2})$/.test(h) || h === 'g.page' || h === 'maps.app.goo.gl' || h === 'goo.gl';
  } catch {
    return false;
  }
}

function plainObject(body: unknown, allowed: string[]): Result<Record<string, unknown>> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return fail('Body must be a JSON object.');
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  if (extra.length) return fail(`Unexpected field: ${extra[0].slice(0, 40)}`);
  return { ok: true, value: body as Record<string, unknown> };
}

export interface GenerateRequest {
  slug: string;
  sessionId: string;
  attributeIds: string[];
  notes: string;
  language: Language;
  style: Style;
  source: string;
}

export function validateGenerateRequest(body: unknown, cfg: Pick<AppConfig, 'maxAttributes' | 'maxNoteChars'>): Result<GenerateRequest> {
  const o = plainObject(body, ['slug', 'sessionId', 'attributeIds', 'notes', 'language', 'style', 'source']);
  if (!o.ok) return o;
  const b = o.value;
  if (typeof b.slug !== 'string' || !SLUG_RE.test(b.slug)) return fail('Invalid funnel.');
  if (!isUuid(b.sessionId)) return fail('Invalid session.');
  const ids = b.attributeIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > cfg.maxAttributes || !ids.every(isUuid) || new Set(ids).size !== ids.length) {
    return fail(`Select between 1 and ${cfg.maxAttributes} feedback attributes.`);
  }
  const notes = b.notes ?? '';
  if (typeof notes !== 'string' || notes.length > cfg.maxNoteChars) return fail(`Notes must be at most ${cfg.maxNoteChars} characters.`);
  const language = b.language ?? 'en';
  if (!LANGUAGES.includes(language as Language)) return fail('Unsupported language.');
  const style = b.style ?? 'neutral';
  if (!STYLES.includes(style as Style)) return fail('Unsupported style.');
  const source = b.source ?? 'direct';
  if (typeof source !== 'string' || !SOURCE_RE.test(source)) return fail('Invalid source.');
  return {
    ok: true,
    value: {
      slug: b.slug, sessionId: b.sessionId, attributeIds: ids as string[], notes: notes.trim(),
      language: language as Language, style: style as Style, source,
    },
  };
}

export interface EventRequest {
  slug: string;
  sessionId: string;
  type: ClientEventType;
  source: string;
  attributeId: string | null;
}

export function validateEvent(body: unknown): Result<EventRequest> {
  const o = plainObject(body, ['slug', 'sessionId', 'type', 'source', 'attributeId']);
  if (!o.ok) return o;
  const b = o.value;
  if (typeof b.slug !== 'string' || !SLUG_RE.test(b.slug)) return fail('Invalid funnel.');
  if (!isUuid(b.sessionId)) return fail('Invalid session.');
  if (!CLIENT_EVENT_TYPES.includes(b.type as ClientEventType)) return fail('Invalid event type.');
  const source = b.source ?? 'direct';
  if (typeof source !== 'string' || !SOURCE_RE.test(source)) return fail('Invalid source.');
  if (b.attributeId != null && !isUuid(b.attributeId)) return fail('Invalid attribute.');
  return {
    ok: true,
    value: { slug: b.slug, sessionId: b.sessionId, type: b.type as ClientEventType, source, attributeId: (b.attributeId as string | undefined) ?? null },
  };
}

// The model output is untrusted: exactly five distinct, plain, bounded strings or nothing.
export function validateDrafts(raw: unknown, cfg: Pick<AppConfig, 'maxDraftChars'>): Result<string[]> {
  if (!Array.isArray(raw) || raw.length !== 5) return fail('Expected exactly five drafts.');
  const drafts: string[] = [];
  for (const d of raw) {
    if (typeof d !== 'string') return fail('Draft is not text.');
    const text = d.replace(/\s+/g, ' ').trim();
    if (text.length < 10 || text.length > cfg.maxDraftChars) return fail('Draft length out of range.');
    drafts.push(text);
  }
  if (new Set(drafts.map((d) => d.toLowerCase())).size !== 5) return fail('Drafts are not distinct.');
  return { ok: true, value: drafts };
}
