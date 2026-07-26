-- =============================================================================
-- LECHAIM — Seat reservations for today (admin hold cards)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
-- =============================================================================

create table if not exists public.reservations (
  id                 uuid primary key default gen_random_uuid(),
  customer_name      text not null,
  customer_phone     text not null,
  notes              text null,
  arrival_time       time not null,
  reservation_date   date not null default (timezone('Europe/Athens', now()))::date,
  status             text not null default 'open'
                     check (status in ('open', 'closed')),
  created_at         timestamptz not null default now(),

  constraint reservations_name_nonempty check (length(trim(customer_name)) > 0),
  constraint reservations_phone_nonempty check (length(trim(customer_phone)) > 0)
);

create index if not exists reservations_today_open_idx
  on public.reservations (reservation_date, status, arrival_time)
  where status = 'open';

comment on table public.reservations is
  'Admin-only seat hold cards for a given day (name/phone/notes/arrival). Not food orders.';

alter table public.reservations enable row level security;

drop policy if exists "reservations_auth_select" on public.reservations;
create policy "reservations_auth_select"
on public.reservations
for select
to authenticated
using (true);

drop policy if exists "reservations_auth_insert" on public.reservations;
create policy "reservations_auth_insert"
on public.reservations
for insert
to authenticated
with check (true);

drop policy if exists "reservations_auth_update" on public.reservations;
create policy "reservations_auth_update"
on public.reservations
for update
to authenticated
using (true)
with check (true);

drop policy if exists "reservations_auth_delete" on public.reservations;
create policy "reservations_auth_delete"
on public.reservations
for delete
to authenticated
using (true);

grant select, insert, update, delete on public.reservations to authenticated;
