// Mirrors the RLS policies in supabase/migrations. The database is the authority;
// this only decides what the UI offers and what the demo backend allows.
export const ROLES = ['analyst', 'editor', 'admin', 'owner'] as const;
export type Role = (typeof ROLES)[number];

const MIN_ROLE = {
  'analytics.view': 'analyst',
  'business.update': 'editor',
  'business.create': 'admin',
  'business.archive': 'admin',
  'funnel.write': 'editor',
  'funnel.delete': 'admin',
  'asset.write': 'editor',
  'audit.view': 'admin',
  'org.manage': 'owner',
  'members.manage': 'owner',
} as const satisfies Record<string, Role>;
export type Action = keyof typeof MIN_ROLE;

export function can(role: Role | null | undefined, action: Action): boolean {
  return !!role && ROLES.indexOf(role) >= ROLES.indexOf(MIN_ROLE[action]);
}
