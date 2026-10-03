-- =============================================================================
-- LECHAIM — Warehouse stock quantities + custom products
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Isolated from dish `inventory`, till, orders, documents, Restaurant OS.
-- =============================================================================

create table if not exists public.warehouse_stock (
  product_id   text primary key,
  name         text not null,
  category_id  text not null,
  group_id     text null,
  qty          numeric(12, 2) not null default 0
               check (qty >= 0),
  is_custom    boolean not null default false,
  updated_at   timestamptz not null default now(),
  constraint warehouse_stock_name_len check (char_length(trim(name)) between 1 and 120),
  constraint warehouse_stock_category_len check (char_length(trim(category_id)) between 1 and 80),
  constraint warehouse_stock_product_len check (char_length(trim(product_id)) between 1 and 120)
);

create index if not exists warehouse_stock_category_idx
  on public.warehouse_stock (category_id, name);

comment on table public.warehouse_stock is
  'Warehouse raw-goods qty and custom products. Separate from menu dish inventory.';

create or replace function public.warehouse_stock_touch()
returns trigger
language plpgsql
as $$
begin
  new.name := trim(new.name);
  new.category_id := trim(new.category_id);
  new.product_id := trim(new.product_id);
  if new.group_id is not null then
    new.group_id := nullif(trim(new.group_id), '');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_warehouse_stock_touch on public.warehouse_stock;
create trigger trg_warehouse_stock_touch
before insert or update on public.warehouse_stock
for each row
execute function public.warehouse_stock_touch();

alter table public.warehouse_stock enable row level security;
alter table public.warehouse_stock force row level security;

revoke all on table public.warehouse_stock from public, anon;
grant select, insert, update, delete on table public.warehouse_stock to authenticated;

drop policy if exists "warehouse_stock_auth_select" on public.warehouse_stock;
create policy "warehouse_stock_auth_select"
on public.warehouse_stock
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "warehouse_stock_auth_insert" on public.warehouse_stock;
create policy "warehouse_stock_auth_insert"
on public.warehouse_stock
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "warehouse_stock_auth_update" on public.warehouse_stock;
create policy "warehouse_stock_auth_update"
on public.warehouse_stock
for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "warehouse_stock_auth_delete" on public.warehouse_stock;
create policy "warehouse_stock_auth_delete"
on public.warehouse_stock
for delete
to authenticated
using (auth.uid() is not null);

notify pgrst, 'reload schema';
