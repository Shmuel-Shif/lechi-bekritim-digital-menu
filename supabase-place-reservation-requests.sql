-- =============================================================================
-- LECHAIM — Place reservation REQUESTS (customer website form)
-- Separate from admin seat-hold cards (`public.reservations`) and from food orders.
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- After first install, also run: supabase-place-reservation-requests-v1.5.sql
-- (capacity RPCs + status `arrived`). Or run only the v1.5 file (it is self-contained).
-- =============================================================================

create table if not exists public.place_reservation_requests (
  id                 uuid primary key default gen_random_uuid(),
  customer_name      text not null,
  customer_phone     text not null,
  party_size         integer not null,
  notes              text null,
  arrival_time       time not null,
  reservation_date   date not null,
  status             text not null default 'pending'
                     check (status in ('pending', 'confirmed', 'arrived', 'cancelled')),
  created_at         timestamptz not null default now(),

  constraint place_res_req_name_nonempty check (length(trim(customer_name)) > 0),
  constraint place_res_req_phone_nonempty check (length(trim(customer_phone)) > 0),
  constraint place_res_req_party_size check (party_size >= 1 and party_size <= 60)
);

create index if not exists place_res_req_date_status_idx
  on public.place_reservation_requests (reservation_date, status, arrival_time);

comment on table public.place_reservation_requests is
  'Customer place-reservation REQUESTS. Status: pending|confirmed|arrived|cancelled. Capacity via v1.5 RPCs. Not food orders; not admin seat-hold cards.';

alter table public.place_reservation_requests enable row level security;

-- Public site: submit requests only
drop policy if exists "place_res_req_anon_insert" on public.place_reservation_requests;
create policy "place_res_req_anon_insert"
on public.place_reservation_requests
for insert
to anon, authenticated
with check (true);

-- Admin: read all
drop policy if exists "place_res_req_auth_select" on public.place_reservation_requests;
create policy "place_res_req_auth_select"
on public.place_reservation_requests
for select
to authenticated
using (true);

-- Admin: update status (and corrections if needed)
drop policy if exists "place_res_req_auth_update" on public.place_reservation_requests;
create policy "place_res_req_auth_update"
on public.place_reservation_requests
for update
to authenticated
using (true)
with check (true);

grant select on public.place_reservation_requests to authenticated;
grant insert on public.place_reservation_requests to anon, authenticated;
grant update on public.place_reservation_requests to authenticated;
