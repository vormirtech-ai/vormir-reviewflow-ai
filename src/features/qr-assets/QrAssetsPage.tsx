import { useQuery } from '@tanstack/react-query';
import { QrCode } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrg } from '../../app/shell.tsx';
import { errorMessage, useToast } from '../../components/toast.tsx';
import { Button, buttonClass, Card, Checkbox, EmptyState, ErrorState, Field, Input, LoadingBlock, PageHeader, Select, Table } from '../../components/ui.tsx';
import { copyText, downloadBlob, useBusinesses, useFunnels } from '../../hooks/data.ts';
import { api } from '../../lib/api.ts';
import { publicFunnelUrl } from '../../lib/env.ts';
import type { AssetKind, FlyerLayout } from '../../types.ts';
import { readableOn } from '../feedback/FunnelView.tsx';
import { canvasBlob, CTAS, drawFlyer, flyerPdf, isScannable, LAYOUTS, loadLogo, qrCanvas, qrSvg } from './qr.ts';

const PRINT_PX_PER_MM = 300 / 25.4; // 300 dpi

export default function QrAssetsPage() {
  const { org, can } = useOrg();
  const notify = useToast();
  const funnels = useFunnels();
  const businesses = useBusinesses();
  const assets = useQuery({ queryKey: ['qr-assets', org.id], queryFn: () => api.listQrAssets(org.id) });
  const published = (funnels.data ?? []).filter((f) => f.status === 'published');

  const [funnelId, setFunnelId] = useState('');
  const funnel = published.find((f) => f.id === funnelId) ?? published[0];
  const business = businesses.data?.find((b) => b.id === funnel?.business_id);

  const [fg, setFg] = useState('#000000');
  const [bg, setBg] = useState('#ffffff');
  const [withLogo, setWithLogo] = useState(false);
  const [layout, setLayout] = useState<FlyerLayout>('tabletop');
  const [cta, setCta] = useState(CTAS[0]);
  const [instructions, setInstructions] = useState('Open your phone camera and point it at the code.');
  const [logo, setLogo] = useState<Awaited<ReturnType<typeof loadLogo>>>(null);
  const [svgPreview, setSvgPreview] = useState('');
  const flyerRef = useRef<HTMLCanvasElement>(null);

  // Start from the defaults saved on the funnel.
  useEffect(() => {
    if (!funnel) return;
    setFg(funnel.qr_settings.fg ?? '#000000');
    setBg(funnel.qr_settings.bg ?? '#ffffff');
    setWithLogo(!!funnel.qr_settings.logo);
  }, [funnel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    loadLogo(business?.logo_url ?? null).then((l) => live && setLogo(l));
    return () => { live = false; };
  }, [business?.logo_url]);

  const url = funnel ? publicFunnelUrl(funnel.slug, 'qr') : '';
  const style = { fg, bg };
  const scannable = isScannable(style);
  const qrLogo = withLogo ? logo : null;

  useEffect(() => {
    if (!url || !business) return;
    let live = true;
    qrSvg(url, style, qrLogo?.dataUrl).then((svg) => live && setSvgPreview(svg));
    qrCanvas(url, 600, style, qrLogo?.img)
      .then((qr) => {
        if (live && flyerRef.current) {
          drawFlyer(flyerRef.current, { layout, businessName: business.name, logo: logo?.img ?? null, qr, cta, instructions, background: business.brand_background, text: readableOn(business.brand_background) }, 4);
        }
      })
      .catch(() => {});
    return () => { live = false; };
  }, [url, fg, bg, qrLogo, logo, layout, cta, instructions, business]); // eslint-disable-line react-hooks/exhaustive-deps

  if (funnels.isPending || businesses.isPending) return <LoadingBlock />;
  if (funnels.isError) return <ErrorState message={errorMessage(funnels.error)} onRetry={() => funnels.refetch()} />;
  if (!funnel || !business) {
    return (
      <>
        <PageHeader title="QR assets" />
        <EmptyState icon={QrCode} title="Publish a funnel first" body="QR codes point at a published funnel's permanent link, so they keep working after you print them."
          action={<Link to="/app/funnels" className={buttonClass()}>Go to funnels</Link>} />
      </>
    );
  }

  async function download(kind: AssetKind) {
    if (!funnel || !business) return;
    try {
      const name = `${funnel.slug}-${kind.replace('_', '-')}`;
      if (kind === 'qr_svg') downloadBlob(await qrSvg(url, style, qrLogo?.dataUrl), `${name}.svg`, 'image/svg+xml');
      else if (kind === 'qr_png') downloadBlob(await canvasBlob(await qrCanvas(url, 1024, style, qrLogo?.img)), `${name}.png`);
      else {
        const canvas = document.createElement('canvas');
        drawFlyer(canvas, { layout, businessName: business.name, logo: logo?.img ?? null, qr: await qrCanvas(url, 1200, style, qrLogo?.img), cta, instructions, background: business.brand_background, text: readableOn(business.brand_background) }, PRINT_PX_PER_MM);
        downloadBlob(kind === 'flyer_pdf' ? await flyerPdf(canvas, layout) : await canvasBlob(canvas), `${funnel.slug}-${layout}.${kind === 'flyer_pdf' ? 'pdf' : 'png'}`);
      }
      // The download already happened in the browser; recording it is best-effort bookkeeping.
      if (can('asset.write')) api.createQrAsset({ funnelId: funnel.id, kind, layout: kind.startsWith('flyer') ? layout : undefined, settings: { fg, bg, logo: withLogo } }).then(() => assets.refetch()).catch(() => {});
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  }

  return (
    <>
      <PageHeader title="QR assets" description="Download QR codes and print-ready flyers for a published funnel." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <Field label="Funnel">
            <Select value={funnel.id} onChange={(e) => setFunnelId(e.target.value)}>
              {published.map((f) => <option key={f.id} value={f.id}>{f.name} · /f/{f.slug}</option>)}
            </Select>
          </Field>
          <div className="flex justify-center rounded-control p-4" style={{ background: bg }}>
            {svgPreview && <img alt={`QR code for ${url}`} className="size-56" src={`data:image/svg+xml;utf8,${encodeURIComponent(svgPreview)}`} />}
          </div>
          <div className="flex items-center gap-2">
            <Input readOnly aria-label="Encoded link" value={url} onFocus={(e) => e.target.select()} />
            <Button variant="secondary" onClick={async () => notify((await copyText(url)) ? 'Link copied' : 'Select the link and copy it manually', 'success')}>Copy</Button>
          </div>
          <p className="text-xs text-muted">The <code>src=qr</code> tag lets analytics tell QR scans from shared links. It never changes, so printed codes stay valid.</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Code colour"><Input type="color" className="h-10 p-1" value={fg} onChange={(e) => setFg(e.target.value)} /></Field>
            <Field label="Background colour"><Input type="color" className="h-10 p-1" value={bg} onChange={(e) => setBg(e.target.value)} /></Field>
          </div>
          <Checkbox label={business.logo_url ? 'Place the business logo in the centre' : 'Logo in the centre (upload a business logo first)'} checked={withLogo && !!logo} disabled={!logo} onChange={(e) => setWithLogo(e.target.checked)} />
          {business.logo_url && !logo && <p className="text-xs text-warning">The logo could not be loaded for embedding, so exports will not include it.</p>}
          {!scannable && <p role="alert" className="text-sm text-danger">These colours do not have enough contrast to scan reliably. Use a dark code on a light background.</p>}
          <div className="flex gap-2">
            <Button disabled={!scannable} onClick={() => download('qr_png')}>Download PNG</Button>
            <Button variant="secondary" disabled={!scannable} onClick={() => download('qr_svg')}>Download SVG</Button>
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="font-semibold">Print-ready flyer</h2>
          <Field label="Layout">
            <Select value={layout} onChange={(e) => setLayout(e.target.value as FlyerLayout)}>
              {Object.entries(LAYOUTS).map(([key, l]) => <option key={key} value={key}>{l.label}</option>)}
            </Select>
          </Field>
          <Field label="Call to action">
            <Input list="cta-options" maxLength={60} value={cta} onChange={(e) => setCta(e.target.value)} />
            <datalist id="cta-options">{CTAS.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Short instructions (optional)"><Input maxLength={120} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></Field>
          <div className="flex justify-center rounded-control bg-raised p-4">
            <canvas ref={flyerRef} aria-label="Flyer preview" className="max-h-96 max-w-full shadow-card" />
          </div>
          <p className="text-xs text-muted">Uses {business.name}'s colours{logo ? ' and logo' : '; no logo uploaded, so the name is shown as text'}. Exports at 300 dpi.</p>
          <div className="flex gap-2">
            <Button disabled={!scannable} onClick={() => download('flyer_pdf')}>Download PDF</Button>
            <Button variant="secondary" disabled={!scannable} onClick={() => download('flyer_png')}>Download PNG</Button>
          </div>
        </Card>
      </div>

      {!!assets.data?.length && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Recent downloads</h2>
          <Table>
            <thead><tr><th>Type</th><th>Layout</th><th>Encoded link</th><th>Created</th></tr></thead>
            <tbody>{assets.data.slice(0, 10).map((a) => (
              <tr key={a.id}><td>{a.kind.replace('_', ' ').toUpperCase()}</td><td className="text-muted">{a.layout ? LAYOUTS[a.layout].label : ''}</td><td className="break-all text-muted">{a.target_url}</td><td className="text-muted">{new Date(a.created_at).toLocaleString()}</td></tr>
            ))}</tbody>
          </Table>
        </div>
      )}
    </>
  );
}
