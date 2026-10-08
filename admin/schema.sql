-- Project SEKAI Admin backend
-- Run in Supabase SQL Editor after enabling Google provider in Authentication.
-- NEVER put a service-role key in the website.

create table if not exists public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  role text not null default 'viewer' check (role in ('owner','admin','viewer')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.admin_logs enable row level security;
alter table public.site_settings enable row level security;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.admin_users where id=auth.uid() and status='active'); $$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.admin_users where id=auth.uid() and status='active' and role='owner'); $$;

revoke all on function public.is_staff() from public;
revoke all on function public.is_owner() from public;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_owner() to authenticated;

drop policy if exists admin_users_select on public.admin_users;
create policy admin_users_select on public.admin_users for select to authenticated
using (id=auth.uid() or public.is_owner());

drop policy if exists admin_users_insert on public.admin_users;
create policy admin_users_insert on public.admin_users for insert to authenticated
with check (public.is_owner());

drop policy if exists admin_users_update on public.admin_users;
create policy admin_users_update on public.admin_users for update to authenticated
using (public.is_owner()) with check (public.is_owner());

drop policy if exists admin_users_delete on public.admin_users;
create policy admin_users_delete on public.admin_users for delete to authenticated
using (public.is_owner());

drop policy if exists admin_logs_select on public.admin_logs;
create policy admin_logs_select on public.admin_logs for select to authenticated
using (actor_id=auth.uid() or public.is_owner());

drop policy if exists admin_logs_insert on public.admin_logs;
create policy admin_logs_insert on public.admin_logs for insert to authenticated
with check (actor_id=auth.uid() and public.is_staff());

drop policy if exists site_settings_select on public.site_settings;
create policy site_settings_select on public.site_settings for select to authenticated
using (public.is_staff());

drop policy if exists site_settings_write on public.site_settings;
create policy site_settings_write on public.site_settings for all to authenticated
using (public.is_staff()) with check (public.is_staff());

create index if not exists idx_admin_logs_created_at on public.admin_logs(created_at desc);
create index if not exists idx_admin_users_status on public.admin_users(status);

-- FIRST OWNER:
-- 1) Login to /admin once.
-- 2) Supabase Dashboard -> Authentication -> Users -> copy your UUID.
-- 3) Insert your account:
-- insert into public.admin_users (id,email,display_name,role)
-- values ('YOUR-AUTH-UUID','YOUR-GOOGLE-EMAIL','Owner','owner');