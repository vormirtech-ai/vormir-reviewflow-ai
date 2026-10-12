// The browser demo backend (src/lib/mock.ts) mirrors the role rules and database guards.
// These tests cover the application flow; the real database policies are tested in rls.test.ts.
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { summarize } from '../../supabase/functions/_shared/analytics.ts';
import { defaultFunnel } from '../../src/features/funnels/defaults.ts';
import { emptyBusiness, toInput } from '../../src/features/businesses/schema.ts';
import { contrastRatio, isScannable, qrOptions, qrSvg } from '../../src/features/qr-assets/qr.ts';
import { assertLogo } from '../../src/lib/errors.ts';
import { publicFunnelUrl } from '../../src/lib/env.ts';
import { mockApi as api, mockCall } from '../../src/lib/mock.ts';

const today = new Date().toISOString().slice(0, 10);
const signUp = (name: string) => api.signUp({ email: `${name}@example.com`, password: 'password1', fullName: name, organizationName: `${name} org` });
const orgId = async () => (await api.listOrgs())[0].id;
const newBusiness = async (reviewUrl: string | null = 'https://g.page/r/demo/review') =>
  api.saveBusiness(await orgId(), { ...toInput({ ...emptyBusiness, name: 'Corner Bakery' }, null), google_review_url: reviewUrl });

describe('business and funnel lifecycle', () => {
  it('creates, publishes and resolves a funnel, then unpublishes it', async () => {
    await signUp('owner');
    const business = await newBusiness();
    const funnel = await api.saveFunnel(defaultFunnel(business));
    expect(funnel.status).toBe('draft');
    expect(funnel.attributes).toHaveLength(8);
    expect((await mockCall('resolve-public-funnel', { slug: funnel.slug })).status).toBe(404); // drafts are private

    await api.setFunnelStatus(funnel.id, 'published');
    const res = await mockCall('resolve-public-funnel', { slug: funnel.slug });
    expect(res.status).toBe(200);
    expect((res.body.funnel as { reviewUrl: string }).reviewUrl).toBe('https://g.page/r/demo/review');

    await api.setFunnelStatus(funnel.id, 'draft');
    expect((await mockCall('resolve-public-funnel', { slug: funnel.slug })).status).toBe(404);
  });

  it('refuses to publish without an official review URL', async () => {
    await signUp('owner');
    const funnel = await api.saveFunnel(defaultFunnel(await newBusiness(null)));
    await expect(api.setFunnelStatus(funnel.id, 'published')).rejects.toThrow(/review URL/);
  });

  it('keeps the public link permanent after publishing and unique across funnels', async () => {
    await signUp('owner');
    const business = await newBusiness();
    const input = defaultFunnel(business);
    const funnel = await api.saveFunnel(input);
    await api.setFunnelStatus(funnel.id, 'published');
    await expect(api.saveFunnel({ ...input, slug: 'a-new-link' }, funnel.id)).rejects.toThrow(/permanent/);
    await expect(api.saveFunnel({ ...defaultFunnel(business), slug: input.slug })).rejects.toThrow(/already in use/);
    // Editing other fields keeps the same URL working.
    await api.saveFunnel({ ...input, heading: 'Updated heading' }, funnel.id);
    expect(((await mockCall('resolve-public-funnel', { slug: input.slug })).body.funnel as { heading: string }).heading).toBe('Updated heading');
  });

  it('duplicates a funnel as a draft with a new link', async () => {
    await signUp('owner');
    const funnel = await api.saveFunnel(defaultFunnel(await newBusiness()));
    await api.setFunnelStatus(funnel.id, 'published');
    const copy = await api.duplicateFunnel(funnel.id);
    expect(copy.status).toBe('draft');
    expect(copy.slug).not.toBe(funnel.slug);
    expect(copy.attributes.map((a) => a.label)).toEqual(funnel.attributes.map((a) => a.label));
  });

  it('takes funnels offline while their business is archived', async () => {
    await signUp('owner');
    const business = await newBusiness();
    const funnel = await api.saveFunnel(defaultFunnel(business));
    await api.setFunnelStatus(funnel.id, 'published');
    await api.setBusinessStatus(business.id, 'archived');
    expect((await mockCall('resolve-public-funnel', { slug: funnel.slug })).status).toBe(404);
    await api.setBusinessStatus(business.id, 'active');
    expect((await mockCall('resolve-public-funnel', { slug: funnel.slug })).status).toBe(200);
  });
});

