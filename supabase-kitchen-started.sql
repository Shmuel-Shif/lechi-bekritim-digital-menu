-- LECHAIM — Kitchen "started cooking" + new-wave ack (independent of table/order status).
-- Does NOT change print, till, table close, prices, or order_sessions.status.
-- Safe to re-run.

alter table public.order_sessions
  add column if not exists kitchen_started_at timestamptz;

alter table public.order_sessions
  add column if not exists kitchen_wave_ack_at timestamptz;

comment on column public.order_sessions.kitchen_started_at is
  'Cook tapped the new (blue) table card to start preparing. Independent of status / bill_requested / printed_at.';

comment on column public.order_sessions.kitchen_wave_ack_at is
  'Cook acknowledged the latest printed kitchen wave. Later printed_at values are a new (orange) wave.';

-- Tables already open at deploy time should not all turn blue.
update public.order_sessions
  set kitchen_started_at = coalesce(updated_at, created_at, now())
  where kitchen_started_at is null
    and status in ('active', 'bill_requested');

update public.order_sessions
  set kitchen_wave_ack_at = kitchen_started_at
  where kitchen_wave_ack_at is null
    and kitchen_started_at is not null;