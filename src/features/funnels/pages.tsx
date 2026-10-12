import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2, Workflow } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { toPublicFunnel } from '../../../supabase/functions/_shared/core.ts';
import { SLUG_RE } from '../../../supabase/functions/_shared/validate.ts';
import { useOrg } from '../../app/shell.tsx';
import { errorMessage, useToast } from '../../components/toast.tsx';
import { Badge, Button, buttonClass, Card, Checkbox, EmptyState, ErrorState, Field, Input, LoadingBlock, PageHeader, Select, statusTone, Table, Textarea } from '../../components/ui.tsx';
import { copyText, useAction, useBusinesses, useFunnels } from '../../hooks/data.ts';
import { api } from '../../lib/api.ts';
import { publicFunnelUrl } from '../../lib/env.ts';
import type { Business, Funnel, FunnelInput } from '../../types.ts';
import { HEX, httpsOrEmpty } from '../businesses/schema.ts';
import { FunnelView } from '../feedback/FunnelView.tsx';
import { defaultFunnel } from './defaults.ts';

function FunnelActions({ funnel }: { funnel: Funnel }) {
  const act = useAction();
  const notify = useToast();
  const navigate = useNavigate();
  const { can } = useOrg();
  const url = publicFunnelUrl(funnel.slug);
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={async () => notify((await copyText(url)) ? 'Public link copied' : url)}>Copy link</Button>
      {can('funnel.write') && <>
        {funnel.status === 'published'
          ? <Button size="sm" variant="ghost" onClick={() => act(() => api.setFunnelStatus(funnel.id, 'draft'), 'Funnel unpublished')}>Unpublish</Button>
          : <Button size="sm" variant="ghost" onClick={() => act(() => api.setFunnelStatus(funnel.id, 'published'), 'Funnel published')}>Publish</Button>}
        <Button size="sm" variant="ghost" onClick={() => act(async () => navigate(`/app/funnels/${(await api.duplicateFunnel(funnel.id)).id}`), 'Funnel duplicated as a draft')}>Duplicate</Button>
        {funnel.status !== 'archived' && <Button size="sm" variant="ghost" onClick={() => act(() => api.setFunnelStatus(funnel.id, 'archived'), 'Funnel archived')}>Archive</Button>}
      </>}
    </div>
  );
}

export function FunnelsPage() {
  const { can } = useOrg();
  const funnels = useFunnels();
  const businesses = useBusinesses();
  const names = new Map((businesses.data ?? []).map((b) => [b.id, b.name]));
  const newLink = can('funnel.write') && <Link to="/app/funnels/new" className={buttonClass()}>New funnel</Link>;
  return (
    <>
      <PageHeader title="Funnels" description="Feedback pages your customers open from a QR code or link." actions={newLink} />
      {funnels.isPending ? <LoadingBlock /> : funnels.isError ? <ErrorState message={errorMessage(funnels.error)} onRetry={() => funnels.refetch()} />
        : funnels.data.length === 0
          ? <EmptyState icon={Workflow} title="No funnels yet" body={businesses.data?.length ? 'Create a funnel, publish it, and download its QR code.' : 'Add a business first, then create a funnel for it.'}
              action={businesses.data?.length ? newLink : <Link to="/app/businesses/new" className={buttonClass()}>Add a business</Link>} />
          : (
            <Table>
              <thead><tr><th>Name</th><th>Business</th><th>Public link</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{funnels.data.map((f) => (
                <tr key={f.id}>
                  <td><Link className="font-medium underline-offset-4 hover:underline" to={`/app/funnels/${f.id}`}>{f.name}</Link></td>
                  <td className="text-muted">{names.get(f.business_id) ?? ''}</td>
                  <td>{f.status === 'published'
                    ? <a className="underline underline-offset-4" href={publicFunnelUrl(f.slug)} target="_blank" rel="noopener noreferrer">/f/{f.slug}</a>
                    : <span className="text-muted">/f/{f.slug}</span>}</td>
                  <td><Badge tone={statusTone(f.status)}>{f.status}</Badge></td>
                  <td><FunnelActions funnel={f} /></td>
                </tr>
              ))}</tbody>
            </Table>
          )}
    </>
  );
}

