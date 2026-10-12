// Customer-facing calls. Deliberately tiny: plain fetch to the Edge Functions, no Supabase SDK,
// so the QR landing page stays light on mobile networks.
import type { ClientEventType, Language } from '../../supabase/functions/_shared/validate.ts';
import type { PublicFunnel } from '../types.ts';
import { isDemo, SUPABASE_KEY, SUPABASE_URL } from './env.ts';

type FnName = 'resolve-public-funnel' | 'track-funnel-event' | 'generate-review-drafts';
interface FnResult { status: number; body: Record<string, unknown> }

async function call(name: FnName, body: unknown, keepalive = false): Promise<FnResult> {
  if (isDemo) return (await import('./mock.ts')).mockCall(name, body);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    keepalive,
    headers: { 'content-type': 'application/json', apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

export interface ResolvedFunnel { funnel: PublicFunnel; aiAvailable: boolean; maxNoteChars: number }

/** null = this link does not exist or is not published. Throws when the backend is unreachable. */
export async function resolvePublicFunnel(slug: string): Promise<ResolvedFunnel | null> {
  const { status, body } = await call('resolve-public-funnel', { slug });
  if (status === 404 || status === 400) return null;
  if (status !== 200) throw new Error('unavailable');
  return {
    funnel: body.funnel as PublicFunnel,
    aiAvailable: (body.ai as { available: boolean }).available,
    maxNoteChars: (body.limits as { maxNoteChars: number }).maxNoteChars,
  };
}

export interface TrackInput { slug: string; sessionId: string; type: ClientEventType; source: string; attributeId?: string }

/** Analytics must never get in the customer's way: failures are ignored. */
export function trackFunnelEvent(e: TrackInput): void {
  call('track-funnel-event', e, true).catch(() => {});
}

export interface GenerateInput { slug: string; sessionId: string; attributeIds: string[]; notes: string; language: Language; source: string }
export type GenerateOutcome =
  | { ok: true; drafts: string[]; remaining: number }
  | { ok: false; code: string; message: string };

export async function generateReviewDrafts(input: GenerateInput): Promise<GenerateOutcome> {
  try {
    const { status, body } = await call('generate-review-drafts', input);
    if (status === 200 && Array.isArray(body.drafts)) return { ok: true, drafts: body.drafts as string[], remaining: Number(body.remaining ?? 0) };
    return { ok: false, code: String(body.error ?? 'error'), message: String(body.message ?? 'AI suggestions are not available right now.') };
  } catch {
    return { ok: false, code: 'network', message: 'We could not reach the suggestion service. You can still write your own words.' };
  }
}
