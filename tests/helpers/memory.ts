// In-memory Store plus mocked AI provider responses. Nothing here touches a network.
import { vi } from 'vitest';
import { readConfig } from '../../supabase/functions/_shared/config.ts';
import type { EventRecord, GenerationRecord, PublicFunnel, Store } from '../../supabase/functions/_shared/core.ts';

export const ATTR = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
export const SESSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const SESSION_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

export function makeFunnel(overrides: Partial<PublicFunnel> = {}): PublicFunnel {
  return {
    id: 'f0000000-0000-4000-8000-000000000001', slug: 'test-cafe', businessId: 'b0000000-0000-4000-8000-000000000001',
    businessName: 'Test Cafe', businessCategory: 'cafe', logoUrl: null, heading: 'How was it?', description: '', instructions: '',
    ctaText: 'Share your feedback', primaryColor: '#111111', backgroundColor: '#ffffff', languages: ['en', 'hi'], defaultLanguage: 'en',
    aiEnabled: true, allowNotes: true, maxSelections: 3, maxRegenerations: 2, reviewUrl: 'https://g.page/r/test/review',
    attributes: [
      { id: ATTR[0], label: 'Friendly staff', labelHi: null },
      { id: ATTR[1], label: 'Fast service', labelHi: null },
      { id: ATTR[2], label: 'Areas for improvement', labelHi: null },
    ],
    ...overrides,
  };
}

export function memoryStore(funnels: PublicFunnel[] = [makeFunnel()]) {
  const generations: (GenerationRecord & { at: string })[] = [];
  const events: (EventRecord & { at: string })[] = [];
  const clock = { now: Date.parse('2026-10-12T10:00:00Z') };
  const at = () => new Date(clock.now).toISOString();
  const store: Store = {
    async getPublishedFunnel(slug) {
      return funnels.find((f) => f.slug === slug) ?? null;
    },
    async countGenerations(q) {
      return generations.filter((g) => g.at >= q.sinceIso && (!q.funnelId || g.funnelId === q.funnelId) && (!q.sessionId || g.sessionId === q.sessionId) &&
        (!q.ipHash || g.ipHash === q.ipHash) && (!q.status || g.status === q.status)).length;
    },
    async recordGeneration(r) {
      generations.push({ ...r, at: at() });
    },
    async countEvents(q) {
      return events.filter((e) => e.funnelId === q.funnelId && e.at >= q.sinceIso && (!q.sessionId || e.sessionId === q.sessionId)).length;
    },
    async recordEvent(e) {
      events.push({ ...e, at: at() });
    },
  };
  return { store, generations, events, clock };
}

export const config = (env: Record<string, string> = {}) => readConfig((k) => ({ GEMINI_API_KEY: 'test-key', ...env })[k]);

export const FIVE = [
  'The staff were friendly and the service was quick.',
  'Friendly team, and I did not have to wait long.',
  'I found the staff welcoming and the service fast.',
  'Quick service from a friendly team during my visit.',
  'My visit was smooth: fast service and kind staff.',
];

/** A mocked Gemini HTTP response. This is NOT a verified call to the real API. */
export const geminiReplies = (payload: unknown, status = 200) =>
  vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof payload === 'string' ? payload : JSON.stringify(payload) }] } }] }), { status }));
