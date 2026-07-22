-- =============================================================================
-- LECHAIM — Self Pickup fields (additive migration)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
-- =============================================================================

alter table public.order_sessions
  add column if not exists pickup_type text null
    check (pickup_type is null or pickup_type in ('ASAP', 'TIME'));

alter table public.order_sessions
  add column if not exists pickup_time text null;

comment on column public.order_sessions.pickup_type is
  'Self Pickup only: ASAP or TIME. Null for dine-in.';

comment on column public.order_sessions.pickup_time is
  'Self Pickup scheduled time HH:MM when pickup_type = TIME. Null for ASAP / dine-in.';

comment on column public.order_sessions.notes is
  'Customer notes for Self Pickup (optional). Not kitchen item notes.';

comment on column public.order_sessions.customer_name is
  'Required for Self Pickup; optional for dine-in.';

comment on column public.order_sessions.customer_phone is
  'Required for Self Pickup; optional for dine-in.';
