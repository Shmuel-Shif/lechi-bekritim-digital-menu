-- =============================================================================
-- LECHAIM — Butcher shop orders (additive migration)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Does NOT modify dine_in / takeaway / shabbat behavior beyond allowing a new
-- order_type and optional weight columns on order_items.
-- Keep in sync with js/order-types.js → VALID_ORDER_TYPES
-- =============================================================================

-- Expand order_type to include butcher
alter table public.order_sessions
  drop constraint if exists order_sessions_order_type_check;

alter table public.order_sessions
  add constraint order_sessions_order_type_check
  check (order_type in ('dine_in', 'takeaway', 'shabbat', 'butcher'));

-- Dine-in requires table; takeaway / shabbat / butcher must not have a table
alter table public.order_sessions
  drop constraint if exists order_sessions_table_by_type;

alter table public.order_sessions
  add constraint order_sessions_table_by_type check (
    (order_type = 'dine_in' and table_number is not null)
    or (order_type in ('takeaway', 'shabbat', 'butcher') and table_number is null)
  );

create index if not exists order_sessions_open_butcher_idx
  on public.order_sessions (created_at desc)
  where order_type = 'butcher'
    and status in ('active', 'bill_requested');

comment on column public.order_sessions.order_type is
  'dine_in | takeaway | shabbat | butcher. Butcher = חנות בשר (weight-based products).';

-- Weight / unit fields on line items (nullable — restaurant lines leave them null)
alter table public.order_items
  add column if not exists unit_type text;

alter table public.order_items
  add column if not exists selected_weight numeric;

alter table public.order_items
  add column if not exists price_per_kg numeric;

comment on column public.order_items.unit_type is
  'Optional unit: kg for butcher shop lines; null for restaurant items.';

comment on column public.order_items.selected_weight is
  'Selected weight in kg for butcher lines (e.g. 1.5).';

comment on column public.order_items.price_per_kg is
  'Price per kilogram for butcher lines; line price stores the computed total.';
