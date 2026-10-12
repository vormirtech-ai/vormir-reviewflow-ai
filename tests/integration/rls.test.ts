// @vitest-environment node
// Runs the REAL migration in an in-process Postgres (PGlite) and attacks it as different users.
// Supabase's auth/storage schemas are replaced by minimal stand-ins, so this verifies our SQL,
// policies and triggers, not the hosted Supabase platform itself.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const SUPABASE_STANDIN = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:cardinality(string_to_array(name, '/')) - 1] $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant all on storage.objects to authenticated, service_role;
`;

const ALICE = '00000000-0000-4000-8000-00000000000a';
const BOB = '00000000-0000-4000-8000-00000000000b';
const CAROL = '00000000-0000-4000-8000-00000000000c';

let db: PGlite;
let aliceOrg: string;
let bobOrg: string;
let business: string;
let funnel: string;

/** Runs SQL the way PostgREST would for a signed-in user: role `authenticated` + JWT subject. */
async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${user ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${user ?? ''}', true);`);
    return (await tx.query<T>(sql, params)).rows;
  });
}
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STANDIN);
  const dir = join(process.cwd(), 'supabase', 'migrations');
  for (const file of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, file), 'utf8'));

  for (const [id, name] of [[ALICE, 'alice'], [BOB, 'bob'], [CAROL, 'carol']]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${name}@example.com`, { full_name: name, organization_name: `${name} org` }]);
  }
  aliceOrg = (await admin<{ organization_id: string }>(`select organization_id from organization_members where user_id = $1`, [ALICE]))[0].organization_id;
  bobOrg = (await admin<{ organization_id: string }>(`select organization_id from organization_members where user_id = $1`, [BOB]))[0].organization_id;
  business = (await as<{ id: string }>(ALICE, `insert into businesses (organization_id, name) values ($1, 'Alice Cafe') returning id`, [aliceOrg]))[0].id;
  funnel = (await as<{ id: string }>(ALICE, `insert into funnels (business_id, name, slug) values ($1, 'Main', 'alice-cafe') returning id`, [business]))[0].id;
}, 120_000);

describe('signup trigger', () => {
  it('creates a profile and a personal organization owned by the new user', async () => {
    const rows = await as<{ name: string; role: string }>(ALICE, `select o.name, m.role from organizations o join organization_members m on m.organization_id = o.id`);
    expect(rows).toEqual([{ name: 'alice org', role: 'owner' }]);
    expect(await as(ALICE, `select email from profiles`)).toEqual([{ email: 'alice@example.com' }]);
  });
});

describe('anonymous visitors', () => {
  it.each(['profiles', 'organizations', 'organization_members', 'businesses', 'funnels', 'funnel_feedback_attributes', 'funnel_sessions', 'feedback_events', 'review_draft_generations', 'qr_assets', 'audit_logs'])(
    'have no access to %s', async (table) => {
      await expect(as(null, `select * from ${table}`)).rejects.toThrow(/permission denied/);
      await expect(as(null, `delete from ${table}`)).rejects.toThrow(/permission denied/);
    });
  it('cannot call privileged functions', async () => {
    await expect(as(null, `select analytics_rows($1, current_date, current_date)`, [aliceOrg])).rejects.toThrow(/permission denied/);
    await expect(as(null, `select create_organization('x')`)).rejects.toThrow(/permission denied/);
  });
});

describe('cross-organization isolation', () => {
  it('hides every tenant table from a user in another organization', async () => {
    for (const table of ['businesses', 'funnels', 'qr_assets', 'feedback_events', 'funnel_sessions', 'review_draft_generations']) {
      expect(await as(BOB, `select * from ${table}`), table).toEqual([]);
    }
    // Bob owns his own organization, so he sees its audit log and nothing else.
    expect((await as<{ organization_id: string }>(BOB, `select distinct organization_id from audit_logs`))).toEqual([{ organization_id: bobOrg }]);
    expect(await as(BOB, `select id from organizations`)).toEqual([{ id: bobOrg }]);
    expect(await as(BOB, `select user_id from organization_members`)).toEqual([{ user_id: BOB }]);
    expect(await as(BOB, `select email from profiles`)).toEqual([{ email: 'bob@example.com' }]);
  });

  it('blocks writes aimed at another organization by guessing identifiers', async () => {
    await expect(as(BOB, `insert into businesses (organization_id, name) values ($1, 'Hijack')`, [aliceOrg])).rejects.toThrow(/row-level security/);
    await expect(as(BOB, `insert into funnels (business_id, name, slug) values ($1, 'x', 'hijack-slug')`, [business])).rejects.toThrow(/row-level security/);
    await expect(as(BOB, `insert into organization_members (organization_id, user_id, role) values ($1, $2, 'owner')`, [aliceOrg, BOB])).rejects.toThrow(/row-level security/);
    expect(await as(BOB, `update businesses set name = 'Hijacked' where id = $1 returning id`, [business])).toEqual([]);
    expect(await as(BOB, `update funnels set status = 'archived' where id = $1 returning id`, [funnel])).toEqual([]);
    expect(await as(BOB, `delete from businesses where id = $1 returning id`, [business])).toEqual([]);
    expect(await as(BOB, `update organizations set name = 'Mine' where id = $1 returning id`, [aliceOrg])).toEqual([]);
    expect((await admin<{ name: string }>(`select name from businesses where id = $1`, [business]))[0].name).toBe('Alice Cafe');
  });

  it('refuses organization management RPCs to outsiders', async () => {
    await expect(as(BOB, `select add_member_by_email($1, 'bob@example.com', 'owner')`, [aliceOrg])).rejects.toThrow(/Only an owner/);
    await expect(as(BOB, `select audit_rate_limited($1, 'analytics.export', 'analyst', 10)`, [aliceOrg])).rejects.toThrow(/Not authorized/);
    await expect(as(BOB, `select purge_expired_data()`)).rejects.toThrow(/permission denied/);
    await expect(as(BOB, `insert into organizations (name) values ('direct insert')`)).rejects.toThrow(/permission denied/);
  });

  it('never lets a signed-in user write analytics or audit rows directly', async () => {
    await expect(as(ALICE, `insert into feedback_events (funnel_id, business_id, session_id, event_type) values ($1, $2, gen_random_uuid(), 'google_click')`, [funnel, business])).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, `insert into audit_logs (organization_id, action) values ($1, 'forged')`, [aliceOrg])).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, `update profiles set email = 'other@example.com'`)).rejects.toThrow(/permission denied/);
  });
});

describe('roles inside an organization', () => {
  it('lets an analyst read but not modify, and an editor edit but not create businesses', async () => {
    await as(ALICE, `select add_member_by_email($1, 'carol@example.com', 'analyst')`, [aliceOrg]);
    expect(await as(CAROL, `select name from businesses where id = $1`, [business])).toEqual([{ name: 'Alice Cafe' }]);
    expect(await as(CAROL, `update businesses set name = 'Changed' where id = $1 returning id`, [business])).toEqual([]);
    await expect(as(CAROL, `insert into funnels (business_id, name, slug) values ($1, 'x', 'carol-funnel')`, [business])).rejects.toThrow(/row-level security/);
    expect(await as(CAROL, `select * from audit_logs where organization_id = $1`, [aliceOrg])).toEqual([]); // admins and owners only
    expect(await as(CAROL, `update organization_members set role = 'owner' where organization_id = $1 and user_id = $2 returning id`, [aliceOrg, CAROL])).toEqual([]); // no self-promotion

    await as(ALICE, `update organization_members set role = 'editor' where organization_id = $1 and user_id = $2`, [aliceOrg, CAROL]);
    expect(await as(CAROL, `update businesses set description = 'Edited by editor' where id = $1 returning id`, [business])).toHaveLength(1);
    await expect(as(CAROL, `insert into businesses (organization_id, name) values ($1, 'New')`, [aliceOrg])).rejects.toThrow(/row-level security/);
    expect(await as(CAROL, `delete from funnels where id = $1 returning id`, [funnel])).toEqual([]); // admin+
    expect(await as(CAROL, `update organizations set name = 'x' where id = $1 returning id`, [aliceOrg])).toEqual([]); // owner only
  });

  it('keeps at least one owner', async () => {
    await expect(as(ALICE, `update organization_members set role = 'admin' where organization_id = $1 and user_id = $2`, [aliceOrg, ALICE])).rejects.toThrow(/at least one owner/);
    await expect(as(ALICE, `delete from organization_members where organization_id = $1 and user_id = $2`, [aliceOrg, ALICE])).rejects.toThrow(/at least one owner/);
  });

  it('records an audit trail visible to owners', async () => {
    const actions = (await as<{ action: string }>(ALICE, `select action from audit_logs where organization_id = $1`, [aliceOrg])).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['businesses.insert', 'funnels.insert', 'businesses.update', 'organization_members.update']));
  });
});

describe('funnel guards', () => {
  it('requires a review URL to publish and then freezes the slug', async () => {
    await expect(as(ALICE, `update funnels set status = 'published' where id = $1`, [funnel])).rejects.toThrow(/Google review URL/);
    await expect(as(ALICE, `update businesses set google_review_url = 'http://insecure.example/review' where id = $1`, [business])).rejects.toThrow(/check constraint/);
    await as(ALICE, `update businesses set google_review_url = 'https://g.page/r/alice/review' where id = $1`, [business]);
    await as(ALICE, `update funnels set slug = 'alice-cafe-main' where id = $1`, [funnel]); // still a draft: allowed
    const [row] = await as<{ published_at: string | null }>(ALICE, `update funnels set status = 'published' where id = $1 returning published_at`, [funnel]);
    expect(row.published_at).not.toBeNull();
    await expect(as(ALICE, `update funnels set slug = 'renamed' where id = $1`, [funnel])).rejects.toThrow(/permanent/);
    await as(ALICE, `update funnels set status = 'draft' where id = $1`, [funnel]);
    await expect(as(ALICE, `update funnels set slug = 'renamed' where id = $1`, [funnel])).rejects.toThrow(/permanent/); // printed codes survive unpublishing
    await as(ALICE, `update funnels set status = 'published' where id = $1`, [funnel]);
  });
  it('rejects invalid slugs, colours and languages', async () => {
    const insert = (cols: string, vals: string) => as(ALICE, `insert into funnels (business_id, name, ${cols}) values ($1, 'x', ${vals})`, [business]);
    await expect(insert('slug', `'Bad Slug!'`)).rejects.toThrow(/check constraint/);
    await expect(insert('slug, primary_color', `'ok-slug-1', 'red'`)).rejects.toThrow(/check constraint/);
    await expect(insert('slug, languages', `'ok-slug-2', '{fr}'`)).rejects.toThrow(/check constraint/);
    await expect(insert('slug', `'alice-cafe-main'`)).rejects.toThrow(/unique/);
  });
});

describe('analytics', () => {
  it('aggregates server-side and only for members of the organization', async () => {
    const session = '00000000-0000-4000-8000-0000000000e1';
    await admin(`insert into funnel_sessions (id, funnel_id, source) values ($1, $2, 'qr')`, [session, funnel]);
    for (const type of ['visit', 'attribute_select', 'attribute_select', 'google_click']) {
      await admin(`insert into feedback_events (funnel_id, business_id, session_id, event_type, source) values ($1, $2, $3, $4, 'qr')`, [funnel, business, session, type]);
    }
    const rows = await as<{ event_type: string; events: number; sessions: number }>(ALICE, `select event_type, events::int, sessions::int from analytics_rows($1, current_date - 1, current_date + 1) order by event_type`, [aliceOrg]);
    expect(rows).toEqual([
      { event_type: 'attribute_select', events: 2, sessions: 1 },
      { event_type: 'google_click', events: 1, sessions: 1 },
      { event_type: 'visit', events: 1, sessions: 1 },
    ]);
    expect(await as(ALICE, `select * from analytics_rows($1, current_date - 1, current_date + 1, null, null, 'direct')`, [aliceOrg])).toEqual([]);
    expect(await as(ALICE, `select * from analytics_rows($1, current_date - 30, current_date - 20)`, [aliceOrg])).toEqual([]);
    expect(await as(BOB, `select * from analytics_rows($1, current_date - 1, current_date + 1)`, [aliceOrg])).toEqual([]); // outsider sees nothing
    await expect(admin(`insert into feedback_events (funnel_id, business_id, session_id, event_type) values ($1, $2, $3, 'published_review')`, [funnel, business, session])).rejects.toThrow(/check constraint/);
  });

  it('rate-limits authenticated exports per user', async () => {
    const call = () => as<{ ok: boolean }>(ALICE, `select audit_rate_limited($1, 'analytics.export', 'analyst', 2) as ok`, [aliceOrg]);
    expect((await call())[0].ok).toBe(true);
    expect((await call())[0].ok).toBe(true);
    expect((await call())[0].ok).toBe(false);
  });

  it('purges events older than the organization retention period', async () => {
    const old = '00000000-0000-4000-8000-0000000000e2';
    await admin(`insert into funnel_sessions (id, funnel_id, created_at) values ($1, $2, now() - interval '400 days')`, [old, funnel]);
    await admin(`insert into feedback_events (funnel_id, business_id, session_id, event_type, created_at) values ($1, $2, $3, 'visit', now() - interval '400 days')`, [funnel, business, old]);
    await admin(`select purge_expired_data()`);
    expect(await admin(`select 1 from funnel_sessions where id = $1`, [old])).toEqual([]);
    expect((await admin<{ n: number }>(`select count(*)::int as n from feedback_events where funnel_id = $1`, [funnel]))[0].n).toBe(4); // recent events kept
  });
});

describe('logo storage', () => {
  it('only lets editors and above upload into their own organization folder', async () => {
    await as(ALICE, `insert into storage.objects (bucket_id, name) values ('logos', $1)`, [`${aliceOrg}/logo.png`]);
    await expect(as(BOB, `insert into storage.objects (bucket_id, name) values ('logos', $1)`, [`${aliceOrg}/evil.png`])).rejects.toThrow(/row-level security/);
    await expect(as(ALICE, `insert into storage.objects (bucket_id, name) values ('other', $1)`, [`${aliceOrg}/x.png`])).rejects.toThrow(/row-level security/);
    const [bucket] = await admin<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>(`select public, file_size_limit::int, allowed_mime_types from storage.buckets where id = 'logos'`);
    expect(bucket).toEqual({ public: true, file_size_limit: 1048576, allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp'] });
  });
});
