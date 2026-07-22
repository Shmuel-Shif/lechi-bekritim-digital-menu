-- =============================================================================
-- LECHAIM — Stage 1: Orders schema (Dine In + Take Away)
-- Run in: Supabase → SQL Editor → New query → Run
-- Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- Does NOT modify: inventory, menu_overrides, Auth.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Extensions
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1) order_sessions
--    One active dining / takeaway visit (table or pickup).
--    Many "Send Order" waves attach to the same session via orders.
-- -----------------------------------------------------------------------------
create table if not exists public.order_sessions (
  session_id      uuid primary key default gen_random_uuid(),
  order_type      text not null
                  check (order_type in ('dine_in', 'takeaway')),
  table_number    integer null
                  check (
                    table_number is null
                    or (table_number >= 60 and table_number <= 73)
                  ),
  customer_name   text null,
  customer_phone  text null,
  language        text null
                  check (language is null or language in ('he', 'en', 'el')),
  status          text not null default 'active'
                  check (status in ('active', 'bill_requested', 'closed')),
  bill_requested  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  closed_at       timestamptz null,
  notes           text null,

  -- Dine In must have a table; Take Away must not.
  constraint order_sessions_table_by_type check (
    (order_type = 'dine_in' and table_number is not null)
    or (order_type = 'takeaway' and table_number is null)
  )
);

comment on table public.order_sessions is
  'One restaurant visit: dine-in table or takeaway pickup. Orders attach here.';

comment on column public.order_sessions.customer_name is
  'Optional; primarily for takeaway. Leave null for dine-in.';

comment on column public.order_sessions.customer_phone is
  'Optional; primarily for takeaway. Leave null for dine-in.';

-- At most one open dine-in session per table
create unique index if not exists order_sessions_one_open_dine_in_per_table
  on public.order_sessions (table_number)
  where order_type = 'dine_in'
    and status in ('active', 'bill_requested')
    and table_number is not null;

create index if not exists order_sessions_status_idx
  on public.order_sessions (status);

create index if not exists order_sessions_order_type_idx
  on public.order_sessions (order_type);

create index if not exists order_sessions_updated_at_idx
  on public.order_sessions (updated_at desc);

create index if not exists order_sessions_open_takeaway_idx
  on public.order_sessions (created_at desc)
  where order_type = 'takeaway'
    and status in ('active', 'bill_requested');

-- Keep updated_at fresh
create or replace function public.set_order_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_order_sessions_updated_at on public.order_sessions;
create trigger trg_order_sessions_updated_at
  before update on public.order_sessions
  for each row
  execute function public.set_order_sessions_updated_at();

-- -----------------------------------------------------------------------------
-- 2) orders
--    One row per customer "Send Order" (kitchen/bar wave).
-- -----------------------------------------------------------------------------
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null
                  references public.order_sessions (session_id)
                  on delete cascade,
  order_number    integer not null,
  total           numeric(10, 2) not null default 0
                  check (total >= 0),
  status          text not null default 'submitted'
                  check (status in ('submitted', 'preparing', 'ready', 'served', 'cancelled')),
  language        text null
                  check (language is null or language in ('he', 'en', 'el')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint orders_unique_number_per_session
    unique (session_id, order_number)
);

comment on table public.orders is
  'One submission per "Send Order" click. Multiple orders can belong to one session.';

create index if not exists orders_session_id_idx
  on public.orders (session_id);

create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

create index if not exists orders_status_idx
  on public.orders (status);

-- Restaurant PC print tracking (customer syncs; Admin marks after print)
alter table public.orders
  add column if not exists printed_at timestamptz null;

comment on column public.orders.printed_at is
  'Set when kitchen/bar tickets were printed on the restaurant PC. NULL = awaiting print.';

create index if not exists orders_unprinted_idx
  on public.orders (created_at)
  where printed_at is null;

-- One-time (run once on existing production before enabling Admin auto-print):
-- update public.orders set printed_at = created_at where printed_at is null;

create or replace function public.set_orders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row
  execute function public.set_orders_updated_at();

