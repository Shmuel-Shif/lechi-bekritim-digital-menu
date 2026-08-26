-- =============================================================================
-- LECHAIM — Kitchen tablet alerts (fire / gas / out of stock / message)
-- Run in: Supabase → SQL Editor → New query → Run
-- Safe to re-run.
--
-- Kitchen tablet INSERTs. Admin acknowledges. Does NOT touch till / print /
-- table close / MENU_DATA prices.
-- =============================================================================

create table if not exists public.kitchen_alerts (
  id              uuid primary key default gen_random_uuid(),
  alert_type      text not null,
  product_id      text null,
  product_name    text null,
  message         text null,
  status          text not null default 'open',
  source          text not null default 'kitchen_tablet',
  created_at      timestamptz not null default now(),
  acknowledged_at timestamptz null,

  constraint kitchen_alerts_type_len
    check (char_length(alert_type) between 1 and 40),
  constraint kitchen_alerts_status_ok
    check (status in ('open', 'acknowledged')),
  constraint kitchen_alerts_message_len
    check (message is null or char_length(trim(message)) <= 500),
  constraint kitchen_alerts_product_name_len
    check (product_name is null or char_length(product_name) <= 120)
);

create index if not exists kitchen_alerts_open_created_idx
  on public.kitchen_alerts (created_at desc)
  where status = 'open';

create index if not exists kitchen_alerts_created_idx
  on public.kitchen_alerts (created_at desc);

comment on table public.kitchen_alerts is
  'Kitchen tablet → owner. Types are app-defined (fire, gas, out_of_stock, message). Admin ack only.';

alter table public.kitchen_alerts enable row level security;

drop policy if exists "kitchen_alerts_anon_insert" on public.kitchen_alerts;
create policy "kitchen_alerts_anon_insert"
on public.kitchen_alerts for insert
to anon, authenticated
with check (status = 'open');

drop policy if exists "kitchen_alerts_public_select" on public.kitchen_alerts;
create policy "kitchen_alerts_public_select"
on public.kitchen_alerts for select
to anon, authenticated
using (true);

drop policy if exists "kitchen_alerts_auth_update" on public.kitchen_alerts;
create policy "kitchen_alerts_auth_update"
on public.kitchen_alerts for update
to authenticated
using (true)
with check (true);

alter table public.kitchen_alerts replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'kitchen_alerts'
  ) then
    execute 'alter publication supabase_realtime add table public.kitchen_alerts';
  end if;
end $$;
