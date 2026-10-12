// Browser-only demo backend, used when no Supabase credentials are configured and in the tests.
// Data lives in localStorage. It mirrors the role rules and database guards, and runs the REAL
// Edge Function request logic (supabase/functions/_shared/core.ts) against a simulated AI provider.
// Nothing here is a verified cloud integration.
import { toCsv } from '../../supabase/functions/_shared/analytics.ts';
import { readConfig } from '../../supabase/functions/_shared/config.ts';
import {
  generateDrafts, resolveFunnel, toPublicFunnel, trackEvent,
  type GenerationRecord, type HandlerResult, type Store,
} from '../../supabase/functions/_shared/core.ts';
import { can, type Action } from '../../supabase/functions/_shared/roles.ts';
import { isHttpsUrl, SLUG_RE } from '../../supabase/functions/_shared/validate.ts';
import { DEFAULT_ATTRIBUTES, randomSuffix } from '../features/funnels/defaults.ts';
import type { AnalyticsRow, AuthUser, Business, Funnel, FunnelInput, QrAsset, Role } from '../types.ts';
import type { Api } from './api.ts';
import { DEMO_AI_KEY, publicFunnelUrl } from './env.ts';
import { ApiError, assertLogo } from './errors.ts';

interface DemoEvent { funnel_id: string; business_id: string; session_id: string; event_type: string; source: string; created_at: string }
interface Db {
  users: AuthUser[];
  currentUserId: string | null;
  orgs: { id: string; name: string; retention_days: number }[];
  members: { organization_id: string; user_id: string; role: Role }[];
  businesses: Business[];
  funnels: Funnel[];
  events: DemoEvent[];
  generations: (GenerationRecord & { created_at: string })[];
  assets: (QrAsset & { business_id: string })[];
}

const KEY = 'reviewflow-demo-v1';
export const DEMO_EMAIL = 'demo@example.com';

const empty = (): Db => ({ users: [], currentUserId: null, orgs: [], members: [], businesses: [], funnels: [], events: [], generations: [], assets: [] });
function load(): Db {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return empty();
  }
}
function save(db: Db): void {
  db.events = db.events.slice(-5000);
  localStorage.setItem(KEY, JSON.stringify(db));
}

const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const notFound = () => new ApiError('Not found.', 'not_found');

function me(db: Db): AuthUser {
  const user = db.users.find((u) => u.id === db.currentUserId);
  if (!user) throw new ApiError('Please sign in.', 'unauthorized');
  return user;
}
function roleIn(db: Db, orgId: string): Role | null {
  const user = me(db);
  return db.members.find((m) => m.organization_id === orgId && m.user_id === user.id)?.role ?? null;
}
// Like RLS: a non-member cannot even tell whether the row exists.
function need(db: Db, orgId: string, action: Action): void {
  const role = roleIn(db, orgId);
  if (!role) throw notFound();
  if (!can(role, action)) throw new ApiError('You do not have permission to do that.', 'forbidden');
}
function businessFor(db: Db, id: string, action: Action): Business {
  const b = db.businesses.find((x) => x.id === id);
  if (!b) throw notFound();
  need(db, b.organization_id, action);
  return b;
}
function funnelFor(db: Db, id: string, action: Action): Funnel {
  const f = db.funnels.find((x) => x.id === id);
  if (!f) throw notFound();
  businessFor(db, f.business_id, action);
  return f;
}
function assertPublishable(db: Db, f: Pick<Funnel, 'review_url' | 'business_id'>): void {
  if (!(f.review_url || db.businesses.find((b) => b.id === f.business_id)?.google_review_url)) {
    throw new ApiError('Add the official Google review URL before publishing.', 'invalid');
  }
}
function assertFunnelInput(db: Db, input: FunnelInput, existing?: Funnel): void {
  if (!SLUG_RE.test(input.slug)) throw new ApiError('Invalid public link.', 'invalid');
  if (db.funnels.some((f) => f.slug === input.slug && f.id !== existing?.id)) throw new ApiError('That public link is already in use. Choose another.', 'conflict');
  if (existing?.published_at && existing.slug !== input.slug) throw new ApiError('The public link is permanent once a funnel has been published.', 'invalid');
  if (input.review_url && !isHttpsUrl(input.review_url)) throw new ApiError('The review URL must start with https://', 'invalid');
}

