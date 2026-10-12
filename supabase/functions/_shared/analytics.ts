// Aggregated analytics rows come from the `analytics_rows` SQL function (grouped server-side).
// The browser only ever receives these grouped counts, never the raw events table.
export interface AnalyticsRow {
  day: string; // YYYY-MM-DD (UTC)
  business_id: string;
  funnel_id: string;
  source: string;
  event_type: string;
  events: number;
  sessions: number;
}

export interface Group { key: string; visits: number; googleClicks: number }

export interface Summary {
  visits: number;
  uniqueVisitorEstimate: number;
  attributeSelections: number;
  generationRequests: number;
  generationSuccesses: number;
  generationErrors: number;
  generationSuccessRate: number | null;
  regenerations: number;
  draftSelections: number;
  copyAttempts: number;
  googleClicks: number;
  stages: { stage: string; sessions: number }[];
  byDay: { day: string; visits: number; googleClicks: number }[];
  byBusiness: Group[];
  byFunnel: Group[];
  bySource: Group[];
}

export const STAGES = [
  ['Visits', 'visit'],
  ['Feedback interactions', 'attribute_select'],
  ['AI draft generation', 'generate_success'],
  ['Draft selection', 'draft_select'],
  ['Google outbound click', 'google_click'],
] as const;

export function summarize(rows: AnalyticsRow[]): Summary {
  const events: Record<string, number> = {};
  const sessions: Record<string, number> = {};
  const groups = { day: new Map<string, Group>(), business_id: new Map<string, Group>(), funnel_id: new Map<string, Group>(), source: new Map<string, Group>() };
  for (const r of rows) {
    events[r.event_type] = (events[r.event_type] ?? 0) + Number(r.events);
    sessions[r.event_type] = (sessions[r.event_type] ?? 0) + Number(r.sessions);
    if (r.event_type !== 'visit' && r.event_type !== 'google_click') continue;
    for (const dim of ['day', 'business_id', 'funnel_id', 'source'] as const) {
      const g = groups[dim].get(r[dim]) ?? { key: r[dim], visits: 0, googleClicks: 0 };
      if (r.event_type === 'visit') g.visits += Number(r.events);
      else g.googleClicks += Number(r.events);
      groups[dim].set(r[dim], g);
    }
  }
  const n = (k: string) => events[k] ?? 0;
  // Every provider call is either a first request or a regeneration.
  const attempts = n('generate_request') + n('regenerate');
  const list = (m: Map<string, Group>) => [...m.values()].sort((a, b) => b.visits - a.visits);
  return {
    visits: n('visit'),
    // Distinct sessions per day, summed: a returning visitor on another day counts again.
    uniqueVisitorEstimate: sessions.visit ?? 0,
    attributeSelections: n('attribute_select'),
    generationRequests: attempts,
    generationSuccesses: n('generate_success'),
    generationErrors: n('generate_error'),
    generationSuccessRate: attempts ? n('generate_success') / attempts : null,
    regenerations: n('regenerate'),
    draftSelections: n('draft_select'),
    copyAttempts: n('copy'),
    googleClicks: n('google_click'),
    stages: STAGES.map(([stage, type]) => ({ stage, sessions: sessions[type] ?? 0 })),
    byDay: [...groups.day.values()].sort((a, b) => a.key.localeCompare(b.key)).map((g) => ({ day: g.key, visits: g.visits, googleClicks: g.googleClicks })),
    byBusiness: list(groups.business_id),
    byFunnel: list(groups.funnel_id),
    bySource: list(groups.source),
  };
}

// Quote everything and neutralise spreadsheet formulas (business and funnel names are user input).
const cell = (v: unknown) => {
  const s = String(v ?? '');
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export function toCsv(rows: AnalyticsRow[], names: Record<string, string> = {}): string {
  const head = ['day', 'business', 'funnel', 'source', 'event_type', 'events', 'sessions'];
  const lines = rows.map((r) =>
    [r.day, names[r.business_id] ?? r.business_id, names[r.funnel_id] ?? r.funnel_id, r.source, r.event_type, r.events, r.sessions].map(cell).join(','),
  );
  // google_click counts outbound clicks only. It is not a count of published reviews.
  return [head.join(','), ...lines].join('\r\n') + '\r\n';
}

export function validDateRange(from: unknown, to: unknown): boolean {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof from !== 'string' || typeof to !== 'string' || !re.test(from) || !re.test(to)) return false;
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  return days >= 0 && days <= 366;
}
