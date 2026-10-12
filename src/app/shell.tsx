// Everything a signed-in area needs: data client, auth session, current organization and the dashboard frame.
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Building2, LayoutDashboard, LogOut, Menu, Palette, QrCode, Settings, Workflow, X } from 'lucide-react';
import { createContext, Suspense, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { can as roleCan, type Action } from '../../supabase/functions/_shared/roles.ts';
import { ErrorBoundary, Logo } from '../components/brand.tsx';
import { errorMessage, useToast } from '../components/toast.tsx';
import { Button, cx, EmptyState, ErrorState, Input, LoadingBlock, Select } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { isDemo } from '../lib/env.ts';
import type { AuthUser, Org } from '../types.ts';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } });

const AuthContext = createContext<{ user: AuthUser | null; loading: boolean }>({ user: null, loading: true });
export const useAuth = () => useContext(AuthContext);

/** Pathless layout route: wraps the auth pages and the dashboard. */
export function AccountShell() {
  const [state, setState] = useState<{ user: AuthUser | null; loading: boolean }>({ user: null, loading: true });
  useEffect(() => {
    let live = true;
    api.getUser().then((user) => live && setState({ user, loading: false })).catch(() => live && setState({ user: null, loading: false }));
    const off = api.onAuthChange((user, event) => {
      setState({ user, loading: false });
      if (event === 'SIGNED_OUT') queryClient.clear();
    });
    return () => { live = false; off(); };
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={state}>
        <Outlet />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

interface OrgContextValue { org: Org; orgs: Org[]; selectOrg: (id: string) => void; can: (action: Action) => boolean }
const OrgContext = createContext<OrgContextValue | null>(null);
export function useOrg(): OrgContextValue {
  const value = useContext(OrgContext);
  if (!value) throw new Error('useOrg outside the dashboard');
  return value;
}

const ORG_KEY = 'rf-org';

function OrgProvider({ user, children }: { user: AuthUser; children: ReactNode }) {
  const client = useQueryClient();
  const notify = useToast();
  const orgs = useQuery({ queryKey: ['orgs', user.id], queryFn: () => api.listOrgs() });
  const [selected, setSelected] = useState(() => localStorage.getItem(ORG_KEY));
  const [name, setName] = useState('');

  if (orgs.isPending) return <div className="p-8"><LoadingBlock label="Loading your organization" /></div>;
  if (orgs.isError) return <div className="p-8"><ErrorState message={errorMessage(orgs.error)} onRetry={() => orgs.refetch()} /></div>;

  const org = orgs.data.find((o) => o.id === selected) ?? orgs.data[0];
  if (!org) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <EmptyState icon={Building2} title="Create your organization" body="You are not a member of any organization yet. Create one to start, or ask an owner to add you."
          action={
            <form className="flex gap-2" onSubmit={async (e) => {
              e.preventDefault();
              try { await api.createOrg(name.trim()); await client.invalidateQueries({ queryKey: ['orgs'] }); } catch (err) { notify(errorMessage(err), 'error'); }
            }}>
              <Input required maxLength={120} aria-label="Organization name" placeholder="Organization name" value={name} onChange={(e) => setName(e.target.value)} />
              <Button type="submit">Create</Button>
            </form>
          } />
      </div>
    );
  }
  const selectOrg = (id: string) => { localStorage.setItem(ORG_KEY, id); setSelected(id); };
  return <OrgContext.Provider value={{ org, orgs: orgs.data, selectOrg, can: (action) => roleCan(org.role, action) }}>{children}</OrgContext.Provider>;
}

const NAV = [
  ['/app/dashboard', 'Dashboard', LayoutDashboard],
  ['/app/businesses', 'Businesses', Building2],
  ['/app/funnels', 'Funnels', Workflow],
  ['/app/analytics', 'Analytics', BarChart3],
  ['/app/qr-assets', 'QR assets', QrCode],
  ['/app/customization', 'Customization', Palette],
  ['/app/settings', 'Settings', Settings],
] as const;

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { org, orgs, selectOrg } = useOrg();
  const { user } = useAuth();
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Logo className="h-10 w-40" />
      {orgs.length > 1
        ? <Select aria-label="Organization" value={org.id} onChange={(e) => selectOrg(e.target.value)}>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
        : <p className="truncate px-1 text-sm text-silver" title={org.name}>{org.name}</p>}
      <nav aria-label="Dashboard" className="flex flex-col gap-1">
        {NAV.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} onClick={onNavigate}
            className={({ isActive }) => cx('flex items-center gap-3 rounded-control px-3 py-2 text-sm', isActive ? 'bg-raised text-paper' : 'text-muted hover:bg-raised hover:text-paper')}>
            <Icon className="size-4" aria-hidden />{label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto space-y-2 border-t border-line pt-4">
        <p className="truncate px-1 text-xs text-muted" title={user?.email}>{user?.email} · {org.role}</p>
        <Button variant="ghost" className="w-full !justify-start" onClick={() => api.signOut()}><LogOut className="size-4" aria-hidden />Log out</Button>
      </div>
    </div>
  );
}

export function AppLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  if (loading) return <div className="p-8"><LoadingBlock label="Checking your session" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <OrgProvider user={user}>
      <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
        <aside className="hidden border-r border-line md:block"><div className="sticky top-0 h-screen"><Sidebar /></div></aside>
        <header className="flex items-center justify-between border-b border-line px-4 py-3 md:hidden">
          <Logo className="h-8 w-32" />
          <Button variant="ghost" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </header>
        {menuOpen && <div className="border-b border-line md:hidden"><Sidebar onNavigate={() => setMenuOpen(false)} /></div>}
        <div className="min-w-0">
          {isDemo && (
            <p role="note" className="border-b border-warning/30 bg-warning/5 px-4 py-2 text-xs text-warning">
              Demo mode: no Supabase project is configured. Data stays in this browser and AI drafts are simulated. See the README to connect the cloud backend.
            </p>
          )}
          <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
            <ErrorBoundary key={location.pathname}>
              <Suspense fallback={<LoadingBlock />}><Outlet /></Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </OrgProvider>
  );
}