const listeners = new Set<(user: AuthUser | null, event: string) => void>();
const emit = (user: AuthUser | null, event: string) => listeners.forEach((cb) => cb(user, event));

function seedDemo(db: Db): AuthUser {
  const user: AuthUser = { id: uid(), email: DEMO_EMAIL, full_name: 'Demo User' };
  const orgId = uid();
  const businessId = uid();
  const t = nowIso();
  db.users.push(user);
  db.orgs.push({ id: orgId, name: 'Demo Organization (fictional)', retention_days: 365 });
  db.members.push({ organization_id: orgId, user_id: user.id, role: 'owner' });
  db.businesses.push({
    id: businessId, organization_id: orgId, name: 'Blue Lantern Cafe', category: 'cafe',
    description: 'A fictional neighbourhood cafe used as sample data.', logo_url: null, website: null, contact_email: null, contact_phone: null,
    address: null, time_zone: 'Asia/Kolkata', default_language: 'en', google_place_id: null,
    google_review_url: 'https://search.google.com/local/writereview?placeid=FICTIONAL_DEMO_PLACE',
    brand_primary: '#111111', brand_background: '#ffffff', status: 'active', created_at: t, updated_at: t,
  });
  db.funnels.push({
    id: uid(), business_id: businessId, name: 'Tabletop QR', slug: 'blue-lantern-cafe', heading: 'How was your visit to Blue Lantern Cafe?',
    description: 'Your honest feedback helps us improve and helps others decide.', instructions: 'Pick what describes your visit. You stay in control of every word.',
    cta_text: 'Share your feedback', languages: ['en', 'hi'], show_logo: true, primary_color: null, background_color: null, ai_enabled: true,
    allow_notes: true, max_selections: 5, max_regenerations: 2, review_url: null, qr_settings: {}, status: 'published', published_at: t,
    created_at: t, updated_at: t, attributes: DEFAULT_ATTRIBUTES.map((a, position) => ({ ...a, id: uid(), position })),
  });
  return user;
}

