-- =============================================================================
-- LECHAIM — Place reservation requests V1.5 (capacity + arrived)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
-- =============================================================================
-- Capacity: 60 seats. Average sit: 75 minutes.
-- Customer slots: half-hour 14:00–20:30 (restaurant closes 21:00).
-- Occupancy counts: confirmed + arrived only (not pending/cancelled).
-- =============================================================================

-- Ensure base table exists (idempotent with v1 create script)
create table if not exists public.place_reservation_requests (
  id                 uuid primary key default gen_random_uuid(),
  customer_name      text not null,
  customer_phone     text not null,
  party_size         integer not null,
  notes              text null,
  arrival_time       time not null,
  reservation_date   date not null,
  status             text not null default 'pending',
  created_at         timestamptz not null default now(),

  constraint place_res_req_name_nonempty check (length(trim(customer_name)) > 0),
  constraint place_res_req_phone_nonempty check (length(trim(customer_phone)) > 0),
  constraint place_res_req_party_size check (party_size >= 1 and party_size <= 60)
);

-- Expand allowed statuses to include arrived
alter table public.place_reservation_requests
  drop constraint if exists place_reservation_requests_status_check;

alter table public.place_reservation_requests
  drop constraint if exists place_res_req_status_check;

alter table public.place_reservation_requests
  add constraint place_reservation_requests_status_check
  check (status in ('pending', 'confirmed', 'arrived', 'cancelled'));

create index if not exists place_res_req_date_status_idx
  on public.place_reservation_requests (reservation_date, status, arrival_time);

comment on table public.place_reservation_requests is
  'Customer place-reservation REQUESTS. Status: pending|confirmed|arrived|cancelled. Capacity uses confirmed+arrived with 75-minute windows. Not food orders; not admin seat-hold cards.';

alter table public.place_reservation_requests enable row level security;

drop policy if exists "place_res_req_anon_insert" on public.place_reservation_requests;
create policy "place_res_req_anon_insert"
on public.place_reservation_requests
for insert
to anon, authenticated
with check (true);

drop policy if exists "place_res_req_auth_select" on public.place_reservation_requests;
create policy "place_res_req_auth_select"
on public.place_reservation_requests
for select
to authenticated
using (true);

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

-- -----------------------------------------------------------------------------
-- Occupancy helpers (no PII) — used by customer UI + create RPC
-- Holding seats: pending + confirmed + arrived (cancelled does not hold).
-- Admin "תפוסה מאושרת" meter filters confirmed+arrived in the client.
-- -----------------------------------------------------------------------------
drop function if exists public.get_place_reservation_occupancy(date);

create or replace function public.get_place_reservation_occupancy(p_date date)
returns table (id uuid, arrival_time time, party_size integer, status text)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.arrival_time, r.party_size, r.status
  from public.place_reservation_requests r
  where r.reservation_date = p_date
    and r.status in ('pending', 'confirmed', 'arrived');
$$;

revoke all on function public.get_place_reservation_occupancy(date) from public;
grant execute on function public.get_place_reservation_occupancy(date) to anon, authenticated;

-- Atomic create with capacity check (75-minute overlap window, max 60)
create or replace function public.create_place_reservation_request(
  p_customer_name text,
  p_customer_phone text,
  p_party_size integer,
  p_reservation_date date,
  p_arrival_time time,
  p_notes text default null
)
returns public.place_reservation_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_customer_name, ''));
  v_phone text := trim(coalesce(p_customer_phone, ''));
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_new_start int;
  v_new_end int;
  v_occupied int := 0;
  v_hh int;
  v_mm int;
  v_row public.place_reservation_requests;
begin
  if length(v_name) = 0 then
    raise exception 'NAME_REQUIRED';
  end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) < 8 then
    raise exception 'PHONE_INVALID';
  end if;
  if p_party_size is null or p_party_size < 1 or p_party_size > 60 then
    raise exception 'PARTY_SIZE_INVALID';
  end if;
  if p_reservation_date is null then
    raise exception 'DATE_REQUIRED';
  end if;
  if p_arrival_time is null then
    raise exception 'TIME_REQUIRED';
  end if;

  v_hh := extract(hour from p_arrival_time)::int;
  v_mm := extract(minute from p_arrival_time)::int;

  -- Half-hour slots only: 14:00–20:30
  if v_mm not in (0, 30) then
    raise exception 'TIME_INVALID';
  end if;
  if (v_hh < 14) or (v_hh > 20) or (v_hh = 20 and v_mm > 30) then
    raise exception 'TIME_INVALID';
  end if;

  v_new_start := v_hh * 60 + v_mm;
  v_new_end := v_new_start + 75;

  -- Count pending + confirmed + arrived so soft holds cannot overbook
  select coalesce(sum(r.party_size), 0)::int
    into v_occupied
  from public.place_reservation_requests r
  where r.reservation_date = p_reservation_date
    and r.status in ('pending', 'confirmed', 'arrived')
    and (extract(hour from r.arrival_time)::int * 60
         + extract(minute from r.arrival_time)::int) < v_new_end
    and (extract(hour from r.arrival_time)::int * 60
         + extract(minute from r.arrival_time)::int + 75) > v_new_start;

  if v_occupied + p_party_size > 60 then
    raise exception 'CAPACITY_EXCEEDED';
  end if;

  insert into public.place_reservation_requests (
    customer_name,
    customer_phone,
    party_size,
    notes,
    reservation_date,
    arrival_time,
    status
  ) values (
    v_name,
    v_phone,
    p_party_size,
    v_notes,
    p_reservation_date,
    p_arrival_time,
    'pending'
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_place_reservation_request(text, text, integer, date, time, text) from public;
grant execute on function public.create_place_reservation_request(text, text, integer, date, time, text) to anon, authenticated;

-- Admin: permanently remove cards from the list
drop policy if exists "place_res_req_auth_delete" on public.place_reservation_requests;
create policy "place_res_req_auth_delete"
on public.place_reservation_requests
for delete
to authenticated
using (true);

grant delete on public.place_reservation_requests to authenticated;
