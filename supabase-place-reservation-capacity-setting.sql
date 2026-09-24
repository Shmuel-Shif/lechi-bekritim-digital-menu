-- =============================================================================
-- LECHAIM — Place-reservation capacity from restaurant_flags (admin settings)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Flags:
--   place_res_capacity            flag_text = seats ("1"–"60"), default 30
--   place_res_capacity_lock_until flag_text = ISO deadline while editing locked
-- =============================================================================

-- Allow party sizes up to absolute max (capacity check uses flag, not this alone)
alter table public.place_reservation_requests
  drop constraint if exists place_res_req_party_size;

alter table public.place_reservation_requests
  add constraint place_res_req_party_size
  check (party_size >= 1 and party_size <= 60);

create or replace function public.get_place_reservation_capacity()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_text text;
  v_seats int;
begin
  select nullif(trim(coalesce(flag_text, '')), '')
    into v_text
  from public.restaurant_flags
  where flag_key = 'place_res_capacity'
  limit 1;

  if v_text is null then
    return 30;
  end if;

  begin
    v_seats := floor(v_text::numeric)::int;
  exception when others then
    return 30;
  end;

  if v_seats is null or v_seats < 1 then
    return 30;
  end if;
  if v_seats > 60 then
    return 60;
  end if;
  return v_seats;
end;
$$;

revoke all on function public.get_place_reservation_capacity() from public;
grant execute on function public.get_place_reservation_capacity() to anon, authenticated;

-- Create RPC: 45-minute hold window, capacity from flag (fallback 30)
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
  v_mins int;
  v_cap int := public.get_place_reservation_capacity();
  v_row public.place_reservation_requests;
begin
  if length(v_name) = 0 then
    raise exception 'NAME_REQUIRED';
  end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) < 8 then
    raise exception 'PHONE_INVALID';
  end if;
  if p_party_size is null or p_party_size < 1 or p_party_size > v_cap then
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
  v_mins := v_hh * 60 + v_mm;

  if v_mm not in (0, 30) then
    raise exception 'TIME_INVALID';
  end if;
  if v_mins < (14 * 60) or v_mins > (21 * 60) then
    raise exception 'TIME_INVALID';
  end if;

  v_new_start := v_mins;
  v_new_end := v_new_start + 45;

  select coalesce(sum(r.party_size), 0)::int
    into v_occupied
  from public.place_reservation_requests r
  where r.reservation_date = p_reservation_date
    and r.status in ('pending', 'confirmed', 'arrived')
    and (extract(hour from r.arrival_time)::int * 60
         + extract(minute from r.arrival_time)::int) < v_new_end
    and (extract(hour from r.arrival_time)::int * 60
         + extract(minute from r.arrival_time)::int + 45) > v_new_start;

  if v_occupied + p_party_size > v_cap then
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

-- Seed default capacity if missing (does not overwrite an existing value)
insert into public.restaurant_flags (flag_key, flag_value, flag_text, updated_at)
values ('place_res_capacity', true, '30', now())
on conflict (flag_key) do nothing;
