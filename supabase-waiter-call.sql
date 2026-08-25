-- =============================================================================
-- LECHAIM — Dine-in "call waiter" flag on open table sessions
-- Run in: Supabase → SQL Editor → New query → Run
-- Safe to re-run.
--
-- Customer menu sets waiter_called + waiter_need.
-- Admin confirms arrival → both cleared. Does NOT touch till / print / close.
-- =============================================================================

alter table public.order_sessions
  add column if not exists waiter_called boolean not null default false;

alter table public.order_sessions
  add column if not exists waiter_need text null;

comment on column public.order_sessions.waiter_called is
  'True while the dine-in table is calling a waiter. Admin clears after arrival.';

comment on column public.order_sessions.waiter_need is
  'Comma-separated need ids: water, cutlery, napkin, other.';

create index if not exists order_sessions_waiter_called_idx
  on public.order_sessions (waiter_called)
  where waiter_called = true;
