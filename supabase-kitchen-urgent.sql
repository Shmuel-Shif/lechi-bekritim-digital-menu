-- LECHAIM — Per-item kitchen urgent flag (admin → kitchen tablet).
-- Does NOT change print, till, table close, prices, or order_sessions.status.
-- Safe to re-run.

alter table public.order_items
  add column if not exists kitchen_urgent boolean;

alter table public.order_items
  alter column kitchen_urgent set default false;

update public.order_items
  set kitchen_urgent = false
  where kitchen_urgent is null;

alter table public.order_items
  alter column kitchen_urgent set not null;

comment on column public.order_items.kitchen_urgent is
  'Admin marked this dish as urgent for the kitchen tablet. Independent of kitchen_status.';
