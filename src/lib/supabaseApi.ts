// Supabase implementation of the dashboard API. Uses only the publishable key: every query is
// subject to the Row Level Security policies in supabase/migrations.
import { createClient, type User } from '@supabase/supabase-js';
import type { AuthUser, Funnel, FunnelInput } from '../types.ts';
import type { Api } from './api.ts';
import { SUPABASE_KEY, SUPABASE_URL } from './env.ts';
import { ApiError, assertLogo } from './errors.ts';
import { randomSuffix } from '../features/funnels/defaults.ts';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const toUser = (u: User | null | undefined): AuthUser | null =>
  u ? { id: u.id, email: u.email ?? '', full_name: (u.user_metadata?.full_name as string | undefined) ?? '' } : null;

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (!res.error) return res.data;
  const { code, message } = res.error;
  if (code === '23505') throw new ApiError('That public link is already in use. Choose another.', 'conflict');
  if (code === '42501') throw new ApiError('You do not have permission to do that.', 'forbidden');
  if (code === 'PGRST116') throw new ApiError('Not found.', 'not_found');
  throw new ApiError(message || 'Something went wrong.', code);
}

function one<T>(res: { data: T; error: { message: string; code?: string } | null }): NonNullable<T> {
  const data = check(res);
  if (data == null) throw new ApiError('Not found.', 'not_found');
  return data;
}

async function callFunction(name: string, body: unknown): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: SUPABASE_KEY, authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    throw new ApiError(err.message ?? 'The request failed.', err.error);
  }
  return res;
}

const FUNNEL_SELECT = '*, attributes:funnel_feedback_attributes(id, label, label_hi, position, enabled), businesses!inner(organization_id)';
function toFunnel(row: Record<string, unknown>): Funnel {
  const { businesses: _businesses, ...f } = row;
  (f.attributes as Funnel['attributes']).sort((a, b) => a.position - b.position);
  return f as unknown as Funnel;
}

