import { z } from 'zod';
import { isHttpsUrl } from '../../../supabase/functions/_shared/validate.ts';
import type { Business, BusinessInput } from '../../types.ts';

export const HEX = /^#[0-9a-fA-F]{6}$/;
export const httpsOrEmpty = z.string().trim().refine((v) => v === '' || isHttpsUrl(v), 'Enter a full URL starting with https://');

export const CATEGORIES = ['cafe', 'restaurant', 'hotel', 'retail', 'salon', 'clinic', 'real_estate', 'local_service', 'agency', 'other'] as const;
export const categoryLabel = (c: string) => c.replace('_', ' ').replace(/^./, (m) => m.toUpperCase());

// Empty strings mean "not provided"; they are stored as NULL.
export const businessSchema = z.object({
  name: z.string().trim().min(1, 'Enter the business name').max(120),
  category: z.enum(CATEGORIES),
  description: z.string().max(1000),
  website: z.string().trim().max(2048).refine((v) => v === '' || (/^https?:\/\//i.test(v) && URL.canParse(v)), 'Enter a full URL starting with https://'),
  contact_email: z.union([z.literal(''), z.email('Enter a valid email address')]),
  contact_phone: z.string().max(40),
  address: z.string().max(300),
  time_zone: z.string().min(1),
  default_language: z.enum(['en', 'hi']),
  google_place_id: z.string().trim().max(200),
  google_review_url: httpsOrEmpty,
  brand_primary: z.string().regex(HEX, 'Use a colour like #111111'),
  brand_background: z.string().regex(HEX, 'Use a colour like #ffffff'),
});
export type BusinessForm = z.infer<typeof businessSchema>;

export const emptyBusiness: BusinessForm = {
  name: '', category: 'cafe', description: '', website: '', contact_email: '', contact_phone: '', address: '',
  time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', default_language: 'en', google_place_id: '', google_review_url: '',
  brand_primary: '#111111', brand_background: '#ffffff',
};

export function toForm(b: Business): BusinessForm {
  return {
    name: b.name, category: (CATEGORIES as readonly string[]).includes(b.category) ? (b.category as BusinessForm['category']) : 'other',
    description: b.description, website: b.website ?? '', contact_email: b.contact_email ?? '', contact_phone: b.contact_phone ?? '',
    address: b.address ?? '', time_zone: b.time_zone, default_language: b.default_language, google_place_id: b.google_place_id ?? '',
    google_review_url: b.google_review_url ?? '', brand_primary: b.brand_primary, brand_background: b.brand_background,
  };
}

export function toInput(f: BusinessForm, logoUrl: string | null): BusinessInput {
  const n = (v: string) => v.trim() || null;
  return {
    ...f, logo_url: logoUrl, website: n(f.website), contact_email: n(f.contact_email), contact_phone: n(f.contact_phone), address: n(f.address),
    google_place_id: n(f.google_place_id), google_review_url: n(f.google_review_url),
  };
}

export function toBusinessInput(b: Business): BusinessInput {
  const { id: _id, organization_id: _org, status: _status, created_at: _c, updated_at: _u, ...input } = b;
  return input;
}
