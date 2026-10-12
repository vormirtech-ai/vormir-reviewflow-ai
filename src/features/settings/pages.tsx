import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { summarize } from '../../../supabase/functions/_shared/analytics.ts';
import { toPublicFunnel } from '../../../supabase/functions/_shared/core.ts';
import { ROLES, type Role } from '../../../supabase/functions/_shared/roles.ts';
import { useAuth, useOrg } from '../../app/shell.tsx';
import { Badge, Button, buttonClass, Card, ErrorState, Field, Input, LoadingBlock, PageHeader, Select, Table } from '../../components/ui.tsx';
import { useAction, useBusinesses, useFunnels } from '../../hooks/data.ts';
import { api } from '../../lib/api.ts';
import { DEMO_AI_KEY, FREE_MODE, isDemo } from '../../lib/env.ts';
import { daysAgo, isoDay, Stat } from '../analytics/shared.tsx';
import { LogoPicker } from '../businesses/pages.tsx';
import { toBusinessInput } from '../businesses/schema.ts';
import { FunnelView } from '../feedback/FunnelView.tsx';
import { defaultFunnel } from '../funnels/defaults.ts';

export function DashboardPage() {
  const { org } = useOrg();
  const businesses = useBusinesses();
  const funnels = useFunnels();
  const filters = { organizationId: org.id, from: daysAgo(29), to: isoDay(new Date()) };
  const rows = useQuery({ queryKey: ['analytics', filters], queryFn: () => api.analytics(filters) });
  if (businesses.isPending || funnels.isPending) return <LoadingBlock />;
  if (businesses.isError || funnels.isError) return <ErrorState onRetry={() => { businesses.refetch(); funnels.refetch(); }} />;

  const summary = summarize(rows.data ?? []);
  const steps: [string, boolean, string][] = [
    ['Add a business', businesses.data.length > 0, '/app/businesses/new'],
    ['Add its official Google review URL', businesses.data.some((b) => b.google_review_url), '/app/businesses'],
    ['Publish a feedback funnel', funnels.data.some((f) => f.status === 'published'), '/app/funnels'],
    ['Share the QR code and get a first visit', summary.visits > 0, '/app/qr-assets'],
  ];
  return (
    <>
      <PageHeader title="Dashboard" description={`${org.name} · last 30 days`} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Businesses" value={businesses.data.filter((b) => b.status === 'active').length} />
        <Stat label="Published funnels" value={funnels.data.filter((f) => f.status === 'published').length} />
        <Stat label="Funnel visits" value={rows.isPending ? '…' : summary.visits} />
        <Stat label="Outbound Google clicks" value={rows.isPending ? '…' : summary.googleClicks} note="Clicks, not published reviews" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Getting started</h2>
          <ol className="space-y-2">
            {steps.map(([label, done, to]) => (
              <li key={label} className="flex items-center gap-3 text-sm">
                {done ? <CheckCircle2 className="size-4 text-success" aria-label="Done" /> : <Circle className="size-4 text-muted" aria-label="To do" />}
                {done ? <span className="text-muted">{label}</span> : <Link className="underline underline-offset-4" to={to}>{label}</Link>}
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">How to read these numbers</h2>
          <p className="text-sm text-silver">
            ReviewFlow counts anonymous visits and button clicks on your own feedback pages. It cannot see inside Google, so a click on
            "Continue to Google Reviews" is never reported as a published review.
          </p>
          <Link to="/app/analytics" className={`${buttonClass('secondary', 'sm')} mt-4`}>Open analytics</Link>
        </Card>
      </div>
    </>
  );
}

export function CustomizationPage() {
  const { can } = useOrg();
  const businesses = useBusinesses();
  const funnels = useFunnels();
  const act = useAction();
  const [id, setId] = useState('');
  const business = businesses.data?.find((b) => b.id === id) ?? businesses.data?.[0];
  const [draft, setDraft] = useState({ brand_primary: '#111111', brand_background: '#ffffff', logo_url: null as string | null });

  useEffect(() => {
    if (business) setDraft({ brand_primary: business.brand_primary, brand_background: business.brand_background, logo_url: business.logo_url });
  }, [business]);

  if (businesses.isPending) return <LoadingBlock />;
  if (!business) {
    return <><PageHeader title="Customization" /><ErrorState message="Add a business first, then customise how its feedback pages look." /></>;
  }
  const sample = funnels.data?.find((f) => f.business_id === business.id);
  const base = sample ?? { ...defaultFunnel(business), id: 'preview', attributes: defaultFunnel(business).attributes.map((a, i) => ({ ...a, id: `a-${i}`, position: i })) };
  const preview = toPublicFunnel({
    ...base, review_url: base.review_url || business.google_review_url || 'https://www.google.com/maps', primary_color: null, background_color: null, ai_enabled: false,
    businesses: { ...business, ...draft, status: 'active' }, funnel_feedback_attributes: base.attributes as Parameters<typeof toPublicFunnel>[0]['funnel_feedback_attributes'],
  });
  const editable = can('business.update');
  return (
    <>
      <PageHeader title="Customization" description="Brand colours and logo used on a business's feedback pages and printed assets." />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="space-y-4 self-start">
          <Field label="Business">
            <Select value={business.id} onChange={(e) => setId(e.target.value)}>{(businesses.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
          </Field>
          <fieldset disabled={!editable} className="space-y-4">
            <LogoPicker logoUrl={draft.logo_url} onChange={(logo_url) => setDraft({ ...draft, logo_url })} />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Primary colour"><Input type="color" className="h-10 p-1" value={draft.brand_primary} onChange={(e) => setDraft({ ...draft, brand_primary: e.target.value })} /></Field>
              <Field label="Background colour"><Input type="color" className="h-10 p-1" value={draft.brand_background} onChange={(e) => setDraft({ ...draft, brand_background: e.target.value })} /></Field>
            </div>
            <Button onClick={() => act(() => api.saveBusiness(business.organization_id, { ...toBusinessInput(business), ...draft }, business.id), 'Branding saved')}>Save branding</Button>
          </fieldset>
          {!editable && <p className="text-xs text-muted">Your role can view branding but not change it.</p>}
          <p className="text-xs text-muted">A funnel can override these colours in its own settings.</p>
        </Card>
        <aside aria-label="Preview">
          <p className="eyebrow mb-2">Preview</p>
          <div className="h-[36rem] overflow-y-auto rounded-[1.5rem] border-4 border-line-strong [&>div]:min-h-full">
            {preview && <FunnelView funnel={preview} aiAvailable={false} maxNoteChars={500} onTrack={() => {}} generate={async () => ({ ok: false, code: 'preview', message: '' })} />}
          </div>
        </aside>
      </div>
    </>
  );
}

function Members() {
  const { org, can } = useOrg();
  const { user } = useAuth();
  const act = useAction();
  const members = useQuery({ queryKey: ['members', org.id], queryFn: () => api.listMembers(org.id) });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('analyst');
  const manage = can('members.manage');
  return (
    <Card>
      <h2 className="mb-1 font-semibold">Members</h2>
      <p className="mb-4 text-xs text-muted">Owner: everything. Admin: businesses, funnels, assets. Editor: edit businesses and funnels. Analyst: view analytics only.</p>
      {members.isPending ? <LoadingBlock /> : members.isError ? <ErrorState onRetry={() => members.refetch()} /> : (
        <Table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{members.data.map((m) => (
            <tr key={m.user_id}>
              <td>{m.full_name || '–'}{m.user_id === user?.id && <span className="text-muted"> (you)</span>}</td>
              <td className="text-muted">{m.email}</td>
              <td>{manage
                ? <Select aria-label={`Role for ${m.email}`} className="!w-auto" value={m.role} onChange={(e) => act(() => api.setMemberRole(org.id, m.user_id, e.target.value as Role), 'Role updated')}>{ROLES.map((r) => <option key={r}>{r}</option>)}</Select>
                : <Badge>{m.role}</Badge>}</td>
              <td className="text-right">{manage && m.user_id !== user?.id && <Button size="sm" variant="ghost" onClick={() => act(() => api.removeMember(org.id, m.user_id), 'Member removed')}>Remove</Button>}</td>
            </tr>
          ))}</tbody>
        </Table>
      )}
      {manage && (
        <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (await act(() => api.addMember(org.id, email, role), 'Member added')) setEmail(''); }}>
          <Field label="Add a member by email" className="min-w-56 flex-1" hint="They must already have a ReviewFlow account. No invitation email is sent.">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Select aria-label="Role" className="!w-auto" value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</Select>
          <Button type="submit" variant="secondary">Add</Button>
        </form>
      )}
    </Card>
  );
}

export function SettingsPage() {
  const { org, can, selectOrg } = useOrg();
  const { user } = useAuth();
  const act = useAction();
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [orgName, setOrgName] = useState(org.name);
  const [retention, setRetention] = useState(org.retention_days);
  const [newOrg, setNewOrg] = useState('');
  const [demoAi, setDemoAi] = useState(() => localStorage.getItem(DEMO_AI_KEY) ?? 'ok');

  useEffect(() => { setOrgName(org.name); setRetention(org.retention_days); }, [org]);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <Card>
          <h2 className="mb-4 font-semibold">Your profile</h2>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act(() => api.updateProfile(fullName.trim()), 'Profile saved'); }}>
            <Field label="Name" className="min-w-56 flex-1"><Input required maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
            <Field label="Email" className="min-w-56 flex-1"><Input readOnly value={user?.email ?? ''} className="opacity-60" /></Field>
            <Button type="submit" variant="secondary">Save</Button>
          </form>
          <div className="mt-4 flex gap-2 border-t border-line pt-4">
            <Link to="/forgot-password" className={buttonClass('ghost', 'sm')}>Change password</Link>
            <Button size="sm" variant="ghost" onClick={() => api.signOut()}>Log out</Button>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">Organization</h2>
          <form className="grid gap-4 md:grid-cols-[1fr_14rem_auto] md:items-end" onSubmit={(e) => { e.preventDefault(); act(() => api.updateOrg(org.id, { name: orgName.trim(), retention_days: retention }), 'Organization saved'); }}>
            <Field label="Organization name"><Input required maxLength={120} disabled={!can('org.manage')} value={orgName} onChange={(e) => setOrgName(e.target.value)} /></Field>
            <Field label="Analytics retention (days)" hint="30 to 1095. Older anonymous events are deleted by the scheduled clean-up.">
              <Input type="number" min={30} max={1095} required disabled={!can('org.manage')} value={retention} onChange={(e) => setRetention(Number(e.target.value))} />
            </Field>
            {can('org.manage') && <Button type="submit" variant="secondary">Save</Button>}
          </form>
          <form className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4" onSubmit={async (e) => {
            e.preventDefault();
            let id = '';
            if (await act(async () => { id = await api.createOrg(newOrg.trim()); }, 'Organization created')) { selectOrg(id); setNewOrg(''); }
          }}>
            <Field label="Create another organization" className="min-w-56 flex-1" hint="For agencies managing separate client accounts."><Input required maxLength={120} value={newOrg} onChange={(e) => setNewOrg(e.target.value)} /></Field>
            <Button type="submit" variant="secondary">Create</Button>
          </form>
        </Card>

        <Members />

        <Card>
          <h2 className="mb-3 font-semibold">Plan and AI status</h2>
          <ul className="space-y-2 text-sm text-silver">
            <li><Badge tone="success">FREE_MODE {FREE_MODE ? 'on' : 'off'}</Badge> No billing, no payment details, no paid upgrades in this app.</li>
            <li><Badge tone="success">Paid AI prohibited</Badge> The server refuses any paid AI provider unless an administrator sets FREE_MODE=false and ALLOW_PAID_AI=true.</li>
            <li><Badge>{isDemo ? 'Demo backend' : 'Supabase backend'}</Badge> {isDemo ? 'No cloud project configured; data stays in this browser.' : 'AI drafts come from the generate-review-drafts Edge Function using the server-side Gemini key.'}</li>
          </ul>
          <p className="mt-3 text-xs text-muted">Free tiers have quotas that can change. When the AI quota runs out, customers still get templates and manual writing. See the README for limits and possible future costs.</p>
          {isDemo && (
            <Field label="Demo: simulated AI provider" className="mt-4 max-w-xs" hint="Try the fallback journey without a real API.">
              <Select value={demoAi} onChange={(e) => { localStorage.setItem(DEMO_AI_KEY, e.target.value); setDemoAi(e.target.value); }}>
                <option value="ok">Working (simulated drafts)</option>
                <option value="quota">Quota exhausted</option>
                <option value="off">AI disabled</option>
              </Select>
            </Field>
          )}
        </Card>
      </div>
    </>
  );
}
