-- =============================================================================
-- LECHAIM — Takeaway / Delivery fields (additive migration)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
-- =============================================================================

alter table public.order_sessions
  add column if not exists customer_address text null;

alter table public.order_sessions
  add column if not exists fulfillment_type text null;

alter table public.order_sessions
  drop constraint if exists order_sessions_fulfillment_type_check;

alter table public.order_sessions
  add constraint order_sessions_fulfillment_type_check
  check (
    fulfillment_type is null
    or fulfillment_type in ('pickup', 'delivery')
  );

comment on column public.order_sessions.customer_address is
  'Delivery address for takeaway+delivery orders. Null for pickup / dine-in / butcher.';

comment on column public.order_sessions.fulfillment_type is
  'takeaway only: pickup | delivery. Null for other order types.';

-- Admin toggle: when true, customer UI hides all delivery wording/options.
insert into public.restaurant_flags (flag_key, flag_value)
values ('deliveries_closed', false)
on conflict (flag_key) do nothing;
