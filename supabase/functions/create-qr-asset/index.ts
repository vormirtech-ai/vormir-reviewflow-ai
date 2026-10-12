// Authenticated endpoint. Registers a QR/flyer asset for a PUBLISHED funnel and returns the permanent
// URL the code must encode. The image itself is rendered in the browser (no server-side processing).
import { handle } from '../_shared/http.ts';
import { userClient } from '../_shared/supabaseStore.ts';
import { isUuid } from '../_shared/validate.ts';

const env = (k: string) => Deno.env.get(k);
const bad = (status: number, error: string, message: string) => ({ status, body: { error, message } });
const KINDS = ['qr_png', 'qr_svg', 'flyer_pdf', 'flyer_png'];
const LAYOUTS = ['tabletop', 'poster', 'receipt', 'business_card'];
const HEX = /^#[0-9a-fA-F]{6}$/;

Deno.serve(handle(['POST'], env, 2048, async (req, body) => {
  const { db, token } = userClient(env, req);
  const { data: auth } = await db.auth.getUser(token);
  if (!auth?.user) return bad(401, 'unauthorized', 'Sign in to create assets.');

  const b = (body ?? {}) as Record<string, unknown>;
  const s = (b.settings ?? {}) as Record<string, unknown>;
  if (
    !isUuid(b.funnelId) || !KINDS.includes(b.kind as string) || (b.layout != null && !LAYOUTS.includes(b.layout as string)) ||
    typeof s !== 'object' || (s.fg != null && !HEX.test(String(s.fg))) || (s.bg != null && !HEX.test(String(s.bg)))
  ) {
    return bad(400, 'invalid_request', 'Invalid asset request.');
  }

  // RLS: the row is only visible to members of the owning organization.
  const { data: funnel } = await db.from('funnels').select('id, slug, status, business_id, businesses!inner(organization_id)').eq('id', b.funnelId).maybeSingle();
  if (!funnel) return bad(404, 'not_found', 'Funnel not found.');
  if (funnel.status !== 'published') return bad(409, 'not_published', 'Publish the funnel before creating QR assets.');
  const orgId = (funnel.businesses as unknown as { organization_id: string }).organization_id;

  const { data: allowed, error: gateError } = await db.rpc('audit_rate_limited', {
    p_org: orgId, p_action: 'qr_asset.create', p_min_role: 'editor', p_limit_per_minute: 30, p_entity: funnel.id,
  });
  if (gateError) return bad(403, 'forbidden', 'You do not have permission to create assets.');
  if (!allowed) return bad(429, 'rate_limited', 'Too many requests. Please wait a minute.');

  const site = (env('PUBLIC_SITE_URL') || req.headers.get('origin') || '').replace(/\/$/, '');
  if (!/^https:\/\/|^http:\/\/localhost(:\d+)?$/.test(site)) return bad(500, 'server_error', 'PUBLIC_SITE_URL is not configured.');
  const targetUrl = `${site}/f/${funnel.slug}?src=qr`;

  const { data: asset, error } = await db.from('qr_assets')
    .insert({
      funnel_id: funnel.id, business_id: funnel.business_id, kind: b.kind, layout: b.layout ?? null, target_url: targetUrl,
      settings: { fg: s.fg ?? null, bg: s.bg ?? null, logo: s.logo === true }, created_by: auth.user.id,
    })
    .select('id, kind, layout, target_url, created_at')
    .single();
  if (error) return bad(403, 'forbidden', 'You do not have permission to create assets.');
  return { status: 201, body: { asset } };
}));
