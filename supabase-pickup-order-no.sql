-- =============================================================================
-- LECHAIM — Public pickup order number (additive)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
-- =============================================================================

alter table public.order_sessions
  add column if not exists public_order_no integer null;

comment on column public.order_sessions.public_order_no is
  'Customer-facing Takeaway order number (unique). Null for dine-in.';

create unique index if not exists order_sessions_public_order_no_uidx
  on public.order_sessions (public_order_no)
  where public_order_no is not null;
