// Public endpoint. Records a whitelisted, anonymous funnel event. No free text is accepted.
import { readConfig } from '../_shared/config.ts';
import { trackEvent } from '../_shared/core.ts';
import { handle, ipHash } from '../_shared/http.ts';
import { serviceClient, supabaseStore } from '../_shared/supabaseStore.ts';

const env = (k: string) => Deno.env.get(k);
const cfg = readConfig(env);

Deno.serve(handle(['POST'], env, 1024, async (req, body) =>
  trackEvent(supabaseStore(serviceClient(env)), cfg, body, await ipHash(req, env('IP_HASH_SALT')), Date.now())));
