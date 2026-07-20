-- LECHAIM — menu content overrides (name / description / price / image)
-- Catalog source remains MENU_DATA in code; this table stores admin edits only.

create table if not exists public.menu_overrides (
  product_id text primary key,
  name text,
  description text,
  price numeric,
  image text,
  updated_at timestamptz default now()
);

alter table public.menu_overrides enable row level security;

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

-- Enable Realtime for menu_overrides in Dashboard → Database → Replication
