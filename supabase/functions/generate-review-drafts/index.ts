// Public endpoint. The only place an AI provider is ever called; the API key never leaves this function.
import { readConfig } from '../_shared/config.ts';
import { generateDrafts } from '../_shared/core.ts';
import { handle, ipHash } from '../_shared/http.ts';
import { serviceClient, supabaseStore } from '../_shared/supabaseStore.ts';

const env = (k: string) => Deno.env.get(k);
const cfg = readConfig(env);

Deno.serve(handle(['POST'], env, cfg.maxBodyBytes, async (req, body) =>
  generateDrafts(
    supabaseStore(serviceClient(env)),
    cfg,
    {
      fetch,
      apiKey: cfg.provider === 'gemini' ? env('GEMINI_API_KEY') : env('OPENAI_COMPATIBLE_API_KEY'),
      baseUrl: env('OPENAI_COMPATIBLE_BASE_URL'),
      now: Date.now(),
    },
    body,
    await ipHash(req, env('IP_HASH_SALT')),
  )));
