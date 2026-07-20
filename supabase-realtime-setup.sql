-- =============================================================================
-- LECHAIM — Complete Realtime + write setup (safe to run more than once)
-- Run this entire file in: Supabase → SQL Editor → New query → Run
-- =============================================================================

-- 0) Ensure inventory schema
create table if not exists public.inventory (
  product_id text primary key,
  available boolean not null default true
);

alter table public.inventory
  alter column available set default true;

-- 1) Ensure menu_overrides schema
create table if not exists public.menu_overrides (
  product_id text primary key,
  name text,
  description text,
  price numeric,
  image text,
  updated_at timestamptz default now()
);

-- 2) RLS
alter table public.inventory enable row level security;
alter table public.menu_overrides enable row level security;

-- inventory policies
drop policy if exists "inventory_public_read" on public.inventory;
create policy "inventory_public_read"
on public.inventory
for select
to anon, authenticated
using (true);

drop policy if exists "inventory_auth_insert" on public.inventory;
create policy "inventory_auth_insert"
on public.inventory
for insert
to authenticated
with check (true);

drop policy if exists "inventory_auth_update" on public.inventory;
create policy "inventory_auth_update"
on public.inventory
for update
to authenticated
using (true)
with check (true);

drop policy if exists "inventory_auth_delete" on public.inventory;
create policy "inventory_auth_delete"
on public.inventory
for delete
to authenticated
using (true);

-- menu_overrides policies
drop policy if exists "menu_overrides_public_read" on public.menu_overrides;
create policy "menu_overrides_public_read"
on public.menu_overrides
for select
to anon, authenticated
using (true);

drop policy if exists "menu_overrides_auth_insert" on public.menu_overrides;
create policy "menu_overrides_auth_insert"
on public.menu_overrides
for insert
to authenticated
with check (true);

drop policy if exists "menu_overrides_auth_update" on public.menu_overrides;
create policy "menu_overrides_auth_update"
on public.menu_overrides
for update
to authenticated
using (true)
with check (true);

drop policy if exists "menu_overrides_auth_delete" on public.menu_overrides;
create policy "menu_overrides_auth_delete"
on public.menu_overrides
for delete
to authenticated
using (true);

-- 3) Replica identity for UPDATE payloads
alter table public.inventory replica identity full;
alter table public.menu_overrides replica identity full;

-- 4) Add tables to Realtime publication only if missing
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inventory'
  ) then
    execute 'alter publication supabase_realtime add table public.inventory';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'menu_overrides'
  ) then
    execute 'alter publication supabase_realtime add table public.menu_overrides';
  end if;
end $$;

-- 5) Proof queries (you should see both table names below)
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('inventory', 'menu_overrides')
order by tablename;

select policyname, tablename, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('inventory', 'menu_overrides')
order by tablename, policyname;