export const supabaseApi: Api = {
  async getUser() {
    return toUser((await supabase.auth.getSession()).data.session?.user);
  },
  onAuthChange(cb) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => cb(toUser(session?.user), event));
    return () => data.subscription.unsubscribe();
  },
  async signUp({ email, password, fullName, organizationName }) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, organization_name: organizationName }, emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw new ApiError(error.message, 'auth');
    return { needsEmailConfirmation: !data.session };
  },
  async signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new ApiError(error.message, 'auth');
  },
  async signOut() {
    await supabase.auth.signOut();
  },
  async requestPasswordReset(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?type=recovery` });
    if (error) throw new ApiError(error.message, 'auth');
  },
  async updatePassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new ApiError(error.message, 'auth');
  },
  async updateProfile(fullName) {
    const { data, error } = await supabase.auth.updateUser({ data: { full_name: fullName } });
    if (error) throw new ApiError(error.message, 'auth');
    check(await supabase.from('profiles').update({ full_name: fullName }).eq('id', data.user.id));
  },

  async listOrgs() {
    const user = await this.getUser();
    const rows = check(await supabase.from('organization_members').select('role, organizations(id, name, retention_days)').eq('user_id', user?.id ?? ''));
    return (rows ?? []).map((r) => ({ ...(r.organizations as unknown as { id: string; name: string; retention_days: number }), role: r.role }));
  },
  async createOrg(name) {
    return check(await supabase.rpc('create_organization', { p_name: name }));
  },
  async updateOrg(id, patch) {
    check(await supabase.from('organizations').update(patch).eq('id', id));
  },
  async listMembers(orgId) {
    const rows = check(await supabase.from('organization_members').select('user_id, role, profiles(email, full_name)').eq('organization_id', orgId));
    return (rows ?? []).map((r) => ({ user_id: r.user_id, role: r.role, ...(r.profiles as unknown as { email: string; full_name: string }) }));
  },
  async addMember(orgId, email, role) {
    check(await supabase.rpc('add_member_by_email', { p_org: orgId, p_email: email, p_role: role }));
  },
  async setMemberRole(orgId, userId, role) {
    check(await supabase.from('organization_members').update({ role }).eq('organization_id', orgId).eq('user_id', userId));
  },
  async removeMember(orgId, userId) {
    check(await supabase.from('organization_members').delete().eq('organization_id', orgId).eq('user_id', userId));
  },

  async listBusinesses(orgId) {
    return check(await supabase.from('businesses').select('*').eq('organization_id', orgId).order('created_at')) ?? [];
  },
  async getBusiness(id) {
    return one(await supabase.from('businesses').select('*').eq('id', id).single());
  },
  async saveBusiness(orgId, input, id) {
    return id
      ? one(await supabase.from('businesses').update(input).eq('id', id).select().single())
      : one(await supabase.from('businesses').insert({ ...input, organization_id: orgId }).select().single());
  },
  async setBusinessStatus(id, status) {
    one(await supabase.from('businesses').update({ status }).eq('id', id).select('id').single());
  },
  async uploadLogo(orgId, file) {
    assertLogo(file);
    const path = `${orgId}/${crypto.randomUUID()}.${file.type.split('/')[1]}`;
    const { error } = await supabase.storage.from('logos').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
    if (error) throw new ApiError(error.message, 'upload');
    return supabase.storage.from('logos').getPublicUrl(path).data.publicUrl;
  },

  async listFunnels(orgId) {
    const rows = check(await supabase.from('funnels').select(FUNNEL_SELECT).eq('businesses.organization_id', orgId).order('created_at'));
    return (rows ?? []).map(toFunnel);
  },
  async getFunnel(id) {
    return toFunnel(one(await supabase.from('funnels').select(FUNNEL_SELECT).eq('id', id).single()));
  },
  async saveFunnel(input, id) {
    const { attributes, business_id, ...fields } = input;
    const row = id
      ? one(await supabase.from('funnels').update(fields).eq('id', id).select('id').single())
      : one(await supabase.from('funnels').insert({ ...fields, business_id }).select('id').single());
    const rows = attributes.map((a, position) => ({ id: a.id ?? crypto.randomUUID(), funnel_id: row.id, label: a.label, label_hi: a.label_hi, enabled: a.enabled, position }));
    if (id) {
      // Remove attributes the editor deleted. (Two statements, not one transaction: a failure here leaves extra attributes, never fewer.)
      const stale = supabase.from('funnel_feedback_attributes').delete().eq('funnel_id', id);
      check(await (rows.length ? stale.not('id', 'in', `(${rows.map((r) => r.id).join(',')})`) : stale));
    }
    if (rows.length) check(await supabase.from('funnel_feedback_attributes').upsert(rows));
    return this.getFunnel(row.id);
  },
  async setFunnelStatus(id, status) {
    one(await supabase.from('funnels').update({ status }).eq('id', id).select('id').single());
  },
  async duplicateFunnel(id) {
    const { id: _id, status: _status, published_at: _p, created_at: _c, updated_at: _u, attributes, ...rest } = await this.getFunnel(id);
    const copy: FunnelInput = {
      ...rest,
      name: `${rest.name} (copy)`.slice(0, 120),
      slug: `${rest.slug.slice(0, 44)}-${randomSuffix()}`,
      attributes: attributes.map(({ label, label_hi, enabled }) => ({ label, label_hi, enabled })),
    };
    return this.saveFunnel(copy);
  },

  async analytics(f) {
    const rows = check(await supabase.rpc('analytics_rows', {
      p_org: f.organizationId, p_from: f.from, p_to: f.to, p_business: f.businessId ?? null, p_funnel: f.funnelId ?? null, p_source: f.source ?? null,
    }));
    return rows ?? [];
  },
  async exportAnalyticsCsv(f) {
    return (await callFunction('export-analytics', f)).text();
  },
  async createQrAsset(input) {
    return ((await (await callFunction('create-qr-asset', input)).json()) as { asset: Awaited<ReturnType<Api['createQrAsset']>> }).asset;
  },
  async listQrAssets(orgId) {
    const rows = check(await supabase.from('qr_assets')
      .select('id, funnel_id, kind, layout, target_url, created_at, businesses!inner(organization_id)')
      .eq('businesses.organization_id', orgId).order('created_at', { ascending: false }).limit(50));
    return (rows ?? []).map(({ businesses: _b, ...a }) => a);
  },
};
