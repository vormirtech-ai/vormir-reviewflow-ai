// Field names match the database columns, so rows need no mapping layer.
import type { Role } from '../supabase/functions/_shared/roles.ts';
import type { Language } from '../supabase/functions/_shared/validate.ts';

export type { Role, Language };
export type { AnalyticsRow, Summary } from '../supabase/functions/_shared/analytics.ts';
export type { PublicFunnel } from '../supabase/functions/_shared/core.ts';

export interface AuthUser { id: string; email: string; full_name: string }
export interface Org { id: string; name: string; retention_days: number; role: Role }
export interface Member { user_id: string; role: Role; email: string; full_name: string }

export interface BusinessInput {
  name: string;
  category: string;
  description: string;
  logo_url: string | null;
  website: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  time_zone: string;
  default_language: Language;
  google_place_id: string | null;
  google_review_url: string | null;
  brand_primary: string;
  brand_background: string;
}
export interface Business extends BusinessInput {
  id: string;
  organization_id: string;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface Attribute { id: string; label: string; label_hi: string | null; position: number; enabled: boolean }
export interface QrSettings { fg?: string; bg?: string; logo?: boolean }

export interface FunnelInput {
  business_id: string;
  name: string;
  slug: string;
  heading: string;
  description: string;
  instructions: string;
  cta_text: string;
  languages: Language[];
  show_logo: boolean;
  primary_color: string | null;
  background_color: string | null;
  ai_enabled: boolean;
  allow_notes: boolean;
  max_selections: number;
  max_regenerations: number;
  review_url: string | null;
  qr_settings: QrSettings;
  attributes: { id?: string; label: string; label_hi: string | null; enabled: boolean }[];
}
export type FunnelStatus = 'draft' | 'published' | 'archived';
export interface Funnel extends Omit<FunnelInput, 'attributes'> {
  id: string;
  status: FunnelStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  attributes: Attribute[];
}

export type AssetKind = 'qr_png' | 'qr_svg' | 'flyer_pdf' | 'flyer_png';
export type FlyerLayout = 'tabletop' | 'poster' | 'receipt' | 'business_card';
export interface QrAssetInput { funnelId: string; kind: AssetKind; layout?: FlyerLayout; settings?: QrSettings }
export interface QrAsset { id: string; funnel_id: string; kind: AssetKind; layout: FlyerLayout | null; target_url: string; created_at: string }

export interface AnalyticsFilters {
  organizationId: string;
  from: string; // YYYY-MM-DD
  to: string;
  businessId?: string;
  funnelId?: string;
  source?: string;
}
