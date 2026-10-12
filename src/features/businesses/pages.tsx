import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Building2, ExternalLink, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { looksLikeGoogleUrl } from '../../../supabase/functions/_shared/validate.ts';
import { useOrg } from '../../app/shell.tsx';
import { Unauthorized } from '../../components/brand.tsx';
import { errorMessage, useToast } from '../../components/toast.tsx';
import { Badge, Button, buttonClass, Card, EmptyState, ErrorState, Field, Input, LoadingBlock, PageHeader, Select, statusTone, Table, Textarea } from '../../components/ui.tsx';
import { useAction, useBusinesses, useFunnels } from '../../hooks/data.ts';
import { api } from '../../lib/api.ts';
import { publicFunnelUrl } from '../../lib/env.ts';
import { businessSchema, CATEGORIES, categoryLabel, emptyBusiness, toForm, toInput, type BusinessForm } from './schema.ts';

export function BusinessesPage() {
  const { can } = useOrg();
  const businesses = useBusinesses();
  const act = useAction();
  const newLink = can('business.create') && <Link to="/app/businesses/new" className={buttonClass()}>New business</Link>;
  return (
    <>
      <PageHeader title="Businesses" description="The locations and brands you collect feedback for." actions={newLink} />
      {businesses.isPending ? <LoadingBlock /> : businesses.isError ? <ErrorState message={errorMessage(businesses.error)} onRetry={() => businesses.refetch()} />
        : businesses.data.length === 0
          ? <EmptyState icon={Building2} title="No businesses yet" body="Add your first business, then create a feedback funnel and QR code for it." action={newLink} />
          : (
            <Table>
              <thead><tr><th>Name</th><th>Category</th><th>Review link</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {businesses.data.map((b) => (
                  <tr key={b.id}>
                    <td><Link className="font-medium underline-offset-4 hover:underline" to={`/app/businesses/${b.id}`}>{b.name}</Link></td>
                    <td className="text-muted">{categoryLabel(b.category)}</td>
                    <td>{b.google_review_url ? <Badge tone="success">Configured</Badge> : <Badge tone="warning">Missing</Badge>}</td>
                    <td><Badge tone={statusTone(b.status)}>{b.status}</Badge></td>
                    <td className="text-right">
                      {can('business.archive') && (
                        <Button size="sm" variant="ghost" onClick={() => act(() => api.setBusinessStatus(b.id, b.status === 'active' ? 'archived' : 'active'), b.status === 'active' ? 'Business archived' : 'Business restored')}>
                          {b.status === 'active' ? 'Archive' : 'Restore'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
    </>
  );
}

const TIME_ZONES: string[] = (() => {
  try { return Intl.supportedValuesOf('timeZone'); } catch { return ['UTC']; }
})();

export function LogoPicker({ logoUrl, onChange }: { logoUrl: string | null; onChange: (url: string | null) => void }) {
  const { org } = useOrg();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {logoUrl
        ? <img src={logoUrl} alt="Current logo" className="h-14 max-w-32 rounded-control border border-line bg-white object-contain p-1" />
        : <div className="flex h-14 w-14 items-center justify-center rounded-control border border-dashed border-line-strong text-xs text-muted">None</div>}
      <label className={buttonClass('secondary', 'sm')}>
        {busy ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          try { onChange(await api.uploadLogo(org.id, file)); } catch (err) { notify(errorMessage(err), 'error'); }
          setBusy(false);
        }} />
      </label>
      {logoUrl && <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Remove</Button>}
      <span className="text-xs text-muted">PNG, JPEG or WebP, up to 1 MB.</span>
    </div>
  );
}

export function BusinessFormPage() {
  const { id } = useParams();
  const { org, can } = useOrg();
  const navigate = useNavigate();
  const act = useAction();
  const existing = useQuery({ queryKey: ['business', id], queryFn: () => api.getBusiness(id!), enabled: !!id });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<BusinessForm>({ resolver: zodResolver(businessSchema), defaultValues: emptyBusiness });

  useEffect(() => {
    if (existing.data) { reset(toForm(existing.data)); setLogoUrl(existing.data.logo_url); }
  }, [existing.data, reset]);

  if (!can(id ? 'business.update' : 'business.create')) return <Unauthorized />;
  if (id && existing.isPending) return <LoadingBlock />;
  if (id && existing.isError) return <ErrorState message={errorMessage(existing.error)} />;

  const reviewUrl = watch('google_review_url');
  return (
    <>
      <PageHeader title={id ? 'Edit business' : 'New business'} description="These details appear on your customer feedback pages and printed assets." />
      <form noValidate className="space-y-6" onSubmit={handleSubmit(async (values) => {
        let saved = id;
        if (await act(async () => { saved = (await api.saveBusiness(org.id, toInput(values, logoUrl), id)).id; }, 'Business saved')) navigate(`/app/businesses/${saved}`);
      })}>
        <Card className="grid gap-4 md:grid-cols-2">
          <Field label="Business name" error={errors.name?.message}><Input {...register('name')} /></Field>
          <Field label="Category" hint={watch('category') === 'clinic' ? 'Health feedback is sensitive. Do not ask patients to describe conditions or treatment.' : undefined}>
            <Select {...register('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}</Select>
          </Field>
          <Field label="Description" className="md:col-span-2" error={errors.description?.message}><Textarea {...register('description')} /></Field>
          <Field label="Website" error={errors.website?.message}><Input type="url" placeholder="https://" {...register('website')} /></Field>
          <Field label="Contact email (optional)" error={errors.contact_email?.message}><Input type="email" {...register('contact_email')} /></Field>
          <Field label="Contact phone (optional)" error={errors.contact_phone?.message}><Input type="tel" {...register('contact_phone')} /></Field>
          <Field label="Address (optional)" error={errors.address?.message}><Input {...register('address')} /></Field>
          <Field label="Time zone"><Select {...register('time_zone')}>{TIME_ZONES.map((z) => <option key={z}>{z}</option>)}</Select></Field>
          <Field label="Default language"><Select {...register('default_language')}><option value="en">English</option><option value="hi">Hindi</option></Select></Field>
        </Card>

        <Card className="grid gap-4 md:grid-cols-2">
          <h2 className="font-semibold md:col-span-2">Google review destination</h2>
          <Field label="Official Google review URL" className="md:col-span-2" error={errors.google_review_url?.message}
            hint={reviewUrl && !errors.google_review_url && !looksLikeGoogleUrl(reviewUrl)
              ? 'This does not look like a Google link. Double-check it is your official review link.'
              : 'Paste the "Ask for reviews" link from your Google Business Profile. Entered manually; no Google sign-in is needed.'}>
            <div className="flex gap-2">
              <Input type="url" placeholder="https://g.page/r/…/review" {...register('google_review_url')} />
              <a href={reviewUrl || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!reviewUrl} className={buttonClass('secondary')}>Test<ExternalLink className="size-3.5" aria-hidden /></a>
            </div>
          </Field>
          <Field label="Google place ID (optional)" error={errors.google_place_id?.message}><Input {...register('google_place_id')} /></Field>
        </Card>

        <Card className="grid gap-4 md:grid-cols-2">
          <h2 className="font-semibold md:col-span-2">Branding</h2>
          <div className="md:col-span-2"><LogoPicker logoUrl={logoUrl} onChange={setLogoUrl} /></div>
          <Field label="Primary colour" error={errors.brand_primary?.message}><Input type="color" className="h-10 p-1" {...register('brand_primary')} /></Field>
          <Field label="Background colour" error={errors.brand_background?.message}><Input type="color" className="h-10 p-1" {...register('brand_background')} /></Field>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" loading={isSubmitting}>Save business</Button>
          <Link to={id ? `/app/businesses/${id}` : '/app/businesses'} className={buttonClass('ghost')}>Cancel</Link>
        </div>
      </form>
    </>
  );
}

export function BusinessDetailPage() {
  const { id = '' } = useParams();
  const { can } = useOrg();
  const act = useAction();
  const business = useQuery({ queryKey: ['business', id], queryFn: () => api.getBusiness(id) });
  const funnels = useFunnels();
  if (business.isPending) return <LoadingBlock />;
  if (business.isError) return <ErrorState message={errorMessage(business.error)} />;
  const b = business.data;
  const own = (funnels.data ?? []).filter((f) => f.business_id === b.id);
  const live = own.find((f) => f.status === 'published');
  return (
    <>
      <PageHeader title={b.name} description={`${categoryLabel(b.category)} · ${b.time_zone}`}
        actions={<>
          {live && <a className={buttonClass('secondary')} href={publicFunnelUrl(live.slug)} target="_blank" rel="noopener noreferrer">Preview public funnel</a>}
          {can('business.update') && <Link className={buttonClass('secondary')} to={`/app/businesses/${b.id}/edit`}>Edit</Link>}
          {can('business.archive') && (
            <Button variant="ghost" onClick={() => act(() => api.setBusinessStatus(b.id, b.status === 'active' ? 'archived' : 'active'), b.status === 'active' ? 'Business archived' : 'Business restored')}>
              {b.status === 'active' ? 'Archive' : 'Restore'}
            </Button>
          )}
        </>} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center gap-3">
            {b.logo_url && <img src={b.logo_url} alt="" className="h-12 max-w-28 rounded-control bg-white object-contain p-1" />}
            <Badge tone={statusTone(b.status)}>{b.status}</Badge>
          </div>
          <p className="text-sm text-silver">{b.description || 'No description yet.'}</p>
          <dl className="mt-4 space-y-1 text-sm text-muted">
            {b.website && <div><dt className="inline">Website: </dt><dd className="inline break-all">{b.website}</dd></div>}
            {b.address && <div><dt className="inline">Address: </dt><dd className="inline">{b.address}</dd></div>}
            <div><dt className="inline">Language: </dt><dd className="inline">{b.default_language === 'hi' ? 'Hindi' : 'English'}</dd></div>
          </dl>
        </Card>
        <Card>
          <h2 className="font-semibold">Google review destination</h2>
          {b.google_review_url
            ? <>
                <p className="mt-2 break-all text-sm text-silver">{b.google_review_url}</p>
                <a className={`${buttonClass('secondary', 'sm')} mt-3`} href={b.google_review_url} target="_blank" rel="noopener noreferrer">Test destination<ExternalLink className="size-3.5" aria-hidden /></a>
              </>
            : <p className="mt-2 text-sm text-warning">No review URL yet. Funnels for this business cannot be published until you add one.</p>}
          {b.status === 'archived' && <p className="mt-3 text-sm text-warning">Archived: this business's public funnels are offline until it is restored.</p>}
        </Card>
      </div>
      <div className="mt-8 mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Funnels</h2>
        {can('funnel.write') && <Link className={buttonClass('secondary', 'sm')} to={`/app/funnels/new?business=${b.id}`}>New funnel</Link>}
      </div>
      {own.length === 0
        ? <EmptyState icon={Workflow} title="No funnels for this business" body="A funnel is the feedback page your customers open from a QR code or link." />
        : (
          <Table>
            <thead><tr><th>Name</th><th>Public link</th><th>Status</th></tr></thead>
            <tbody>{own.map((f) => (
              <tr key={f.id}>
                <td><Link className="font-medium underline-offset-4 hover:underline" to={`/app/funnels/${f.id}`}>{f.name}</Link></td>
                <td className="text-muted">/f/{f.slug}</td>
                <td><Badge tone={statusTone(f.status)}>{f.status}</Badge></td>
              </tr>
            ))}</tbody>
          </Table>
        )}
    </>
  );
}
