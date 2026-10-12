// Public endpoint. Returns the safe, customer-facing configuration of a PUBLISHED funnel only.
import { readConfig } from '../_shared/config.ts';
import { resolveFunnel } from '../_shared/core.ts';
import { handle } from '../_shared/http.ts';
import { serviceClient, supabaseStore } from '../_shared/supabaseStore.ts';

const env = (k: string) => Deno.env.get(k);
const cfg = readConfig(env);

Deno.serve(handle(['GET', 'POST'], env, cfg.maxBodyBytes, (req, body) =>
  resolveFunnel(
    supabaseStore(serviceClient(env)),
    cfg,
    req.method === 'GET' ? new URL(req.url).searchParams.get('slug') : (body as { slug?: unknown } | null)?.slug,
  )));