export const mockApi: Api = {
  async getUser() {
    const db = load();
    return db.users.find((u) => u.id === db.currentUserId) ?? null;
  },
  onAuthChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  async signUp({ email, fullName, organizationName }) {
    const db = load();
    if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw new ApiError('An account with that email already exists.', 'conflict');
    const user: AuthUser = { id: uid(), email, full_name: fullName };
    const orgId = uid();
    db.users.push(user);
    db.orgs.push({ id: orgId, name: organizationName || 'My organization', retention_days: 365 });
    db.members.push({ organization_id: orgId, user_id: user.id, role: 'owner' });
    db.currentUserId = user.id;
    save(db);
    emit(user, 'SIGNED_IN');
    return { needsEmailConfirmation: false };
  },
  // Demo mode has no real authentication: passwords are neither checked nor stored.
  async signIn(email) {
    const db = load();
    let user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user && email.toLowerCase() === DEMO_EMAIL) user = seedDemo(db);
    if (!user) throw new ApiError('No demo account uses that email. Sign up first, or use demo@example.com.', 'unauthorized');
    db.currentUserId = user.id;
    save(db);
    emit(user, 'SIGNED_IN');
  },
  async signOut() {
    const db = load();
    db.currentUserId = null;
    save(db);
    emit(null, 'SIGNED_OUT');
  },
  async requestPasswordReset() {},
  async updatePassword() {},
  async updateProfile(fullName) {
    const db = load();
    const user = me(db);
    user.full_name = fullName;
    save(db);
    emit(user, 'USER_UPDATED');
  },

  async listOrgs() {
    const db = load();
    const user = me(db);
    return db.members.filter((m) => m.user_id === user.id).map((m) => ({ ...db.orgs.find((o) => o.id === m.organization_id)!, role: m.role }));
  },
  async createOrg(name) {
    const db = load();
    const id = uid();
    db.orgs.push({ id, name, retention_days: 365 });
    db.members.push({ organization_id: id, user_id: me(db).id, role: 'owner' });
    save(db);
    return id;
  },
  async updateOrg(id, patch) {
    const db = load();
    need(db, id, 'org.manage');
    Object.assign(db.orgs.find((o) => o.id === id)!, patch);
    save(db);
  },
  async listMembers(orgId) {
    const db = load();
    need(db, orgId, 'analytics.view');
    return db.members.filter((m) => m.organization_id === orgId).map((m) => {
      const u = db.users.find((x) => x.id === m.user_id)!;
      return { user_id: m.user_id, role: m.role, email: u.email, full_name: u.full_name };
    });
  },
  async addMember(orgId, email, role) {
    const db = load();
    need(db, orgId, 'members.manage');
    const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) throw new ApiError('No account uses that email yet. Ask them to sign up first.', 'not_found');
    const existing = db.members.find((m) => m.organization_id === orgId && m.user_id === user.id);
    if (existing) existing.role = role;
    else db.members.push({ organization_id: orgId, user_id: user.id, role });
    save(db);
  },
  async setMemberRole(orgId, userId, role) {
    const db = load();
    need(db, orgId, 'members.manage');
    const m = db.members.find((x) => x.organization_id === orgId && x.user_id === userId);
    if (!m) throw notFound();
    if (m.role === 'owner' && role !== 'owner' && !db.members.some((x) => x.organization_id === orgId && x.role === 'owner' && x.user_id !== userId)) {
      throw new ApiError('An organization must keep at least one owner.', 'invalid');
    }
    m.role = role;
    save(db);
  },
  async removeMember(orgId, userId) {
    const db = load();
    need(db, orgId, 'members.manage');
    const m = db.members.find((x) => x.organization_id === orgId && x.user_id === userId);
    if (m?.role === 'owner' && !db.members.some((x) => x.organization_id === orgId && x.role === 'owner' && x.user_id !== userId)) {
      throw new ApiError('An organization must keep at least one owner.', 'invalid');
    }
    db.members = db.members.filter((x) => x !== m);
    save(db);
  },

  async listBusinesses(orgId) {
    const db = load();
    need(db, orgId, 'analytics.view');
    return db.businesses.filter((b) => b.organization_id === orgId);
  },
  async getBusiness(id) {
    return businessFor(load(), id, 'analytics.view');
  },
  async saveBusiness(orgId, input, id) {
    const db = load();
    if (input.google_review_url && !isHttpsUrl(input.google_review_url)) throw new ApiError('The review URL must start with https://', 'invalid');
    let b: Business;
    if (id) {
      b = businessFor(db, id, 'business.update');
      Object.assign(b, input, { updated_at: nowIso() });
    } else {
      need(db, orgId, 'business.create');
      b = { ...input, id: uid(), organization_id: orgId, status: 'active', created_at: nowIso(), updated_at: nowIso() };
      db.businesses.push(b);
    }
    save(db);
    return b;
  },
  async setBusinessStatus(id, status) {
    const db = load();
    businessFor(db, id, 'business.archive').status = status;
    save(db);
  },
  async uploadLogo(orgId, file) {
    need(load(), orgId, 'business.update');
    assertLogo(file);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new ApiError('Could not read the image.'));
      reader.readAsDataURL(file);
    });
  },

  async listFunnels(orgId) {
    const db = load();
    need(db, orgId, 'analytics.view');
    const ids = new Set(db.businesses.filter((b) => b.organization_id === orgId).map((b) => b.id));
    return db.funnels.filter((f) => ids.has(f.business_id));
  },
  async getFunnel(id) {
    return funnelFor(load(), id, 'analytics.view');
  },
  async saveFunnel(input, id) {
    const db = load();
    const attributes = input.attributes.map((a, position) => ({ id: a.id ?? uid(), label: a.label, label_hi: a.label_hi, enabled: a.enabled, position }));
    let f: Funnel;
    if (id) {
      f = funnelFor(db, id, 'funnel.write');
      assertFunnelInput(db, input, f);
      if (f.status === 'published') assertPublishable(db, input);
      Object.assign(f, input, { business_id: f.business_id, attributes, updated_at: nowIso() });
    } else {
      businessFor(db, input.business_id, 'funnel.write');
      assertFunnelInput(db, input);
      f = { ...input, attributes, id: uid(), status: 'draft', published_at: null, created_at: nowIso(), updated_at: nowIso() };
      db.funnels.push(f);
    }
    save(db);
    return f;
  },
  async setFunnelStatus(id, status) {
    const db = load();
    const f = funnelFor(db, id, 'funnel.write');
    if (status === 'published') {
      assertPublishable(db, f);
      f.published_at ??= nowIso();
    }
    f.status = status;
    save(db);
  },
  async duplicateFunnel(id) {
    const db = load();
    const src = funnelFor(db, id, 'funnel.write');
    const copy: Funnel = {
      ...structuredClone(src), id: uid(), name: `${src.name} (copy)`.slice(0, 120), slug: `${src.slug.slice(0, 44)}-${randomSuffix()}`,
      status: 'draft', published_at: null, created_at: nowIso(), updated_at: nowIso(),
      attributes: src.attributes.map((a) => ({ ...a, id: uid() })),
    };
    db.funnels.push(copy);
    save(db);
    return copy;
  },

  async analytics(f) {
    const db = load();
    need(db, f.organizationId, 'analytics.view');
    const ids = new Set(db.businesses.filter((b) => b.organization_id === f.organizationId).map((b) => b.id));
    const groups = new Map<string, AnalyticsRow & { set: Set<string> }>();
    for (const e of db.events) {
      const day = e.created_at.slice(0, 10);
      if (!ids.has(e.business_id) || day < f.from || day > f.to) continue;
      if ((f.businessId && e.business_id !== f.businessId) || (f.funnelId && e.funnel_id !== f.funnelId) || (f.source && e.source !== f.source)) continue;
      const key = [day, e.funnel_id, e.source, e.event_type].join('|');
      const g = groups.get(key) ?? { day, business_id: e.business_id, funnel_id: e.funnel_id, source: e.source, event_type: e.event_type, events: 0, sessions: 0, set: new Set<string>() };
      g.events += 1;
      g.set.add(e.session_id);
      g.sessions = g.set.size;
      groups.set(key, g);
    }
    return [...groups.values()].map(({ set: _set, ...row }) => row).sort((a, b) => a.day.localeCompare(b.day));
  },
  async exportAnalyticsCsv(f) {
    const db = load();
    const names: Record<string, string> = {};
    for (const x of [...db.businesses, ...db.funnels]) names[x.id] = x.name;
    return toCsv(await this.analytics(f), names);
  },
  async createQrAsset(input) {
    const db = load();
    const f = funnelFor(db, input.funnelId, 'asset.write');
    if (f.status !== 'published') throw new ApiError('Publish the funnel before creating QR assets.', 'invalid');
    const asset = { id: uid(), funnel_id: f.id, business_id: f.business_id, kind: input.kind, layout: input.layout ?? null, target_url: publicFunnelUrl(f.slug, 'qr'), created_at: nowIso() };
    db.assets.push(asset);
    save(db);
    return asset;
  },
  async listQrAssets(orgId) {
    const db = load();
    need(db, orgId, 'analytics.view');
    const ids = new Set(db.businesses.filter((b) => b.organization_id === orgId).map((b) => b.id));
    return db.assets.filter((a) => ids.has(a.business_id)).reverse();
  },
};

