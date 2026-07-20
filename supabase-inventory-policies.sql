-- LECHAIM inventory RLS
-- Schema: product_id text PK, available boolean default true
--
-- upsert() on empty table = INSERT → requires inventory_auth_insert
-- upsert() on existing row = UPDATE → requires inventory_auth_update

alter table public.inventory enable row level security;

drop policy if exists "inventory_public_read" on public.inventory;
create policy "inventory_public_read"
on public.inventory
for select
to anon, authenticated
using (true);

-- CRITICAL for first Toggle when table is empty
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
