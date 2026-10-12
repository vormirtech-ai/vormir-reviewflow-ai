import type { Business, FunnelInput } from '../../types.ts';
import { slugify } from '../../../supabase/functions/_shared/validate.ts';

// Descriptive aspects only. None of them steers a customer towards a rating.
export const DEFAULT_ATTRIBUTES: FunnelInput['attributes'] = [
  { label: 'Friendly staff', label_hi: 'मिलनसार स्टाफ़', enabled: true },
  { label: 'Product quality', label_hi: 'उत्पाद की गुणवत्ता', enabled: true },
  { label: 'Clean environment', label_hi: 'साफ़-सुथरा माहौल', enabled: true },
  { label: 'Fast service', label_hi: 'तेज़ सेवा', enabled: true },
  { label: 'Good value', label_hi: 'पैसे की सही कीमत', enabled: true },
  { label: 'Convenient location', label_hi: 'सुविधाजनक स्थान', enabled: true },
  { label: 'Overall experience', label_hi: 'कुल मिलाकर अनुभव', enabled: true },
  { label: 'Areas for improvement', label_hi: 'सुधार की गुंजाइश', enabled: true },
];

export function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, '0');
}

export function defaultFunnel(business: Business): FunnelInput {
  return {
    business_id: business.id,
    name: 'In-store feedback',
    slug: `${slugify(business.name).slice(0, 40) || 'feedback'}-${randomSuffix()}`,
    heading: `How was your experience at ${business.name}?`,
    description: 'Your honest feedback helps us improve and helps others decide.',
    instructions: 'Pick what describes your visit. You stay in control of every word.',
    cta_text: 'Share your feedback',
    languages: [business.default_language],
    show_logo: true,
    primary_color: null,
    background_color: null,
    ai_enabled: true,
    allow_notes: true,
    max_selections: 5,
    max_regenerations: 2,
    review_url: null,
    qr_settings: {},
    attributes: DEFAULT_ATTRIBUTES.map((a) => ({ ...a })),
  };
}