const hex = z.string().regex(HEX);
const funnelSchema = z.object({
  business_id: z.string().min(1, 'Choose a business'),
  name: z.string().trim().min(1, 'Enter a name').max(120),
  slug: z.string().regex(SLUG_RE, '3 to 50 lowercase letters, numbers or hyphens'),
  heading: z.string().max(120),
  description: z.string().max(400),
  instructions: z.string().max(400),
  cta_text: z.string().trim().min(1, 'Enter the button text').max(60),
  languages: z.array(z.enum(['en', 'hi'])).min(1, 'Choose at least one language'),
  show_logo: z.boolean(),
  custom_colors: z.boolean(),
  primary_color: hex,
  background_color: hex,
  ai_enabled: z.boolean(),
  allow_notes: z.boolean(),
  max_selections: z.number('Enter a number').int().min(1).max(8),
  max_regenerations: z.number('Enter a number').int().min(0).max(5),
  review_url: httpsOrEmpty,
  qr_fg: hex,
  qr_bg: hex,
  qr_logo: z.boolean(),
  attributes: z.array(z.object({
    id: z.string().optional(),
    label: z.string().trim().min(1, 'Required').max(60),
    label_hi: z.string().max(60),
    enabled: z.boolean(),
  })).min(1, 'Add at least one attribute').max(20),
});
type FunnelForm = z.infer<typeof funnelSchema>;

function toForm(f: FunnelInput, business?: Business): FunnelForm {
  return {
    ...f,
    custom_colors: !!(f.primary_color || f.background_color),
    primary_color: f.primary_color ?? business?.brand_primary ?? '#111111',
    background_color: f.background_color ?? business?.brand_background ?? '#ffffff',
    review_url: f.review_url ?? '',
    qr_fg: f.qr_settings.fg ?? '#000000',
    qr_bg: f.qr_settings.bg ?? '#ffffff',
    qr_logo: f.qr_settings.logo ?? false,
    attributes: f.attributes.map((a) => ({ id: a.id, label: a.label, label_hi: a.label_hi ?? '', enabled: a.enabled })),
  };
}

function toInput(v: FunnelForm): FunnelInput {
  const { custom_colors, qr_fg, qr_bg, qr_logo, ...rest } = v;
  return {
    ...rest,
    primary_color: custom_colors ? v.primary_color : null,
    background_color: custom_colors ? v.background_color : null,
    review_url: v.review_url || null,
    qr_settings: { fg: qr_fg, bg: qr_bg, logo: qr_logo },
    attributes: v.attributes.map((a) => ({ id: a.id, label: a.label, label_hi: a.label_hi.trim() || null, enabled: a.enabled })),
  };
}

const blank: FunnelForm = toForm({ ...defaultFunnel({ id: '', name: '', default_language: 'en' } as Business), slug: '' });

