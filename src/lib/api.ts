import type {
  AnalyticsFilters, AnalyticsRow, AuthUser, Business, BusinessInput, Funnel, FunnelInput, FunnelStatus, Member, Org, QrAsset, QrAssetInput, Role,
} from '../types.ts';
import { isDemo } from './env.ts';

export * from './errors.ts';

/** Dashboard data access. Implemented by Supabase (supabaseApi.ts) and by the browser demo backend (mock.ts). */
export interface Api {
  getUser(): Promise<AuthUser | null>;
  onAuthChange(cb: (user: AuthUser | null, event: string) => void): () => void;
  signUp(v: { email: string; password: string; fullName: string; organizationName: string }): Promise<{ needsEmailConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  updateProfile(fullName: string): Promise<void>;

  listOrgs(): Promise<Org[]>;
  createOrg(name: string): Promise<string>;
  updateOrg(id: string, patch: { name: string; retention_days: number }): Promise<void>;
  listMembers(orgId: string): Promise<Member[]>;
  addMember(orgId: string, email: string, role: Role): Promise<void>;
  setMemberRole(orgId: string, userId: string, role: Role): Promise<void>;
  removeMember(orgId: string, userId: string): Promise<void>;

  listBusinesses(orgId: string): Promise<Business[]>;
  getBusiness(id: string): Promise<Business>;
  saveBusiness(orgId: string, input: BusinessInput, id?: string): Promise<Business>;
  setBusinessStatus(id: string, status: Business['status']): Promise<void>;
  uploadLogo(orgId: string, file: File): Promise<string>;

  listFunnels(orgId: string): Promise<Funnel[]>;
  getFunnel(id: string): Promise<Funnel>;
  saveFunnel(input: FunnelInput, id?: string): Promise<Funnel>;
  setFunnelStatus(id: string, status: FunnelStatus): Promise<void>;
  duplicateFunnel(id: string): Promise<Funnel>;

  analytics(filters: AnalyticsFilters): Promise<AnalyticsRow[]>;
  exportAnalyticsCsv(filters: AnalyticsFilters): Promise<string>;
  createQrAsset(input: QrAssetInput): Promise<QrAsset>;
  listQrAssets(orgId: string): Promise<QrAsset[]>;
}

// Loaded lazily so the demo backend never ships in a configured production bundle path, and vice versa.
export const api: Api = isDemo ? (await import('./mock.ts')).mockApi : (await import('./supabaseApi.ts')).supabaseApi;
