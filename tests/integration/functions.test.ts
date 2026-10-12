// Exercises the real Edge Function request logic (supabase/functions/_shared) against an in-memory
// store and a MOCKED Gemini HTTP response. It does not prove anything about the live Gemini API.
import { describe, expect, it, vi } from 'vitest';
import { generateDrafts, resolveFunnel, trackEvent } from '../../supabase/functions/_shared/core.ts';
import { handle, ipHash } from '../../supabase/functions/_shared/http.ts';
import { ATTR, config, FIVE, geminiReplies, makeFunnel, memoryStore, SESSION, SESSION_2 } from '../helpers/memory.ts';

const request = (over: Record<string, unknown> = {}) => ({ slug: 'test-cafe', sessionId: SESSION, attributeIds: [ATTR[0], ATTR[1]], notes: 'The latte was lukewarm', language: 'en', ...over });
const deps = (fetch: ReturnType<typeof geminiReplies>, now: number, apiKey: string | undefined = 'test-key') => ({ fetch, apiKey, now });

describe('resolve-public-funnel', () => {
  it('returns safe configuration for a published funnel', async () => {
    const { store } = memoryStore();
    const res = await resolveFunnel(store, config(), 'test-cafe');
    expect(res.status).toBe(200);
    expect(res.body.ai).toEqual({ available: true });
    const funnel = res.body.funnel as Record<string, unknown>;
    // Nothing organisational or secret is exposed.
    for (const key of Object.keys(funnel)) expect(key).not.toMatch(/organization|member|secret|key|qr_settings|created/i);
  });
  it('404s for unknown or unpublished slugs and rejects malformed ones', async () => {
    const { store } = memoryStore([]);
    expect((await resolveFunnel(store, config(), 'test-cafe')).status).toBe(404);
    expect((await resolveFunnel(store, config(), "x' or 1=1--")).status).toBe(400);
    expect((await resolveFunnel(store, config(), undefined)).status).toBe(400);
  });
  it('reports AI as unavailable when no key is configured or the funnel disabled it', async () => {
    expect((await resolveFunnel(memoryStore().store, config({ GEMINI_API_KEY: '' }), 'test-cafe')).body.ai).toEqual({ available: false });
    expect((await resolveFunnel(memoryStore([makeFunnel({ aiEnabled: false })]).store, config(), 'test-cafe')).body.ai).toEqual({ available: false });
  });
});

describe('track-funnel-event', () => {
  it('records a permitted event', async () => {
    const m = memoryStore();
    const res = await trackEvent(m.store, config(), { slug: 'test-cafe', sessionId: SESSION, type: 'google_click', source: 'qr' }, 'iphash', m.clock.now);
    expect(res.status).toBe(202);
    expect(m.events).toHaveLength(1);
    expect(m.events[0]).toMatchObject({ type: 'google_click', source: 'qr', funnelId: makeFunnel().id });
  });
  it('rejects unexpected payloads, unknown funnels and foreign attributes', async () => {
    const m = memoryStore();
    const send = (body: unknown) => trackEvent(m.store, config(), body, null, m.clock.now);
    expect((await send({ slug: 'test-cafe', sessionId: SESSION, type: 'visit', comment: 'hello' })).status).toBe(400);
    expect((await send({ slug: 'test-cafe', sessionId: SESSION, type: 'generate_success' })).status).toBe(400);
    expect((await send({ slug: 'other-cafe', sessionId: SESSION, type: 'visit' })).status).toBe(404);
    expect((await send({ slug: 'test-cafe', sessionId: SESSION, type: 'attribute_select', attributeId: '99999999-9999-4999-8999-999999999999' })).status).toBe(400);
    expect(m.events).toHaveLength(0);
  });
  it('rate-limits a noisy session', async () => {
    const m = memoryStore();
    const cfg = config({ MAX_EVENTS_PER_SESSION_MINUTE: '3' });
    const send = () => trackEvent(m.store, cfg, { slug: 'test-cafe', sessionId: SESSION, type: 'copy' }, null, m.clock.now);
    expect((await send()).status).toBe(202);
    await send();
    await send();
    expect((await send()).status).toBe(429);
    m.clock.now += 61_000;
    expect((await send()).status).toBe(202);
  });
});

