// Authenticated endpoint. Runs as the calling user, so RLS decides what can be read.
import { toCsv, validDateRange, type AnalyticsRow } from '../_shared/analytics.ts';
import { handle, text } from '../_shared/http.ts';
import { userClient } from '../_shared/supabaseStore.ts';
import { isUuid, SOURCE_RE } from '../_shared/validate.ts';

const env = (k: string) => Deno.env.get(k);
const bad = (status: number, error: string, message: string) => ({ status, body: { error, message } });

Deno.serve(handle(['POST'], env, 1024, async (req, body) => {
  const { db, token } = userClient(env, req);
  const { data: auth } = await db.auth.getUser(token);
  if (!auth?.user) return bad(401, 'unauthorized', 'Sign in to export analytics.');

  const b = (body ?? {}) as Record<string, unknown>;
  const optionalId = (v: unknown) => v == null || isUuid(v);
  if (
    !isUuid(b.organizationId) || !validDateRange(b.from, b.to) || !optionalId(b.businessId) || !optionalId(b.funnelId) ||
    (b.source != null && (typeof b.source !== 'string' || !SOURCE_RE.test(b.source)))
  ) {
    return bad(400, 'invalid_request', 'Invalid export filters.');
  }

  // Membership check, audit entry and per-user rate limit in one authorised database call.
  const { data: allowed, error: gateError } = await db.rpc('audit_rate_limited', {
    p_org: b.organizationId, p_action: 'analytics.export', p_min_role: 'analyst', p_limit_per_minute: 10,
  });
  if (gateError) return bad(403, 'forbidden', 'You do not have access to this organization.');
  if (!allowed) return bad(429, 'rate_limited', 'Too many exports. Please wait a minute.');

  const { data: rows, error } = await db.rpc('analytics_rows', {
    p_org: b.organizationId, p_from: b.from, p_to: b.to,
    p_business: b.businessId ?? null, p_funnel: b.funnelId ?? null, p_source: b.source ?? null,
  });
  if (error) throw new Error(error.message);

  const names: Record<string, string> = {};
  const { data: businesses } = await db.from('businesses').select('id, name, funnels(id, name)').eq('organization_id', b.organizationId);
  for (const biz of (businesses ?? []) as { id: string; name: string; funnels: { id: string; name: string }[] }[]) {
    names[biz.id] = biz.name;
    for (const f of biz.funnels) names[f.id] = f.name;
  }
  return text(env, toCsv((rows ?? []) as AnalyticsRow[], names), 'text/csv; charset=utf-8', `reviewflow-analytics-${b.from}-to-${b.to}.csv`);
}));
