// Deno-only: Postgres-backed Store for the public Edge Functions (service-role client, bypasses RLS,
// so every query here must stay narrowly scoped to published funnels and insert-only analytics).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { toPublicFunnel, type FunnelRow, type Store } from './core.ts';
import type { Env } from './config.ts';

export function serviceClient(env: Env): SupabaseClient {
  return createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Client that acts as the calling user, so Row Level Security applies to everything it does. */
export function userClient(env: Env, req: Request): { db: SupabaseClient; token: string } {
  const authorization = req.headers.get('authorization') ?? '';
  const db = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, {
    global: { headers: { authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { db, token: authorization.replace(/^Bearer\s+/i, '') };
}

const FUNNEL_COLUMNS =
  'id, slug, heading, description, instructions, cta_text, show_logo, primary_color, background_color, languages, ai_enabled, allow_notes, max_selections, max_regenerations, review_url, ' +
  'businesses!inner(id, name, category, logo_url, brand_primary, brand_background, default_language, google_review_url, status), ' +
  'funnel_feedback_attributes(id, label, label_hi, position, enabled)';

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function supabaseStore(db: SupabaseClient): Store {
  return {
    async getPublishedFunnel(slug) {
      const row = must(await db.from('funnels').select(FUNNEL_COLUMNS).eq('slug', slug).eq('status', 'published').maybeSingle());
      return row ? toPublicFunnel(row as unknown as FunnelRow) : null;
    },
    async countGenerations(q) {
      let query = db.from('review_draft_generations').select('id', { count: 'exact', head: true }).gte('created_at', q.sinceIso);
      if (q.funnelId) query = query.eq('funnel_id', q.funnelId);
      if (q.sessionId) query = query.eq('session_id', q.sessionId);
      if (q.ipHash) query = query.eq('ip_hash', q.ipHash);
      if (q.status) query = query.eq('status', q.status);
      const { count, error } = await query;
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async recordGeneration(r) {
      must(await db.from('review_draft_generations').insert({
        funnel_id: r.funnelId, session_id: r.sessionId, ip_hash: r.ipHash, language: r.language, attribute_count: r.attributeCount,
        regenerate: r.regenerate, status: r.status, provider: r.provider, model: r.model,
      }));
    },
    async countEvents(q) {
      let query = db.from('feedback_events').select('id', { count: 'exact', head: true }).eq('funnel_id', q.funnelId).gte('created_at', q.sinceIso);
      if (q.sessionId) query = query.eq('session_id', q.sessionId);
      const { count, error } = await query;
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async recordEvent(e) {
      must(await db.from('funnel_sessions').upsert(
        { id: e.sessionId, funnel_id: e.funnelId, source: e.source, ip_hash: e.ipHash },
        { onConflict: 'id', ignoreDuplicates: true },
      ));
      must(await db.from('feedback_events').insert({
        funnel_id: e.funnelId, business_id: e.businessId, session_id: e.sessionId, event_type: e.type, source: e.source, attribute_id: e.attributeId,
      }));
    },
  };
}
