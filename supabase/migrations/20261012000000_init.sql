-- Vormir ReviewFlow AI: schema, Row Level Security and server-side helpers.
-- Access model: anonymous visitors have NO table access at all. Public funnel pages are served
-- by Edge Functions using the service role. Signed-in users are limited by organization role.

-- Order matters: roles compare with >=.
create type public.org_role as enum ('analyst', 'editor', 'admin', 'owner');

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '' check (char_length(full_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  retention_days integer not null default 365 check (retention_days between 30 and 1095),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null default 'analyst',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  category text not null default 'other' check (char_length(category) <= 40),
  description text not null default '' check (char_length(description) <= 1000),
  logo_url text check (logo_url is null or logo_url ~* '^https?://'),
  website text check (website is null or website ~* '^https?://'),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  address text check (address is null or char_length(address) <= 300),
  time_zone text not null default 'UTC',
  default_language text not null default 'en' check (default_language in ('en', 'hi')),
  google_place_id text check (google_place_id is null or char_length(google_place_id) <= 200),
  google_review_url text check (google_review_url is null or (google_review_url ~* '^https://' and char_length(google_review_url) <= 2048)),
  brand_primary text not null default '#111111' check (brand_primary ~ '^#[0-9a-fA-F]{6}$'),
  brand_background text not null default '#ffffff' check (brand_background ~ '^#[0-9a-fA-F]{6}$'),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index businesses_org_idx on public.businesses (organization_id, status);

create table public.funnels (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  heading text not null default '' check (char_length(heading) <= 120),
  description text not null default '' check (char_length(description) <= 400),
  instructions text not null default '' check (char_length(instructions) <= 400),
  cta_text text not null default 'Share your feedback' check (char_length(cta_text) between 1 and 60),
  languages text[] not null default '{en}' check (languages <@ array['en', 'hi'] and cardinality(languages) >= 1),
  show_logo boolean not null default true,
  primary_color text check (primary_color is null or primary_color ~ '^#[0-9a-fA-F]{6}$'),
  background_color text check (background_color is null or background_color ~ '^#[0-9a-fA-F]{6}$'),
  ai_enabled boolean not null default true,
  allow_notes boolean not null default true,
  max_selections integer not null default 5 check (max_selections between 1 and 8),
  max_regenerations integer not null default 2 check (max_regenerations between 0 and 5),
  review_url text check (review_url is null or (review_url ~* '^https://' and char_length(review_url) <= 2048)),
  qr_settings jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index funnels_business_idx on public.funnels (business_id, status);
-- slug lookups use the unique index on funnels.slug

create table public.funnel_feedback_attributes (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  label_hi text check (label_hi is null or char_length(label_hi) <= 60),
  position integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index funnel_feedback_attributes_funnel_idx on public.funnel_feedback_attributes (funnel_id, position);

-- Anonymous visit. The id is a random value created in the visitor's browser tab; no personal data.
create table public.funnel_sessions (
  id uuid primary key,
  funnel_id uuid not null references public.funnels (id) on delete cascade,
  source text not null default 'direct' check (source ~ '^[a-z0-9_-]{1,32}$'),
  ip_hash text,
  created_at timestamptz not null default now()
);
create index funnel_sessions_funnel_idx on public.funnel_sessions (funnel_id, created_at);

create table public.feedback_events (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  session_id uuid not null references public.funnel_sessions (id) on delete cascade,
  event_type text not null check (event_type in (
    'visit', 'attribute_select', 'notes_added', 'draft_select', 'manual_write', 'template_used', 'copy', 'google_click',
    'generate_request', 'generate_success', 'generate_error', 'regenerate')),
  source text not null default 'direct' check (source ~ '^[a-z0-9_-]{1,32}$'),
  attribute_id uuid references public.funnel_feedback_attributes (id) on delete set null,
  created_at timestamptz not null default now()
);
create index feedback_events_funnel_time_idx on public.feedback_events (funnel_id, created_at);
create index feedback_events_business_time_idx on public.feedback_events (business_id, created_at);
create index feedback_events_session_time_idx on public.feedback_events (session_id, created_at);

-- Metadata only. Customer notes and generated draft text are never stored.
create table public.review_draft_generations (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels (id) on delete cascade,
  session_id uuid not null,
  ip_hash text,
  language text not null,
  attribute_count integer not null check (attribute_count between 1 and 20),
  regenerate boolean not null default false,
  status text not null check (status in ('success', 'quota', 'timeout', 'malformed', 'provider_error')),
  provider text not null,
  model text not null,
  created_at timestamptz not null default now()
);
create index review_draft_generations_funnel_time_idx on public.review_draft_generations (funnel_id, created_at);
create index review_draft_generations_session_idx on public.review_draft_generations (session_id, created_at);
create index review_draft_generations_ip_idx on public.review_draft_generations (ip_hash, created_at);
create index review_draft_generations_status_idx on public.review_draft_generations (status, created_at);

create table public.qr_assets (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('qr_png', 'qr_svg', 'flyer_pdf', 'flyer_png')),
  layout text check (layout is null or layout in ('tabletop', 'poster', 'receipt', 'business_card')),
  target_url text not null check (target_url ~* '^https?://'),
  settings jsonb not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index qr_assets_funnel_idx on public.qr_assets (funnel_id, created_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_org_time_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, action, created_at);

-- ---------------------------------------------------------------- authorization helpers
-- SECURITY DEFINER so policies can read membership without recursing into its own RLS.
-- Each one has a fixed search_path and only ever answers about the calling user.

create function public.has_org_role(p_org uuid, p_min public.org_role default 'analyst')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.role >= p_min
  );
$$;

create function public.has_business_role(p_business uuid, p_min public.org_role default 'analyst')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.businesses b
    join public.organization_members m on m.organization_id = b.organization_id
    where b.id = p_business and m.user_id = (select auth.uid()) and m.role >= p_min
  );
$$;

create function public.has_funnel_role(p_funnel uuid, p_min public.org_role default 'analyst')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.funnels f
    join public.businesses b on b.id = f.business_id
    join public.organization_members m on m.organization_id = b.organization_id
    where f.id = p_funnel and m.user_id = (select auth.uid()) and m.role >= p_min
  );
$$;

create function public.shares_org_with(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members a
    join public.organization_members b on b.organization_id = a.organization_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  );
$$;

-- ---------------------------------------------------------------- triggers

create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger organizations_updated before update on public.organizations for each row execute function public.set_updated_at();
create trigger businesses_updated before update on public.businesses for each row execute function public.set_updated_at();
create trigger funnels_updated before update on public.funnels for each row execute function public.set_updated_at();

-- A printed QR code must keep working: the slug is permanent once a funnel has been published.
create function public.funnels_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.published_at is not null and new.slug <> old.slug then
      raise exception 'The public link is permanent once a funnel has been published.' using errcode = '23514';
    end if;
    if new.business_id <> old.business_id then
      raise exception 'A funnel cannot be moved to another business.' using errcode = '23514';
    end if;
  end if;
  if new.status = 'published' then
    if coalesce(new.review_url, (select b.google_review_url from public.businesses b where b.id = new.business_id)) is null then
      raise exception 'Add the official Google review URL before publishing.' using errcode = '23514';
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end $$;
create trigger funnels_guard before insert or update on public.funnels for each row execute function public.funnels_guard();

-- An organization must always keep at least one owner.
create function public.members_keep_owner() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.organizations o where o.id = old.organization_id)
     and not exists (
       select 1 from public.organization_members m
       where m.organization_id = old.organization_id and m.role = 'owner' and m.id <> old.id) then
    raise exception 'An organization must keep at least one owner.' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger members_keep_owner before update or delete on public.organization_members
  for each row execute function public.members_keep_owner();

