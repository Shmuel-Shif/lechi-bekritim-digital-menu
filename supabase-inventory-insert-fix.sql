-- =============================================================================
-- LECHAIM — FIX inventory RLS INSERT for authenticated
-- Run this NOW in Supabase SQL Editor
--
-- Why: upsert() on an EMPTY inventory table performs INSERT first.
-- If INSERT policy is missing, you get:
--   "new row violates row-level security policy for table \"inventory\""
-- =============================================================================

alter table public.inventory enable row level security;

-- Drop possible old / conflicting inventory policies
drop policy if exists "inventory_public_read" on public.inventory;
drop policy if exists "inventory_auth_insert" on public.inventory;
drop policy if exists "inventory_auth_update" on public.inventory;
drop policy if exists "inventory_auth_delete" on public.inventory;
drop policy if exists "Enable read access for all users" on public.inventory;
drop policy if exists "Enable insert for authenticated users only" on public.inventory;
drop policy if exists "Enable update for authenticated users only" on public.inventory;
drop policy if exists "Enable delete for authenticated users only" on public.inventory;

-- SELECT: public menu + admin
create policy "inventory_public_read"
on public.inventory
for select
to anon, authenticated
using (true);

-- INSERT: required for upsert() when row does not exist yet
create policy "inventory_auth_insert"
on public.inventory
for insert
to authenticated
with check (true);

-- UPDATE: required for upsert() when row already exists
create policy "inventory_auth_update"
on public.inventory
for update
to authenticated
using (true)
with check (true);

-- DELETE: admin cleanup
create policy "inventory_auth_delete"
on public.inventory
for delete
to authenticated
using (true);

-- Proof: must show INSERT for authenticated
select
  policyname,
  cmd,
  roles,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename = 'inventory'
order by cmd, policyname;
