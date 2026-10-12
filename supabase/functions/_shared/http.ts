import type { Env } from './config.ts';
import type { HandlerResult } from './core.ts';

const corsHeaders = (env: Env) => ({
  'access-control-allow-origin': env('ALLOWED_ORIGIN') || '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
});

export function json(env: Env, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(env), 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export function text(env: Env, body: string, contentType: string, filename: string): Response {
  return new Response(body, { status: 200, headers: { ...corsHeaders(env), 'content-type': contentType, 'content-disposition': `attachment; filename="${filename}"` } });
}

/**
 * Wraps a function with the checks every endpoint needs: CORS preflight, allowed methods,
 * a bounded JSON body, and a generic 500 that never leaks a stack trace.
 */
export function handle(
  methods: ('GET' | 'POST')[],
  env: Env,
  maxBodyBytes: number,
  fn: (req: Request, body: unknown) => Promise<HandlerResult | Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
    if (!methods.includes(req.method as 'GET' | 'POST')) return json(env, 405, { error: 'method_not_allowed', message: 'Method not allowed.' });
    try {
      let body: unknown = null;
      if (req.method === 'POST') {
        if (Number(req.headers.get('content-length') ?? 0) > maxBodyBytes) return json(env, 413, { error: 'too_large', message: 'Request is too large.' });
        const raw = await req.text();
        if (raw.length > maxBodyBytes) return json(env, 413, { error: 'too_large', message: 'Request is too large.' });
        try {
          body = JSON.parse(raw);
        } catch {
          return json(env, 400, { error: 'invalid_request', message: 'Body must be valid JSON.' });
        }
      }
      const out = await fn(req, body);
      return out instanceof Response ? out : json(env, out.status, out.body);
    } catch (e) {
      // Message only: no request bodies, notes or secrets are logged.
      console.error('function_error', (e as Error)?.message);
      return json(env, 500, { error: 'server_error', message: 'Something went wrong. Please try again.', fallback: true });
    }
  };
}

/** Salted hash of the caller IP, used only for abuse limits. The raw IP is never stored. */
export async function ipHash(req: Request, salt: string | undefined): Promise<string | null> {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  if (!ip) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt ?? 'reviewflow'}:${ip}`));
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}
