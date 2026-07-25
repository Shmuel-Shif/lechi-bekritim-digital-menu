-- =============================================================================
-- LECHAIM — Shabbat orders (additive migration)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Does NOT modify dine_in / takeaway behavior beyond allowing a new order_type.
-- =============================================================================

-- Expand order_type to include shabbat
-- Keep in sync with js/order-types.js → VALID_ORDER_TYPES
alter table public.order_sessions
  drop constraint if exists order_sessions_order_type_check;

alter table public.order_sessions
  add constraint order_sessions_order_type_check
  check (order_type in ('dine_in', 'takeaway', 'shabbat'));

-- Dine-in requires table; takeaway + shabbat must not have a table
alter table public.order_sessions
  drop constraint if exists order_sessions_table_by_type;

alter table public.order_sessions
  add constraint order_sessions_table_by_type check (
    (order_type = 'dine_in' and table_number is not null)
    or (order_type in ('takeaway', 'shabbat') and table_number is null)
  );

create index if not exists order_sessions_open_shabbat_idx
  on public.order_sessions (created_at desc)
  where order_type = 'shabbat'
    and status in ('active', 'bill_requested');

comment on column public.order_sessions.order_type is
  'dine_in | takeaway | shabbat. Shabbat orders are managed in a separate Admin tab.';