-- Audit trail for significant administrative changes.
create function public.audit_row() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  v_org uuid;
begin
  if tg_op = 'DELETE' then r := to_jsonb(old); else r := to_jsonb(new); end if;
  if tg_table_name = 'funnels' then
    select b.organization_id into v_org from public.businesses b where b.id = (r ->> 'business_id')::uuid;
  else
    v_org := (r ->> 'organization_id')::uuid;
  end if;
  -- Skip rows removed by a cascading delete of their organization or business.
  if v_org is not null and exists (select 1 from public.organizations o where o.id = v_org) then
    insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_org, (select auth.uid()), tg_table_name || '.' || lower(tg_op), tg_table_name, (r ->> 'id')::uuid,
            jsonb_strip_nulls(jsonb_build_object('name', r ->> 'name', 'status', r ->> 'status', 'role', r ->> 'role')));
  end if;
  return null;
end $$;
create trigger businesses_audit after insert or update or delete on public.businesses for each row execute function public.audit_row();
create trigger funnels_audit after insert or update or delete on public.funnels for each row execute function public.audit_row();
create trigger members_audit after insert or update or delete on public.organization_members for each row execute function public.audit_row();

-- New account: profile plus a personal organization the user owns.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120));
  insert into public.organizations (name, created_by)
  values (left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'organization_name'), ''), 'My organization'), 120), new.id)
  returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role) values (v_org, new.id, 'owner');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- RPC

