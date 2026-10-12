import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { SOURCE_RE } from '../../../supabase/functions/_shared/validate.ts';
import { generateReviewDrafts, resolvePublicFunnel, trackFunnelEvent, type ResolvedFunnel } from '../../lib/publicApi.ts';
import { FunnelView } from './FunnelView.tsx';

type State = { kind: 'loading' } | { kind: 'missing' } | { kind: 'error' } | { kind: 'ready'; data: ResolvedFunnel };

// Anonymous, per-tab id. It identifies a visit for counting, not a person.
function sessionId(slug: string): string {
  const key = `rf-session-${slug}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

const cacheKey = (slug: string) => `rf-funnel-${slug}`;
const visited = new Set<string>();

function Message({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted">{body}</p>
      {onRetry && <button type="button" onClick={onRetry} className="mt-2 rounded-lg border border-line-strong px-4 py-2 text-sm">Try again</button>}
    </main>
  );
}

export default function PublicFunnelPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const src = params.get('src') ?? '';
  const source = SOURCE_RE.test(src) ? src : 'direct';

  useEffect(() => {
    let live = true;
    resolvePublicFunnel(slug)
      .then((data) => {
        if (!live) return;
        if (!data) return setState({ kind: 'missing' });
        try { localStorage.setItem(cacheKey(slug), JSON.stringify(data)); } catch { /* storage may be blocked */ }
        setState({ kind: 'ready', data });
        if (!visited.has(slug)) {
          visited.add(slug);
          trackFunnelEvent({ slug, sessionId: sessionId(slug), type: 'visit', source });
        }
      })
      .catch(() => {
        if (!live) return;
        // Backend unreachable: a returning device can still write and continue to Google without AI.
        try {
          const cached = JSON.parse(localStorage.getItem(cacheKey(slug)) ?? 'null') as ResolvedFunnel | null;
          if (cached) return setState({ kind: 'ready', data: { ...cached, aiAvailable: false } });
        } catch { /* ignore a corrupt cache */ }
        setState({ kind: 'error' });
      });
    return () => { live = false; };
  }, [slug, source, attempt]);

  if (state.kind === 'loading') {
    return (
      <main role="status" aria-label="Loading feedback page" className="mx-auto flex min-h-screen max-w-md flex-col items-center gap-4 px-5 py-10">
        <div className="skeleton size-14 rounded-full" />
        <div className="skeleton h-6 w-40" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-12 w-full" />
      </main>
    );
  }
  if (state.kind === 'missing') return <Message title="This feedback page is not available" body="The link may be incorrect, or the business has paused this page." />;
  if (state.kind === 'error') {
    return <Message title="We could not load this page" body="Please check your connection and try again." onRetry={() => { setState({ kind: 'loading' }); setAttempt((n) => n + 1); }} />;
  }

  const { funnel, aiAvailable, maxNoteChars } = state.data;
  const id = sessionId(slug);
  return (
    <div className="min-h-screen [&>div]:min-h-screen">
      <FunnelView
        funnel={funnel}
        aiAvailable={aiAvailable}
        maxNoteChars={maxNoteChars}
        onTrack={(type, attributeId) => trackFunnelEvent({ slug, sessionId: id, type, source, attributeId })}
        generate={(input) => generateReviewDrafts({ slug, sessionId: id, source, ...input })}
      />
    </div>
  );
}