describe('tenant isolation and roles (demo backend)', () => {
  it('hides one organization from another and enforces roles', async () => {
    await signUp('alice');
    const aliceOrg = await orgId();
    const business = await newBusiness();
    const funnel = await api.saveFunnel(defaultFunnel(business));

    await signUp('bob'); // now signed in as bob, a stranger
    await expect(api.getBusiness(business.id)).rejects.toThrow('Not found');
    await expect(api.listBusinesses(aliceOrg)).rejects.toThrow('Not found');
    await expect(api.saveBusiness(aliceOrg, toInput({ ...emptyBusiness, name: 'Hijack' }, null), business.id)).rejects.toThrow();
    await expect(api.setFunnelStatus(funnel.id, 'archived')).rejects.toThrow();
    await expect(api.analytics({ organizationId: aliceOrg, from: today, to: today })).rejects.toThrow();
    await expect(api.listMembers(aliceOrg)).rejects.toThrow();
    await expect(api.addMember(aliceOrg, 'bob@example.com', 'owner')).rejects.toThrow();

    await api.signIn('alice@example.com', 'x');
    await api.addMember(aliceOrg, 'bob@example.com', 'analyst');
    await api.signIn('bob@example.com', 'x');
    expect((await api.listBusinesses(aliceOrg)).map((b) => b.name)).toEqual(['Corner Bakery']); // analysts can view
    await expect(api.saveFunnel({ ...defaultFunnel(business), heading: 'x' }, funnel.id)).rejects.toThrow(/permission/);
    await expect(api.saveBusiness(aliceOrg, toInput({ ...emptyBusiness, name: 'New' }, null))).rejects.toThrow(/permission/);
    await expect(api.updateOrg(aliceOrg, { name: 'Mine now', retention_days: 30 })).rejects.toThrow(/permission/);
  });

  it('requires a session and keeps at least one owner', async () => {
    await expect(api.listOrgs()).rejects.toThrow(/sign in/);
    await signUp('solo');
    const org = await orgId();
    const me = (await api.getUser())!;
    await expect(api.setMemberRole(org, me.id, 'analyst')).rejects.toThrow(/at least one owner/);
    await expect(api.removeMember(org, me.id)).rejects.toThrow(/at least one owner/);
  });
});

describe('events, analytics filtering and QR assets', () => {
  async function publishedFunnel() {
    await signUp('owner');
    const business = await newBusiness();
    const funnel = await api.saveFunnel(defaultFunnel(business));
    await api.setFunnelStatus(funnel.id, 'published');
    return { business, funnel };
  }
  const session = (n: number) => `${n}ccccccc-cccc-4ccc-8ccc-cccccccccccc`;

  it('aggregates tracked events and filters by source, funnel and date', async () => {
    const { business, funnel } = await publishedFunnel();
    const track = (n: number, type: string, source: string) => mockCall('track-funnel-event', { slug: funnel.slug, sessionId: session(n), type, source });
    await track(1, 'visit', 'qr');
    await track(2, 'visit', 'qr');
    await track(3, 'visit', 'direct');
    await track(1, 'google_click', 'qr');
    expect((await track(1, 'published_review', 'qr')).status).toBe(400);

    const filters = { organizationId: business.organization_id, from: today, to: today };
    const all = summarize(await api.analytics(filters));
    expect(all).toMatchObject({ visits: 3, uniqueVisitorEstimate: 3, googleClicks: 1 });
    expect(summarize(await api.analytics({ ...filters, source: 'direct' })).visits).toBe(1);
    expect(summarize(await api.analytics({ ...filters, funnelId: funnel.id })).visits).toBe(3);
    expect(summarize(await api.analytics({ ...filters, businessId: '00000000-0000-4000-8000-000000000000' })).visits).toBe(0);
    expect(await api.analytics({ ...filters, from: '2020-01-01', to: '2020-01-31' })).toEqual([]);

    const csv = await api.exportAnalyticsCsv(filters);
    expect(csv).toContain('"Corner Bakery"');
    expect(csv).toContain('"google_click","1","1"');
    expect(csv).not.toMatch(/published/i);
  });

  it('generates simulated drafts through the same server logic and honours the quota fallback', async () => {
    const { funnel } = await publishedFunnel();
    const body = { slug: funnel.slug, sessionId: session(1), attributeIds: [funnel.attributes[0].id, funnel.attributes[7].id], notes: '', language: 'en' };
    const ok = await mockCall('generate-review-drafts', body);
    expect(ok.status).toBe(200);
    expect(ok.body.drafts).toHaveLength(5);
    expect(String((ok.body.drafts as string[])[0])).toContain('areas for improvement'); // criticism is kept

    localStorage.setItem('reviewflow-demo-ai', 'quota');
    const limited = await mockCall('generate-review-drafts', { ...body, sessionId: session(2) });
    expect(limited.body).toMatchObject({ error: 'quota_exhausted', fallback: true });

    localStorage.setItem('reviewflow-demo-ai', 'off');
    expect((await mockCall('resolve-public-funnel', { slug: funnel.slug })).body.ai).toEqual({ available: false });
  });

  it('creates QR assets only for published funnels, pointing at the permanent URL', async () => {
    const { funnel } = await publishedFunnel();
    const asset = await api.createQrAsset({ funnelId: funnel.id, kind: 'qr_png' });
    expect(asset.target_url).toBe(`${window.location.origin}/f/${funnel.slug}?src=qr`);
    await api.setFunnelStatus(funnel.id, 'draft');
    await expect(api.createQrAsset({ funnelId: funnel.id, kind: 'qr_png' })).rejects.toThrow(/Publish/);
  });
});