create function public.create_organization(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  insert into public.organizations (name, created_by) values (p_name, (select auth.uid())) returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role) values (v_org, (select auth.uid()), 'owner');
  return v_org;
end $$;

-- No email service needed: the person must already have an account.
create function public.add_member_by_email(p_org uuid, p_email text, p_role public.org_role) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if not public.has_org_role(p_org, 'owner') then
    raise exception 'Only an owner can manage members.' using errcode = '42501';
  end if;
  select p.id into v_user from public.profiles p where lower(p.email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'No account uses that email yet. Ask them to sign up first.' using errcode = 'P0002';
  end if;
  insert into public.organization_members (organization_id, user_id, role) values (p_org, v_user, p_role)
  on conflict (organization_id, user_id) do update set role = excluded.role;
  return v_user;
end $$;

-- Authorization gate + audit entry + per-user rate limit for authenticated Edge Functions.
create function public.audit_rate_limited(
  p_org uuid, p_action text, p_min_role public.org_role, p_limit_per_minute integer, p_entity uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_org_role(p_org, p_min_role) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if (select count(*) from public.audit_logs a
      where a.actor_id = (select auth.uid()) and a.action = p_action and a.created_at > now() - interval '1 minute')
     >= least(greatest(p_limit_per_minute, 1), 120) then
    return false;
  end if;
  insert into public.audit_logs (organization_id, actor_id, action, entity_id)
  values (p_org, (select auth.uid()), left(p_action, 60), p_entity);
  return true;
end $$;

-- Aggregated analytics. SECURITY INVOKER: Row Level Security on the tables below still applies.
create function public.analytics_rows(
  p_org uuid, p_from date, p_to date, p_business uuid default null, p_funnel uuid default null, p_source text default null)
returns table (day date, business_id uuid, funnel_id uuid, source text, event_type text, events bigint, sessions bigint)
language sql stable security invoker set search_path = '' as $$
  select (e.created_at at time zone 'UTC')::date, e.business_id, e.funnel_id, e.source, e.event_type,
         count(*), count(distinct e.session_id)
  from public.feedback_events e
  join public.businesses b on b.id = e.business_id
  where b.organization_id = p_org
    and e.created_at >= p_from::timestamp at time zone 'UTC'
    and e.created_at < (p_to + 1)::timestamp at time zone 'UTC'
    and (p_business is null or e.business_id = p_business)
    and (p_funnel is null or e.funnel_id = p_funnel)
    and (p_source is null or e.source = p_source)
  group by 1, 2, 3, 4, 5
  order by 1;
$$;

-- Retention. Schedule with pg_cron (see README); not callable through the API.
create function public.purge_expired_data() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.funnel_sessions s using public.funnels f, public.businesses b, public.organizations o
  where f.id = s.funnel_id and b.id = f.business_id and o.id = b.organization_id
    and s.created_at < now() - make_interval(days => o.retention_days);
  delete from public.feedback_events e using public.businesses b, public.organizations o
  where b.id = e.business_id and o.id = b.organization_id
    and e.created_at < now() - make_interval(days => o.retention_days);
  delete from public.review_draft_generations g using public.funnels f, public.businesses b, public.organizations o
  where f.id = g.funnel_id and b.id = f.business_id and o.id = b.organization_id
    and g.created_at < now() - make_interval(days => o.retention_days);
  delete from public.audit_logs a where a.created_at < now() - interval '2 years';
end $$;

-- ---------------------------------------------------------------- privileges
-- Start from nothing, then grant exactly what each role needs.

revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select on public.profiles, public.organizations, public.organization_members, public.businesses, public.funnels,
  public.funnel_feedback_attributes, public.funnel_sessions, public.feedback_events, public.review_draft_generations,
  public.qr_assets, public.audit_logs to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant update (name, retention_days), delete on public.organizations to authenticated;
grant insert, update (role), delete on public.organization_members to authenticated;
grant insert, update, delete on public.businesses, public.funnels, public.funnel_feedback_attributes to authenticated;
grant insert, delete on public.qr_assets to authenticated;

grant execute on function public.has_org_role(uuid, public.org_role), public.has_business_role(uuid, public.org_role),
  public.has_funnel_role(uuid, public.org_role), public.shares_org_with(uuid), public.create_organization(text),
  public.add_member_by_email(uuid, text, public.org_role),
  public.audit_rate_limited(uuid, text, public.org_role, integer, uuid),
  public.analytics_rows(uuid, date, date, uuid, uuid, text) to authenticated;

grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- ---------------------------------------------------------------- row level security

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.businesses enable row level security;
alter table public.funnels enable row level security;
alter table public.funnel_feedback_attributes enable row level security;
alter table public.funnel_sessions enable row level security;
alter table public.feedback_events enable row level security;
alter table public.review_draft_generations enable row level security;
alter table public.qr_assets enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_org_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy organizations_select on public.organizations for select to authenticated using (public.has_org_role(id, 'analyst'));
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_org_role(id, 'owner')) with check (public.has_org_role(id, 'owner'));
create policy organizations_delete on public.organizations for delete to authenticated using (public.has_org_role(id, 'owner'));

create policy members_select on public.organization_members for select to authenticated using (public.has_org_role(organization_id, 'analyst'));
create policy members_insert on public.organization_members for insert to authenticated with check (public.has_org_role(organization_id, 'owner'));
create policy members_update on public.organization_members for update to authenticated
  using (public.has_org_role(organization_id, 'owner')) with check (public.has_org_role(organization_id, 'owner'));
create policy members_delete on public.organization_members for delete to authenticated using (public.has_org_role(organization_id, 'owner'));

create policy businesses_select on public.businesses for select to authenticated using (public.has_org_role(organization_id, 'analyst'));
create policy businesses_insert on public.businesses for insert to authenticated with check (public.has_org_role(organization_id, 'admin'));
create policy businesses_update on public.businesses for update to authenticated
  using (public.has_org_role(organization_id, 'editor')) with check (public.has_org_role(organization_id, 'editor'));
create policy businesses_delete on public.businesses for delete to authenticated using (public.has_org_role(organization_id, 'admin'));

create policy funnels_select on public.funnels for select to authenticated using (public.has_business_role(business_id, 'analyst'));
create policy funnels_insert on public.funnels for insert to authenticated with check (public.has_business_role(business_id, 'editor'));
create policy funnels_update on public.funnels for update to authenticated
  using (public.has_business_role(business_id, 'editor')) with check (public.has_business_role(business_id, 'editor'));
create policy funnels_delete on public.funnels for delete to authenticated using (public.has_business_role(business_id, 'admin'));

create policy attributes_select on public.funnel_feedback_attributes for select to authenticated using (public.has_funnel_role(funnel_id, 'analyst'));
create policy attributes_insert on public.funnel_feedback_attributes for insert to authenticated with check (public.has_funnel_role(funnel_id, 'editor'));
create policy attributes_update on public.funnel_feedback_attributes for update to authenticated
  using (public.has_funnel_role(funnel_id, 'editor')) with check (public.has_funnel_role(funnel_id, 'editor'));
create policy attributes_delete on public.funnel_feedback_attributes for delete to authenticated using (public.has_funnel_role(funnel_id, 'editor'));

-- Analytics tables: members may read; only the service role (Edge Functions) writes.
create policy sessions_select on public.funnel_sessions for select to authenticated using (public.has_funnel_role(funnel_id, 'analyst'));
create policy events_select on public.feedback_events for select to authenticated using (public.has_business_role(business_id, 'analyst'));
create policy generations_select on public.review_draft_generations for select to authenticated using (public.has_funnel_role(funnel_id, 'analyst'));

create policy qr_assets_select on public.qr_assets for select to authenticated using (public.has_business_role(business_id, 'analyst'));
create policy qr_assets_insert on public.qr_assets for insert to authenticated
  with check (public.has_funnel_role(funnel_id, 'editor') and public.has_business_role(business_id, 'editor') and created_by = (select auth.uid()));
create policy qr_assets_delete on public.qr_assets for delete to authenticated using (public.has_business_role(business_id, 'editor'));

create policy audit_logs_select on public.audit_logs for select to authenticated using (public.has_org_role(organization_id, 'admin'));

-- ---------------------------------------------------------------- storage (business logos)
-- Public read by URL; uploads limited to 1 MB raster images under "<organization_id>/..." by editors and above.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.has_org_role(((storage.foldername(name))[1])::uuid, 'editor'));
create policy logos_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and public.has_org_role(((storage.foldername(name))[1])::uuid, 'editor'));
create policy logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and public.has_org_role(((storage.foldername(name))[1])::uuid, 'editor'));
