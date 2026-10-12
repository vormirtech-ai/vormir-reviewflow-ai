import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { summarize, type Group } from '../../../supabase/functions/_shared/analytics.ts';
import { useOrg } from '../../app/shell.tsx';
import { errorMessage } from '../../components/toast.tsx';
import { Button, Card, EmptyState, ErrorState, Field, Input, LoadingBlock, PageHeader, Select } from '../../components/ui.tsx';
import { downloadBlob, useAction, useBusinesses, useFunnels } from '../../hooks/data.ts';
import { api } from '../../lib/api.ts';
import { daysAgo, isoDay, Stat } from './shared.tsx';

const AXIS = { stroke: '#8b8d95', fontSize: 12 };
const TOOLTIP = { contentStyle: { background: '#141416', border: '1px solid #26262a', borderRadius: 8, color: '#f5f5f6' }, cursor: { fill: '#ffffff10' } };

function Comparison({ title, data, names }: { title: string; data: Group[]; names?: Map<string, string> }) {
  const rows = data.slice(0, 8).map((g) => ({ name: names?.get(g.key) ?? g.key, Visits: g.visits, 'Google clicks': g.googleClicks }));
  return (
    <Card>
      <h2 className="mb-4 font-semibold">{title}</h2>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid stroke="#26262a" horizontal={false} />
            <XAxis type="number" allowDecimals={false} {...AXIS} />
            <YAxis type="category" dataKey="name" width={110} {...AXIS} />
            <Tooltip {...TOOLTIP} />
            <Legend />
            <Bar dataKey="Visits" fill="#f5f5f6" />
            <Bar dataKey="Google clicks" fill="#8b8d95" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { org } = useOrg();
  const act = useAction();
  const businesses = useBusinesses();
  const funnels = useFunnels();
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(isoDay(new Date()));
  const [businessId, setBusinessId] = useState('');
  const [funnelId, setFunnelId] = useState('');
  const [source, setSource] = useState('');

  const validRange = !!from && !!to && from <= to;
  const filters = { organizationId: org.id, from, to, businessId: businessId || undefined, funnelId: funnelId || undefined, source: source || undefined };
  const rows = useQuery({ queryKey: ['analytics', filters], queryFn: () => api.analytics(filters), enabled: validRange });
  // Source options come from an unfiltered-by-source view so the list does not collapse after choosing one.
  const allSources = useQuery({ queryKey: ['analytics-sources', org.id, from, to], queryFn: () => api.analytics({ organizationId: org.id, from, to }), enabled: validRange });

  const summary = useMemo(() => summarize(rows.data ?? []), [rows.data]);
  const sources = useMemo(() => [...new Set((allSources.data ?? []).map((r) => r.source))].sort(), [allSources.data]);
  const businessNames = new Map((businesses.data ?? []).map((b) => [b.id, b.name]));
  const funnelNames = new Map((funnels.data ?? []).map((f) => [f.id, f.name]));
  const funnelOptions = (funnels.data ?? []).filter((f) => !businessId || f.business_id === businessId);
  const rate = summary.generationSuccessRate;

  return (
    <>
      <PageHeader title="Analytics" description="Anonymous activity on your feedback funnels."
        actions={<Button variant="secondary" disabled={!rows.data?.length} onClick={() => act(async () => downloadBlob(await api.exportAnalyticsCsv(filters), `reviewflow-analytics-${from}-to-${to}.csv`, 'text/csv'))}>Export CSV</Button>} />

      <Card className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="From"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Business">
          <Select value={businessId} onChange={(e) => { setBusinessId(e.target.value); setFunnelId(''); }}>
            <option value="">All businesses</option>
            {(businesses.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Funnel">
          <Select value={funnelId} onChange={(e) => setFunnelId(e.target.value)}>
            <option value="">All funnels</option>
            {funnelOptions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </Field>
        <Field label="Campaign source">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All sources</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
      </Card>

      {!validRange ? <ErrorState message="Choose a start date that is on or before the end date." />
        : rows.isPending ? <LoadingBlock label="Loading analytics" />
        : rows.isError ? <ErrorState message={errorMessage(rows.error)} onRetry={() => rows.refetch()} />
        : rows.data.length === 0
          ? <EmptyState icon={BarChart3} title="No activity in this period" body="Numbers appear here once customers open a published funnel. Try a wider date range, or share a funnel's QR code." />
          : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                <Stat label="Total funnel visits" value={summary.visits} />
                <Stat label="Unique visitor estimate" value={summary.uniqueVisitorEstimate} note="Anonymous sessions per day" />
                <Stat label="Draft generation success" value={rate === null ? '–' : `${Math.round(rate * 100)}%`} note={`${summary.generationSuccesses} of ${summary.generationRequests} requests`} />
                <Stat label="Draft selections" value={summary.draftSelections} />
                <Stat label="Outbound Google clicks" value={summary.googleClicks} note="Clicks, not published reviews" />
              </div>
              <p className="text-xs text-muted">
                An outbound click means a customer opened your Google review page. It does not show whether a review was posted or what rating was given; Google does not share that with this app.
                Also in this period: {summary.attributeSelections} attribute selections, {summary.regenerations} regenerations, {summary.generationErrors} generation errors, {summary.copyAttempts} copy attempts.
              </p>

              <Card>
                <h2 className="mb-4 font-semibold">Visits over time</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={summary.byDay} margin={{ left: 0, right: 16 }}>
                      <CartesianGrid stroke="#26262a" vertical={false} />
                      <XAxis dataKey="day" {...AXIS} />
                      <YAxis allowDecimals={false} width={32} {...AXIS} />
                      <Tooltip {...TOOLTIP} />
                      <Legend />
                      <Line type="monotone" dataKey="visits" name="Visits" stroke="#f5f5f6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="googleClicks" name="Google clicks" stroke="#8b8d95" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card>
                <h2 className="font-semibold">Feedback funnel</h2>
                <p className="mb-4 text-xs text-muted">Anonymous sessions reaching each stage.</p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.stages} margin={{ left: 0, right: 16 }}>
                      <CartesianGrid stroke="#26262a" vertical={false} />
                      <XAxis dataKey="stage" interval={0} {...AXIS} fontSize={11} />
                      <YAxis allowDecimals={false} width={32} {...AXIS} />
                      <Tooltip {...TOOLTIP} />
                      <Bar dataKey="sessions" name="Sessions" fill="#c7c9cf" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <div className="grid gap-6 lg:grid-cols-3">
                <Comparison title="By business" data={summary.byBusiness} names={businessNames} />
                <Comparison title="By funnel" data={summary.byFunnel} names={funnelNames} />
                <Comparison title="By campaign source" data={summary.bySource} />
              </div>
            </div>
          )}
    </>
  );
}