describe('QR codes', () => {
  // Rasterise the QR matrix (with its quiet zone) and decode it again: the code must resolve to the expected URL.
  function decode(text: string, withLogo: boolean): string | undefined {
    const options = qrOptions({ fg: '#000000', bg: '#ffffff' }, withLogo);
    const { modules } = QRCode.create(text, { errorCorrectionLevel: options.errorCorrectionLevel });
    const scale = 4;
    const size = (modules.size + 2 * options.margin) * scale;
    const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const mx = Math.floor(x / scale) - options.margin;
        const my = Math.floor(y / scale) - options.margin;
        if (mx >= 0 && my >= 0 && mx < modules.size && my < modules.size && modules.get(my, mx)) pixels.fill(0, (y * size + x) * 4, (y * size + x) * 4 + 3);
      }
    }
    if (withLogo) { // blank out the centre 20% + padding, as the logo does
      const box = Math.ceil(size * 0.2 * 1.24);
      const start = Math.floor((size - box) / 2);
      for (let y = start; y < start + box; y++) pixels.fill(255, (y * size + start) * 4, (y * size + start + box) * 4);
    }
    return jsQR(pixels, size, size)?.data;
  }

  it('encode the stable public funnel URL', () => {
    const url = publicFunnelUrl('blue-lantern-cafe', 'qr');
    expect(url).toBe(`${window.location.origin}/f/blue-lantern-cafe?src=qr`);
    expect(decode(url, false)).toBe(url);
  });
  it('still scan with a logo covering the centre', () => {
    const url = 'https://reviewflow.pages.dev/f/blue-lantern-cafe?src=qr';
    expect(decode(url, true)).toBe(url);
  });
  it('produce SVG with a quiet zone and an embedded logo', async () => {
    const plain = await qrSvg('https://example.com/f/a-b-c?src=qr', { fg: '#112233', bg: '#ffffff' });
    expect(plain).toContain('<svg');
    expect(plain).toContain('#112233');
    const size = Number(/viewBox="0 0 (\d+) /.exec(plain)![1]);
    expect(size).toBe(QRCode.create('https://example.com/f/a-b-c?src=qr', { errorCorrectionLevel: 'M' }).modules.size + 8);
    const withLogo = await qrSvg('https://example.com/f/a-b-c?src=qr', { fg: '#000000', bg: '#ffffff' }, 'data:image/png;base64,AAAA');
    expect(withLogo).toContain('<image href="data:image/png;base64,AAAA"');
  });
  it('flag colour combinations that will not scan', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(isScannable({ fg: '#000000', bg: '#ffffff' })).toBe(true);
    expect(isScannable({ fg: '#cccccc', bg: '#ffffff' })).toBe(false);
    expect(isScannable({ fg: '#ffffff', bg: '#000000' })).toBe(false); // inverted codes are unreliable
  });
});

describe('file upload validation', () => {
  it('accepts small raster images only', () => {
    expect(() => assertLogo(new File(['x'], 'logo.png', { type: 'image/png' }))).not.toThrow();
    expect(() => assertLogo(new File(['<svg onload=alert(1)>'], 'logo.svg', { type: 'image/svg+xml' }))).toThrow(/PNG, JPEG or WebP/);
    expect(() => assertLogo(new File(['x'], 'run.exe', { type: 'application/octet-stream' }))).toThrow();
    expect(() => assertLogo(new File([new Uint8Array(1_048_577)], 'big.png', { type: 'image/png' }))).toThrow(/1 MB/);
  });
});