// ------------------------------------------------------------------ public endpoints (demo)

const store: Store = {
  async getPublishedFunnel(slug) {
    const db = load();
    const f = db.funnels.find((x) => x.slug === slug && x.status === 'published');
    const b = f && db.businesses.find((x) => x.id === f.business_id);
    return f && b ? toPublicFunnel({ ...f, businesses: b, funnel_feedback_attributes: f.attributes }) : null;
  },
  async countGenerations(q) {
    return load().generations.filter((g) =>
      g.created_at >= q.sinceIso && (!q.funnelId || g.funnelId === q.funnelId) && (!q.sessionId || g.sessionId === q.sessionId) &&
      (!q.ipHash || g.ipHash === q.ipHash) && (!q.status || g.status === q.status)).length;
  },
  async recordGeneration(r) {
    const db = load();
    db.generations.push({ ...r, created_at: nowIso() });
    save(db);
  },
  async countEvents(q) {
    return load().events.filter((e) => e.funnel_id === q.funnelId && e.created_at >= q.sinceIso && (!q.sessionId || e.session_id === q.sessionId)).length;
  },
  async recordEvent(e) {
    const db = load();
    db.events.push({ funnel_id: e.funnelId, business_id: e.businessId, session_id: e.sessionId, event_type: e.type, source: e.source, created_at: nowIso() });
    save(db);
  },
};