export function FunnelBuilderPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { can } = useOrg();
  const navigate = useNavigate();
  const act = useAction();
  const notify = useToast();
  const businesses = useBusinesses();
  const existing = useQuery({ queryKey: ['funnel', id], queryFn: () => api.getFunnel(id!), enabled: !!id });
  const form = useForm<FunnelForm>({ resolver: zodResolver(funnelSchema), defaultValues: blank });
  const { register, handleSubmit, reset, watch, control, formState: { errors, isSubmitting } } = form;
  const attributes = useFieldArray({ control, name: 'attributes' });
  const active = useMemo(() => (businesses.data ?? []).filter((b) => b.status === 'active'), [businesses.data]);

  // Existing funnel: load it. New funnel: start from sensible defaults for the chosen business.
  useEffect(() => {
    if (id) {
      if (existing.data) reset(toForm(existing.data, businesses.data?.find((b) => b.id === existing.data.business_id)));
    } else if (active.length && !form.getValues('business_id')) {
      const business = active.find((b) => b.id === params.get('business')) ?? active[0];
      reset(toForm(defaultFunnel(business), business));
    }
  }, [id, existing.data, businesses.data, active, params, reset, form]);

  if (businesses.isPending || (id && existing.isPending)) return <LoadingBlock />;
  if (businesses.isError || existing.isError) return <ErrorState message={errorMessage(businesses.error ?? existing.error)} />;
  if (!id && active.length === 0) {
    return <EmptyState icon={Workflow} title="Add a business first" body="A funnel belongs to a business. Create one, then come back here."
      action={<Link to="/app/businesses/new" className={buttonClass()}>Add a business</Link>} />;
  }

  const values = watch();
  const funnel = existing.data;
  const business = businesses.data.find((b) => b.id === values.business_id);
  const readOnly = !can('funnel.write');
  const slugLocked = !!funnel?.published_at;
  const hasReviewUrl = !!(values.review_url || business?.google_review_url);

  const preview = business && toPublicFunnel({
    id: 'preview', slug: 'preview', heading: values.heading, description: values.description, instructions: values.instructions,
    cta_text: values.cta_text || 'Share your feedback', show_logo: values.show_logo,
    primary_color: values.custom_colors ? values.primary_color : null, background_color: values.custom_colors ? values.background_color : null,
    languages: values.languages?.length ? values.languages : ['en'], ai_enabled: false, allow_notes: values.allow_notes,
    max_selections: values.max_selections || 1, max_regenerations: 0,
    review_url: values.review_url || business.google_review_url || 'https://www.google.com/maps',
    businesses: { ...business, status: 'active' },
    funnel_feedback_attributes: (values.attributes ?? []).map((a, i) => ({ id: a.id ?? `new-${i}`, label: a.label || '…', label_hi: a.label_hi || null, position: i, enabled: a.enabled })),
  });

  const save = (publish: boolean) => handleSubmit(async (v) => {
    let saved = funnel?.id;
    const ok = await act(async () => {
      saved = (await api.saveFunnel(toInput(v), funnel?.id)).id;
      if (publish) await api.setFunnelStatus(saved, 'published');
    }, publish ? 'Funnel published' : 'Funnel saved');
    if (saved && (ok || !funnel)) navigate(`/app/funnels/${saved}`, { replace: true });
  });
  const url = publicFunnelUrl(values.slug || 'your-link');

  return (
    <>
      <PageHeader title={funnel ? funnel.name : 'New funnel'} description={funnel ? undefined : 'Configure the page your customers will see, then publish it.'}
        actions={funnel && <>
          <Badge tone={statusTone(funnel.status)}>{funnel.status}</Badge>
          <Button size="sm" variant="secondary" onClick={async () => notify((await copyText(publicFunnelUrl(funnel.slug))) ? 'Public link copied' : publicFunnelUrl(funnel.slug))}>Copy public URL</Button>
          {!readOnly && <Button size="sm" variant="secondary" onClick={() => act(async () => navigate(`/app/funnels/${(await api.duplicateFunnel(funnel.id)).id}`), 'Funnel duplicated as a draft')}>Duplicate</Button>}
          {!readOnly && funnel.status === 'published' && <Button size="sm" variant="secondary" onClick={() => act(() => api.setFunnelStatus(funnel.id, 'draft'), 'Funnel unpublished')}>Unpublish</Button>}
          {!readOnly && funnel.status !== 'archived' && <Button size="sm" variant="danger" onClick={() => act(() => api.setFunnelStatus(funnel.id, 'archived'), 'Funnel archived')}>Archive</Button>}
        </>} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <form noValidate className="space-y-6" onSubmit={save(false)}>
          <fieldset disabled={readOnly} className="space-y-6">
            <Card className="grid gap-4 md:grid-cols-2">
              <Field label="Business" error={errors.business_id?.message}>
                <Select {...register('business_id')} disabled={!!funnel}>
                  {(funnel ? businesses.data : active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
              <Field label="Funnel name" error={errors.name?.message} hint="Only you see this."><Input {...register('name')} /></Field>
              <Field label="Public link" className="md:col-span-2" error={errors.slug?.message}
                hint={slugLocked ? `Permanent, so printed QR codes keep working: ${url}` : `${url} · becomes permanent once published.`}>
                <Input {...register('slug')} readOnly={slugLocked} aria-readonly={slugLocked} className={slugLocked ? 'opacity-60' : ''} />
              </Field>
            </Card>

            <Card className="grid gap-4">
              <h2 className="font-semibold">Welcome screen</h2>
              <Field label="Heading" error={errors.heading?.message}><Input {...register('heading')} /></Field>
              <Field label="Description" error={errors.description?.message}><Textarea rows={2} {...register('description')} /></Field>
              <Field label="Instructions" error={errors.instructions?.message}><Textarea rows={2} {...register('instructions')} /></Field>
              <Field label="Button text" error={errors.cta_text?.message}><Input {...register('cta_text')} /></Field>
            </Card>

            <Card>
              <div className="mb-1 flex items-center justify-between">
                <h2 className="font-semibold">Feedback attributes</h2>
                <Button size="sm" variant="secondary" onClick={() => attributes.append({ label: '', label_hi: '', enabled: true })}><Plus className="size-3.5" aria-hidden />Add</Button>
              </div>
              <p className="mb-4 text-xs text-muted">Describe aspects of a visit, not a verdict. Keep at least one option for criticism so every customer can answer honestly.</p>
              <ul className="space-y-2">
                {attributes.fields.map((field, i) => (
                  <li key={field.id} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                    <div>
                      <Input aria-label={`Attribute ${i + 1} label`} placeholder="Label" {...register(`attributes.${i}.label`)} />
                      {errors.attributes?.[i]?.label && <p role="alert" className="mt-1 text-xs text-danger">{errors.attributes[i].label.message}</p>}
                    </div>
                    <Input aria-label={`Attribute ${i + 1} Hindi label`} placeholder="Hindi label (optional)" lang="hi" {...register(`attributes.${i}.label_hi`)} />
                    <div className="flex items-center gap-1">
                      <label className="flex items-center gap-1 px-1 text-xs text-muted"><input type="checkbox" className="size-4 accent-white" aria-label={`Attribute ${i + 1} enabled`} {...register(`attributes.${i}.enabled`)} />On</label>
                      <Button size="sm" variant="ghost" aria-label={`Move attribute ${i + 1} up`} disabled={i === 0} onClick={() => attributes.move(i, i - 1)}><ArrowUp className="size-3.5" /></Button>
                      <Button size="sm" variant="ghost" aria-label={`Move attribute ${i + 1} down`} disabled={i === attributes.fields.length - 1} onClick={() => attributes.move(i, i + 1)}><ArrowDown className="size-3.5" /></Button>
                      <Button size="sm" variant="ghost" aria-label={`Remove attribute ${i + 1}`} onClick={() => attributes.remove(i)}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </li>
                ))}
              </ul>
              {errors.attributes?.message && <p role="alert" className="mt-2 text-xs text-danger">{errors.attributes.message}</p>}
            </Card>

            <Card className="grid gap-4 md:grid-cols-2">
              <h2 className="font-semibold md:col-span-2">Behaviour</h2>
              <Field label="Maximum attribute selections" error={errors.max_selections?.message}><Input type="number" min={1} max={8} {...register('max_selections', { valueAsNumber: true })} /></Field>
              <Field label="Regenerations per visitor" error={errors.max_regenerations?.message} hint="Server limits may be lower."><Input type="number" min={0} max={5} {...register('max_regenerations', { valueAsNumber: true })} /></Field>
              <Checkbox label="Offer AI draft suggestions" {...register('ai_enabled')} />
              <Checkbox label="Allow optional customer notes" {...register('allow_notes')} />
              <fieldset className="md:col-span-2">
                <legend className="mb-1.5 text-sm font-medium text-silver">Languages</legend>
                <div className="flex gap-4">
                  <Checkbox label="English" value="en" {...register('languages')} />
                  <Checkbox label="Hindi" value="hi" {...register('languages')} />
                </div>
                {errors.languages && <p role="alert" className="mt-1 text-xs text-danger">{errors.languages.message}</p>}
              </fieldset>
              <Field label="Google review URL for this funnel (optional)" className="md:col-span-2" error={errors.review_url?.message}
                hint={business?.google_review_url ? 'Leave empty to use the business review URL.' : 'The business has no review URL yet, so one is required here to publish.'}>
                <Input type="url" placeholder="https://" {...register('review_url')} />
              </Field>
            </Card>

            <Card className="grid gap-4 md:grid-cols-2">
              <h2 className="font-semibold md:col-span-2">Appearance and QR</h2>
              <Checkbox label="Show business logo" {...register('show_logo')} />
              <Checkbox label="Use custom colours for this funnel" {...register('custom_colors')} />
              {values.custom_colors && <>
                <Field label="Primary colour"><Input type="color" className="h-10 p-1" {...register('primary_color')} /></Field>
                <Field label="Background colour"><Input type="color" className="h-10 p-1" {...register('background_color')} /></Field>
              </>}
              <Field label="QR code colour"><Input type="color" className="h-10 p-1" {...register('qr_fg')} /></Field>
              <Field label="QR background colour"><Input type="color" className="h-10 p-1" {...register('qr_bg')} /></Field>
              <Checkbox label="Place the logo in the QR code by default" {...register('qr_logo')} />
            </Card>
          </fieldset>

          {!readOnly && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant={funnel?.status === 'published' ? 'primary' : 'secondary'} loading={isSubmitting}>{funnel?.status === 'published' ? 'Save changes' : 'Save draft'}</Button>
              {funnel?.status !== 'published' && <Button loading={isSubmitting} disabled={!hasReviewUrl} onClick={save(true)}>Save and publish</Button>}
              {!hasReviewUrl && <p className="text-xs text-warning">Add a Google review URL (here or on the business) before publishing.</p>}
            </div>
          )}
        </form>

        <aside aria-label="Live preview" className="lg:sticky lg:top-6 lg:self-start">
          <p className="eyebrow mb-2">Live preview</p>
          <div className="h-[40rem] overflow-y-auto rounded-[1.5rem] border-4 border-line-strong [&>div]:min-h-full">
            {preview
              ? <FunnelView key={values.languages?.join()} funnel={preview} aiAvailable={false} maxNoteChars={500} onTrack={() => {}} generate={async () => ({ ok: false, code: 'preview', message: 'AI is not called from the preview.' })} />
              : <p className="p-6 text-sm text-muted">Choose a business to see the preview.</p>}
          </div>
          <p className="mt-2 text-xs text-muted">The preview never calls AI or records analytics.</p>
        </aside>
      </div>
    </>
  );
}
