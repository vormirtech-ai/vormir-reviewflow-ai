// Central FREE_MODE configuration. Runtime-neutral: used by the Edge Functions (Deno),
// the browser demo backend and the tests. All limits here are enforced server-side.
export interface AppConfig {
  freeMode: boolean;
  allowPaidAi: boolean;
  paidProvidersProhibited: boolean;
  aiEnabled: boolean;
  provider: 'gemini' | 'openai-compatible';
  providerConfigured: boolean;
  model: string;
  maxAiRequestsPerSession: number;
  maxRegenerationsPerSession: number;
  maxAiRequestsPerFunnelWindow: number;
  maxAiRequestsPerIpWindow: number;
  windowSeconds: number;
  quotaCooldownSeconds: number;
  maxNoteChars: number;
  maxAttributes: number;
  maxDraftChars: number;
  maxOutputTokens: number;
  providerTimeoutMs: number;
  maxEventsPerSessionMinute: number;
  maxEventsPerFunnelMinute: number;
  maxBodyBytes: number;
  defaultRetentionDays: number;
}

export type Env = (key: string) => string | undefined;

const int = (env: Env, key: string, fallback: number) => {
  const n = Number.parseInt(env(key) ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// Defaults are deliberately conservative: a published free quota is not
// guaranteed for every account, so stay well under it.
export function readConfig(env: Env): AppConfig {
  const freeMode = env('FREE_MODE') !== 'false'; // default true
  const allowPaidAi = env('ALLOW_PAID_AI') === 'true'; // default false
  const provider = env('AI_PROVIDER') === 'openai-compatible' ? 'openai-compatible' : 'gemini';
  return {
    freeMode,
    allowPaidAi,
    // Paid providers need BOTH switches flipped explicitly by an administrator.
    paidProvidersProhibited: freeMode || !allowPaidAi,
    aiEnabled: env('AI_ENABLED') !== 'false',
    provider,
    providerConfigured: Boolean(provider === 'gemini' ? env('GEMINI_API_KEY') : env('OPENAI_COMPATIBLE_API_KEY')),
    model: (provider === 'gemini' ? env('GEMINI_MODEL') : env('OPENAI_COMPATIBLE_MODEL')) || 'gemini-2.5-flash-lite',
    maxAiRequestsPerSession: int(env, 'MAX_AI_REQUESTS_PER_SESSION', 3),
    maxRegenerationsPerSession: int(env, 'MAX_REGENERATIONS_PER_SESSION', 2),
    maxAiRequestsPerFunnelWindow: int(env, 'MAX_AI_REQUESTS_PER_FUNNEL_WINDOW', 30),
    maxAiRequestsPerIpWindow: int(env, 'MAX_AI_REQUESTS_PER_IP_WINDOW', 6),
    windowSeconds: int(env, 'AI_WINDOW_SECONDS', 3600),
    quotaCooldownSeconds: int(env, 'AI_QUOTA_COOLDOWN_SECONDS', 600),
    maxNoteChars: int(env, 'MAX_NOTE_CHARS', 500),
    maxAttributes: int(env, 'MAX_ATTRIBUTES', 8),
    maxDraftChars: int(env, 'MAX_DRAFT_CHARS', 600),
    maxOutputTokens: int(env, 'MAX_OUTPUT_TOKENS', 1200),
    providerTimeoutMs: int(env, 'AI_TIMEOUT_MS', 15000),
    maxEventsPerSessionMinute: int(env, 'MAX_EVENTS_PER_SESSION_MINUTE', 40),
    maxEventsPerFunnelMinute: int(env, 'MAX_EVENTS_PER_FUNNEL_MINUTE', 600),
    maxBodyBytes: int(env, 'MAX_BODY_BYTES', 8192),
    defaultRetentionDays: int(env, 'ANALYTICS_RETENTION_DAYS', 365),
  };
}

export type AiStatus = 'ok' | 'ai_disabled' | 'paid_prohibited' | 'not_configured';

export function aiStatus(cfg: AppConfig): AiStatus {
  if (!cfg.aiEnabled) return 'ai_disabled';
  if (cfg.provider !== 'gemini' && cfg.paidProvidersProhibited) return 'paid_prohibited';
  if (!cfg.providerConfigured) return 'not_configured';
  return 'ok';
}
