// QR codes and flyers are rendered entirely in the browser: no server processing, no paid API.
import QRCode from 'qrcode';
import type { FlyerLayout } from '../../types.ts';

export interface QrStyle { fg: string; bg: string }

/** 4-module quiet zone; highest error correction when a logo covers the centre. */
export const qrOptions = (style: QrStyle, withLogo: boolean) => ({
  errorCorrectionLevel: withLogo ? ('H' as const) : ('M' as const),
  margin: 4,
  color: { dark: style.fg, light: style.bg },
});

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio. Scanners need dark modules on a clearly lighter background. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
export const isScannable = (style: QrStyle) => contrastRatio(style.fg, style.bg) >= 4 && luminance(style.fg) < luminance(style.bg);

const LOGO_SHARE = 0.2; // of the code width; well inside what level-H error correction recovers

export async function qrSvg(url: string, style: QrStyle, logoDataUrl?: string | null): Promise<string> {
  const svg = await QRCode.toString(url, { type: 'svg', ...qrOptions(style, !!logoDataUrl) });
  if (!logoDataUrl) return svg;
  const size = Number(/viewBox="0 0 (\d+) /.exec(svg)?.[1] ?? 0);
  if (!size) return svg;
  const w = size * LOGO_SHARE;
  const at = (size - w) / 2;
  const pad = w * 0.12;
  return svg.replace('</svg>',
    `<rect x="${at - pad}" y="${at - pad}" width="${w + 2 * pad}" height="${w + 2 * pad}" rx="${pad}" fill="#ffffff"/>` +
    `<image href="${logoDataUrl}" x="${at}" y="${at}" width="${w}" height="${w}" preserveAspectRatio="xMidYMid meet"/></svg>`);
}

export async function qrCanvas(url: string, size: number, style: QrStyle, logo?: HTMLImageElement | null): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, url, { width: size, ...qrOptions(style, !!logo) });
  if (logo) {
    const ctx = canvas.getContext('2d')!;
    const box = canvas.width * LOGO_SHARE;
    const at = (canvas.width - box) / 2;
    const pad = box * 0.12;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(at - pad, at - pad, box + 2 * pad, box + 2 * pad, pad);
    ctx.fill();
    drawContained(ctx, logo, at, at, box, box);
  }
  return canvas;
}

/** Draw an image inside a box without changing its proportions. */
function drawContained(ctx: CanvasRenderingContext2D, img: HTMLImageElement | HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Loads a logo so it can be embedded in exports. Resolves null when the image cannot be read (e.g. blocked by CORS). */
export async function loadLogo(url: string | null): Promise<{ img: HTMLImageElement; dataUrl: string } | null> {
  if (!url) return null;
  try {
    const blob = await (await fetch(url)).blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    return { img, dataUrl };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ flyers

export const LAYOUTS: Record<FlyerLayout, { label: string; widthMm: number; heightMm: number }> = {
  tabletop: { label: 'Tabletop display (A6)', widthMm: 105, heightMm: 148 },
  poster: { label: 'Small poster (A4)', widthMm: 210, heightMm: 297 },
  receipt: { label: 'Receipt card (80 × 120 mm)', widthMm: 80, heightMm: 120 },
  business_card: { label: 'Business card (89 × 51 mm)', widthMm: 89, heightMm: 51 },
};
export const CTAS = ['Share Your Honest Experience', 'Scan to Leave Your Feedback'];

export interface FlyerInput {
  layout: FlyerLayout;
  businessName: string;
  logo: HTMLImageElement | null;
  qr: HTMLCanvasElement;
  cta: string;
  instructions: string;
  background: string;
  text: string;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Paints lines and returns the y coordinate just below them. */
function paragraph(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, sizePx: number, weight = 400, align: CanvasTextAlign = 'center'): number {
  ctx.font = `${weight} ${sizePx}px Inter, system-ui, 'Segoe UI', Arial, 'Noto Sans Devanagari', sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  for (const line of wrap(ctx, text, maxWidth)) {
    ctx.fillText(line, x, y);
    y += sizePx * 1.25;
  }
  return y;
}

/** One renderer for the on-screen preview, the PNG and the PDF, so what is previewed is what prints. */
export function drawFlyer(canvas: HTMLCanvasElement, f: FlyerInput, pxPerMm: number): void {
  const { widthMm, heightMm } = LAYOUTS[f.layout];
  const W = (canvas.width = Math.round(widthMm * pxPerMm));
  const H = (canvas.height = Math.round(heightMm * pxPerMm));
  const mm = (v: number) => v * pxPerMm;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = f.background;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = f.text;
  ctx.imageSmoothingEnabled = false; // keep QR modules crisp when scaled

  if (f.layout === 'business_card') {
    const m = mm(5);
    const side = H - 2 * m;
    ctx.drawImage(f.qr, m, m, side, side);
    const x = m + side + mm(5);
    const w = W - x - m;
    let y = m + mm(2);
    if (f.logo) { ctx.imageSmoothingEnabled = true; drawContained(ctx, f.logo, x, y, w, mm(9)); y += mm(12); }
    else y = paragraph(ctx, f.businessName, x, y, w, mm(4), 700, 'left') + mm(2);
    y = paragraph(ctx, f.cta, x, y, w, mm(3.6), 600, 'left') + mm(1.5);
    paragraph(ctx, f.instructions, x, y, w, mm(2.4), 400, 'left');
    return;
  }

  const m = W * 0.1;
  const inner = W - 2 * m;
  let y = m;
  if (f.logo) { ctx.imageSmoothingEnabled = true; drawContained(ctx, f.logo, m, y, inner, H * 0.11); ctx.imageSmoothingEnabled = false; y += H * 0.11 + mm(3); }
  y = paragraph(ctx, f.businessName, W / 2, y, inner, W * 0.06, 700) + mm(3);
  y = paragraph(ctx, f.cta, W / 2, y, inner, W * 0.075, 600) + mm(4);
  const footerHeight = W * 0.042 * 1.25 * 3;
  const side = Math.max(mm(25), Math.min(inner, H - y - m - footerHeight - mm(4)));
  ctx.drawImage(f.qr, (W - side) / 2, y, side, side);
  paragraph(ctx, f.instructions, W / 2, y + side + mm(4), inner, W * 0.042);
}

export async function flyerPdf(canvas: HTMLCanvasElement, layout: FlyerLayout): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const { widthMm, heightMm } = LAYOUTS[layout];
  const doc = new jsPDF({ unit: 'mm', format: [widthMm, heightMm], orientation: widthMm > heightMm ? 'landscape' : 'portrait' });
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, widthMm, heightMm);
  return doc.output('blob');
}

export const canvasBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), 'image/png'));