-- -----------------------------------------------------------------------------
-- 3) order_items
--    Line items for each order (mains, sides, drinks, etc.).
-- -----------------------------------------------------------------------------
create table if not exists public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null
                  references public.orders (id)
                  on delete cascade,
  product_id      text not null,
  product_name    text not null default '',
  print_name      text not null default '',
  quantity        integer not null default 1
                  check (quantity > 0),
  price           numeric(10, 2) not null default 0
                  check (price >= 0),
  category        text null,
  notes           text null,
  -- Side dish label when this line is a main with an included side,
  -- or the side's own name when this line is a side item.
  side_dish       text null,
  -- Optional link: side row → parent main row within the same order
  parent_item_id  uuid null
                  references public.order_items (id)
                  on delete set null,
  created_at      timestamptz not null default now()
);

comment on table public.order_items is
  'Products within a single Send Order wave.';

comment on column public.order_items.print_name is
  'Latin kitchen/bar ticket name (printName).';

comment on column public.order_items.side_dish is
  'Optional side label for display / tickets.';

create index if not exists order_items_order_id_idx
  on public.order_items (order_id);

create index if not exists order_items_product_id_idx
  on public.order_items (product_id);

create index if not exists order_items_parent_item_id_idx
  on public.order_items (parent_item_id);

-- -----------------------------------------------------------------------------
-- 4) Row Level Security
--    Customers (anon) place orders from the public menu.
--    Admins (authenticated) manage status / close sessions.
--    Tighten later if you add customer auth.
-- -----------------------------------------------------------------------------
alter table public.order_sessions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- order_sessions
drop policy if exists "order_sessions_public_select" on public.order_sessions;
create policy "order_sessions_public_select"
on public.order_sessions
for select
to anon, authenticated
using (true);

drop policy if exists "order_sessions_public_insert" on public.order_sessions;
create policy "order_sessions_public_insert"
on public.order_sessions
for insert
to anon, authenticated
with check (true);

drop policy if exists "order_sessions_public_update" on public.order_sessions;
create policy "order_sessions_public_update"
on public.order_sessions
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "order_sessions_auth_delete" on public.order_sessions;
create policy "order_sessions_auth_delete"
on public.order_sessions
for delete
to authenticated
using (true);

-- orders
drop policy if exists "orders_public_select" on public.orders;
create policy "orders_public_select"
on public.orders
for select
to anon, authenticated
using (true);

drop policy if exists "orders_public_insert" on public.orders;
create policy "orders_public_insert"
on public.orders
for insert
to anon, authenticated
with check (true);

drop policy if exists "orders_public_update" on public.orders;
create policy "orders_public_update"
on public.orders
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "orders_auth_delete" on public.orders;
create policy "orders_auth_delete"
on public.orders
for delete
to authenticated
using (true);

-- order_items
drop policy if exists "order_items_public_select" on public.order_items;
create policy "order_items_public_select"
on public.order_items
for select
to anon, authenticated
using (true);

drop policy if exists "order_items_public_insert" on public.order_items;
create policy "order_items_public_insert"
on public.order_items
for insert
to anon, authenticated
with check (true);

drop policy if exists "order_items_public_update" on public.order_items;
create policy "order_items_public_update"
on public.order_items
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "order_items_auth_delete" on public.order_items;
create policy "order_items_auth_delete"
on public.order_items
for delete
to authenticated
using (true);

-- -----------------------------------------------------------------------------
-- 5) Realtime
-- -----------------------------------------------------------------------------
alter table public.order_sessions replica identity full;
alter table public.orders replica identity full;
alter table public.order_items replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_sessions'
  ) then
    execute 'alter publication supabase_realtime add table public.order_sessions';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    execute 'alter publication supabase_realtime add table public.orders';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_items'
  ) then
    execute 'alter publication supabase_realtime add table public.order_items';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 6) Verify
-- -----------------------------------------------------------------------------
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in ('order_sessions', 'orders', 'order_items')
order by tablename;

select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('order_sessions', 'orders', 'order_items')
order by tablename;
