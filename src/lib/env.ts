// Only public values live here. Secrets (Gemini key, service-role key) exist solely as
// Supabase Edge Function secrets and must never get a VITE_ prefix.
const env = import.meta.env;

export const SUPABASE_URL: string = (env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
export const SUPABASE_KEY: string = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
export const CONTACT_EMAIL: string = env.VITE_CONTACT_EMAIL ?? '';

/** Without Supabase credentials the app runs against a browser-only demo backend. */
export const isDemo = !SUPABASE_URL || !SUPABASE_KEY;

/** FREE_MODE mirror for the UI. Enforcement happens in the Edge Functions (supabase/functions/_shared/config.ts). */
export const FREE_MODE = true;

// Printed QR codes must point at the production host, not at a preview deployment.
const SITE_URL: string = (env.VITE_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');

export function publicFunnelUrl(slug: string, source?: string): string {
  return `${SITE_URL || window.location.origin}/f/${slug}${source ? `?src=${source}` : ''}`;
}

/** localStorage switch for the simulated AI provider in demo mode: 'ok' | 'quota' | 'off'. */
export const DEMO_AI_KEY = 'reviewflow-demo-ai';
