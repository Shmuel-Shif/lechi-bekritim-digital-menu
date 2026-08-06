-- Meat shop: pack thaw count + session delivery fee (run in Supabase SQL Editor)
-- Safe to re-run. No new tables.

alter table public.order_items
  add column if not exists thaw_count integer null;

comment on column public.order_items.thaw_count is
  'Butcher packs to thaw (0..quantity). Null for non-butcher items.';

alter table public.order_sessions
  add column if not exists delivery_fee numeric(10, 2) null;

comment on column public.order_sessions.delivery_fee is
  'Delivery fee charged on the session (e.g. butcher delivery). Null/0 when pickup.';