const demoAiMode = () => localStorage.getItem(DEMO_AI_KEY) ?? 'ok';

/** Stands in for the Gemini API in demo mode. Returns a Gemini-shaped response built only from the prompt. */
async function simulatedProvider(_url: string, init?: RequestInit): Promise<Response> {
  if (demoAiMode() === 'quota') return new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}', { status: 429 });
  const prompt: string = JSON.parse(String(init?.body)).contents[0].parts[0].text;
  const business = JSON.parse(/^Business: (".*") \(/m.exec(prompt)?.[1] ?? '"this business"');
  const hindi = prompt.includes('Hindi');
  const aspects = prompt.split('\n').filter((l) => l.startsWith('- ') && !l.startsWith('- Write') && !/^- (Reflect|Never|First)/.test(l)).map((l) => l.slice(2));
  const list = aspects.join(', ').toLowerCase();
  const drafts = hindi
    ? [
        `मैं ${business} गया था। मेरे अनुभव के बारे में: ${list}।`,
        `${business} के बारे में मेरी ईमानदार राय: ${list}।`,
        `हाल ही में ${business} जाना हुआ। जो बातें ध्यान में रहीं: ${list}।`,
        `${business} में मेरा अनुभव इन बातों से जुड़ा रहा: ${list}।`,
        `अपने अनुभव के आधार पर ${business} के बारे में: ${list}।`,
      ]
    : [
        `I visited ${business}. What I noticed most: ${list}.`,
        `Sharing my honest take on ${business}: ${list}.`,
        `My recent visit to ${business} comes down to this: ${list}.`,
        `A few words about my experience at ${business}: ${list}.`,
        `Based on my visit, here is what stood out at ${business}: ${list}.`,
      ];
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(drafts) }] } }] }), { status: 200 });
}

export async function mockCall(name: 'resolve-public-funnel' | 'track-funnel-event' | 'generate-review-drafts', body: unknown): Promise<HandlerResult> {
  const mode = demoAiMode();
  const cfg = readConfig((k) => ({ GEMINI_API_KEY: 'demo-simulated', AI_ENABLED: mode === 'off' ? 'false' : 'true' } as Record<string, string>)[k]);
  if (name === 'resolve-public-funnel') return resolveFunnel(store, cfg, (body as { slug?: unknown }).slug);
  if (name === 'track-funnel-event') return trackEvent(store, cfg, body, null, Date.now());
  return generateDrafts(store, cfg, { fetch: simulatedProvider, apiKey: 'demo-simulated', now: Date.now() }, body, null);
}