describe('generate-review-drafts', () => {
  it('returns exactly five drafts and keeps the key in a header, away from the URL and body', async () => {
    const m = memoryStore();
    const fetch = geminiReplies(FIVE);
    const res = await generateDrafts(m.store, config(), deps(fetch, m.clock.now), request(), 'ip1');
    expect(res.status).toBe(200);
    expect(res.body.drafts).toEqual(FIVE);
    expect(res.body.remaining).toBe(2);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).not.toContain('test-key');
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const body = String(init!.body);
    expect(body).not.toContain('test-key');
    expect(body).toContain('Friendly staff');
    expect(body).toContain('The latte was lukewarm');
    expect(body).not.toContain('google_search'); // no optional paid tools
  });

  it('stores only metadata: no notes and no draft text', async () => {
    const m = memoryStore();
    await generateDrafts(m.store, config(), deps(geminiReplies(FIVE), m.clock.now), request(), 'ip1');
    const stored = JSON.stringify([m.generations, m.events]);
    expect(stored).not.toContain('lukewarm');
    expect(stored).not.toContain(FIVE[0]);
    expect(m.generations[0]).toMatchObject({ status: 'success', attributeCount: 2, regenerate: false });
    expect(m.events.map((e) => e.type)).toEqual(['generate_request', 'generate_success']);
  });

  it('on a quota error tells the customer, then stops calling the provider during the cooldown', async () => {
    const m = memoryStore();
    const fetch = geminiReplies({}, 429);
    const first = await generateDrafts(m.store, config(), deps(fetch, m.clock.now), request(), 'ip1');
    expect(first.status).toBe(429);
    expect(first.body).toMatchObject({ error: 'quota_exhausted', fallback: true });
    expect(first.body.drafts).toBeUndefined();

    const second = await generateDrafts(m.store, config(), deps(fetch, m.clock.now + 1000), request({ sessionId: SESSION_2 }), 'ip2');
    expect(second.body.error).toBe('quota_exhausted');
    expect(fetch).toHaveBeenCalledTimes(1); // not retried

    m.clock.now += 601_000; // cooldown over: AI resumes
    const ok = geminiReplies(FIVE);
    expect((await generateDrafts(m.store, config(), deps(ok, m.clock.now), request({ sessionId: SESSION_2 }), 'ip2')).status).toBe(200);
  });

  it.each([
    ['four drafts', FIVE.slice(0, 4)],
    ['duplicated drafts', [FIVE[0], FIVE[0], FIVE[1], FIVE[2], FIVE[3]]],
    ['prose instead of JSON', 'Sure! Here are your reviews…'],
    ['an object', { reviews: FIVE }],
  ])('never fabricates drafts when the model returns %s', async (_name, payload) => {
    const m = memoryStore();
    const res = await generateDrafts(m.store, config(), deps(geminiReplies(payload), m.clock.now), request(), 'ip1');
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: 'provider_error', fallback: true });
    expect(res.body.drafts).toBeUndefined();
    expect(m.generations[0].status).toBe('malformed');
    expect(m.events.at(-1)!.type).toBe('generate_error');
  });

  it('handles provider timeouts and server errors without leaking details', async () => {
    const m = memoryStore();
    const hang = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const timedOut = await generateDrafts(m.store, config({ AI_TIMEOUT_MS: '20' }), deps(hang, m.clock.now), request(), 'ip1');
    expect(timedOut.status).toBe(504);
    expect(timedOut.body.error).toBe('provider_timeout');

    const failing = vi.fn(async () => new Response('{"error":{"message":"internal stack trace with test-key"}}', { status: 500 }));
    const failed = await generateDrafts(m.store, config(), deps(failing, m.clock.now), request({ sessionId: SESSION_2 }), 'ip2');
    expect(failed.status).toBe(502);
    expect(JSON.stringify(failed.body)).not.toMatch(/stack|test-key/);
  });

  it('enforces the per-session generation limit on the server', async () => {
    const m = memoryStore([makeFunnel({ maxRegenerations: 1 })]);
    const fetch = geminiReplies(FIVE);
    const run = () => generateDrafts(m.store, config(), deps(fetch, m.clock.now), request(), 'ip1');
    expect((await run()).body.remaining).toBe(1);
    const regenerated = await run();
    expect(regenerated.body.remaining).toBe(0);
    expect(m.generations[1].regenerate).toBe(true);
    expect(m.events.map((e) => e.type)).toContain('regenerate');
    const blocked = await run();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('session_limit');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('enforces per-IP and per-funnel windows across sessions', async () => {
    const m = memoryStore();
    const fetch = geminiReplies(FIVE);
    const cfg = config({ MAX_AI_REQUESTS_PER_IP_WINDOW: '2' });
    const session = (n: number) => `${n}aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
    expect((await generateDrafts(m.store, cfg, deps(fetch, m.clock.now), request({ sessionId: session(1) }), 'same-ip')).status).toBe(200);
    expect((await generateDrafts(m.store, cfg, deps(fetch, m.clock.now), request({ sessionId: session(2) }), 'same-ip')).status).toBe(200);
    const blocked = await generateDrafts(m.store, cfg, deps(fetch, m.clock.now), request({ sessionId: session(3) }), 'same-ip');
    expect(blocked.body.error).toBe('rate_limited');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('never calls a provider when AI is disabled, unconfigured, or off for the funnel', async () => {
    const fetch = geminiReplies(FIVE);
    const m = memoryStore();
    expect((await generateDrafts(m.store, config({ AI_ENABLED: 'false' }), deps(fetch, m.clock.now), request(), null)).status).toBe(503);
    expect((await generateDrafts(m.store, config({ GEMINI_API_KEY: '' }), deps(fetch, m.clock.now, undefined), request(), null)).body).toMatchObject({ error: 'ai_not_configured', fallback: true });
    const off = memoryStore([makeFunnel({ aiEnabled: false })]);
    expect((await generateDrafts(off.store, config(), deps(fetch, off.clock.now), request(), null)).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never calls a paid provider while paid AI is prohibited, even if its key is configured', async () => {
    const fetch = geminiReplies(FIVE);
    const m = memoryStore();
    const cfg = config({ AI_PROVIDER: 'openai-compatible', OPENAI_COMPATIBLE_API_KEY: 'sk-accidental', ALLOW_PAID_AI: 'true' }); // FREE_MODE still true
    const res = await generateDrafts(m.store, cfg, deps(fetch, m.clock.now, 'sk-accidental'), request(), null);
    expect(res.status).toBe(503);
    expect(res.body.fallback).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects oversized input, foreign attributes and unpublished funnels before any AI call', async () => {
    const fetch = geminiReplies(FIVE);
    const m = memoryStore();
    const run = (over: Record<string, unknown>) => generateDrafts(m.store, config(), deps(fetch, m.clock.now), request(over), null);
    expect((await run({ notes: 'x'.repeat(5000) })).status).toBe(400);
    expect((await run({ attributeIds: ['99999999-9999-4999-8999-999999999999'] })).status).toBe(400);
    expect((await run({ attributeIds: ATTR, })).status).toBe(200); // exactly maxSelections
    expect((await generateDrafts(memoryStore([makeFunnel({ maxSelections: 1 })]).store, config(), deps(fetch, m.clock.now), request(), null)).status).toBe(400);
    expect((await run({ slug: 'draft-funnel' })).status).toBe(404);
    expect((await generateDrafts(memoryStore([makeFunnel({ languages: ['en'] })]).store, config(), deps(fetch, m.clock.now), request({ language: 'hi' }), null)).status).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('HTTP wrapper shared by every Edge Function', () => {
  const env = () => undefined;
  const echo = handle(['POST'], env, 100, async (_req, body) => ({ status: 200, body: { got: body } }));
  const post = (body: string, headers: Record<string, string> = {}) => new Request('https://x.test/fn', { method: 'POST', body, headers });

  it('answers CORS preflight and rejects other methods', async () => {
    expect((await echo(new Request('https://x.test/fn', { method: 'OPTIONS' }))).status).toBe(204);
    expect((await echo(new Request('https://x.test/fn', { method: 'DELETE' }))).status).toBe(405);
    expect((await echo(new Request('https://x.test/fn'))).status).toBe(405);
  });
  it('rejects oversized and malformed bodies', async () => {
    expect((await echo(post(JSON.stringify({ a: 'x'.repeat(200) })))).status).toBe(413);
    expect((await echo(post('{not json'))).status).toBe(400);
    expect(await (await echo(post('{"a":1}'))).json()).toEqual({ got: { a: 1 } });
  });
  it('turns crashes into a generic 500 without a stack trace', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = handle(['POST'], env, 100, async () => { throw new Error('db password=hunter2 at stack.ts:1'); });
    const res = await boom(post('{}'));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/hunter2|stack/);
    quiet.mockRestore();
  });
  it('hashes the caller IP with a salt and never returns it raw', async () => {
    const req = new Request('https://x.test/fn', { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } });
    const a = await ipHash(req, 'salt-a');
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain('203');
    expect(await ipHash(req, 'salt-b')).not.toBe(a);
    expect(await ipHash(new Request('https://x.test/fn'), 'salt-a')).toBeNull();
  });
});
