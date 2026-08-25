-- =============================================================================
-- LECHAIM — Mark a today's place reservation as arrived by guest name
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Used when a dine-in guest answers «הזמנתם מקום?» and enters the booking name.
-- Anon cannot read/update place_reservation_requests (RLS); this SECURITY DEFINER
-- RPC matches today's pending/confirmed rows and sets status = arrived.
-- Does not return phone numbers.
-- =============================================================================

create or replace function public.place_res_norm_name(p_name text)
returns text
language sql
immutable
as $$
  select lower(trim(both from regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')));
$$;

create or replace function public.mark_place_reservation_arrived(
  p_customer_name text,
  p_party_size integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
  v_now_mins int;
  v_norm text;
  v_party int;
  v_id uuid;
  v_count int;
begin
  v_norm := public.place_res_norm_name(p_customer_name);
  if v_norm is null or length(v_norm) < 2 then
    return jsonb_build_object('matched', false, 'reason', 'none');
  end if;

  v_today := (timezone('Europe/Athens', now()))::date;
  v_now_mins := extract(hour from timezone('Europe/Athens', now()))::int * 60
    + extract(minute from timezone('Europe/Athens', now()))::int;
  v_party := case
    when p_party_size is null then null
    when p_party_size between 1 and 30 then p_party_size
    else null
  end;

  /* 1) Exact normalized name, today's pending/confirmed */
  select count(*) into v_count
  from public.place_reservation_requests r
  where r.reservation_date = v_today
    and r.status in ('pending', 'confirmed')
    and public.place_res_norm_name(r.customer_name) = v_norm;

  if v_count = 1 then
    select r.id into v_id
    from public.place_reservation_requests r
    where r.reservation_date = v_today
      and r.status in ('pending', 'confirmed')
      and public.place_res_norm_name(r.customer_name) = v_norm;
  elsif v_count > 1 then
    /* Prefer matching party size when several share the same name */
    if v_party is not null then
      select count(*) into v_count
      from public.place_reservation_requests r
      where r.reservation_date = v_today
        and r.status in ('pending', 'confirmed')
        and public.place_res_norm_name(r.customer_name) = v_norm
        and r.party_size = v_party;

      if v_count = 1 then
        select r.id into v_id
        from public.place_reservation_requests r
        where r.reservation_date = v_today
          and r.status in ('pending', 'confirmed')
          and public.place_res_norm_name(r.customer_name) = v_norm
          and r.party_size = v_party;
      elsif v_count > 1 then
        select r.id into v_id
        from public.place_reservation_requests r
        where r.reservation_date = v_today
          and r.status in ('pending', 'confirmed')
          and public.place_res_norm_name(r.customer_name) = v_norm
          and r.party_size = v_party
        order by abs((extract(hour from r.arrival_time)::int * 60
          + extract(minute from r.arrival_time)::int) - v_now_mins) asc,
          case when r.status = 'confirmed' then 0 else 1 end,
          r.created_at asc
        limit 1;
      end if;
    end if;

    if v_id is null then
      select r.id into v_id
      from public.place_reservation_requests r
      where r.reservation_date = v_today
        and r.status in ('pending', 'confirmed')
        and public.place_res_norm_name(r.customer_name) = v_norm
      order by abs((extract(hour from r.arrival_time)::int * 60
        + extract(minute from r.arrival_time)::int) - v_now_mins) asc,
        case when r.status = 'confirmed' then 0 else 1 end,
        r.created_at asc
      limit 1;
    end if;
  end if;

  /* 2) Fuzzy: "דוד כהן" vs "דוד" / "כהן דוד", only if unique (or unique+party) */
  if v_id is null then
    select count(*) into v_count
    from public.place_reservation_requests r
    where r.reservation_date = v_today
      and r.status in ('pending', 'confirmed')
      and (
        public.place_res_norm_name(r.customer_name) like v_norm || ' %'
        or public.place_res_norm_name(r.customer_name) like '% ' || v_norm
        or v_norm like public.place_res_norm_name(r.customer_name) || ' %'
        or v_norm like '% ' || public.place_res_norm_name(r.customer_name)
      );

    if v_count = 1 then
      select r.id into v_id
      from public.place_reservation_requests r
      where r.reservation_date = v_today
        and r.status in ('pending', 'confirmed')
        and (
          public.place_res_norm_name(r.customer_name) like v_norm || ' %'
          or public.place_res_norm_name(r.customer_name) like '% ' || v_norm
          or v_norm like public.place_res_norm_name(r.customer_name) || ' %'
          or v_norm like '% ' || public.place_res_norm_name(r.customer_name)
        );
    elsif v_count > 1 and v_party is not null then
      select count(*) into v_count
      from public.place_reservation_requests r
      where r.reservation_date = v_today
        and r.status in ('pending', 'confirmed')
        and r.party_size = v_party
        and (
          public.place_res_norm_name(r.customer_name) like v_norm || ' %'
          or public.place_res_norm_name(r.customer_name) like '% ' || v_norm
          or v_norm like public.place_res_norm_name(r.customer_name) || ' %'
          or v_norm like '% ' || public.place_res_norm_name(r.customer_name)
        );

      if v_count = 1 then
        select r.id into v_id
        from public.place_reservation_requests r
        where r.reservation_date = v_today
          and r.status in ('pending', 'confirmed')
          and r.party_size = v_party
          and (
            public.place_res_norm_name(r.customer_name) like v_norm || ' %'
            or public.place_res_norm_name(r.customer_name) like '% ' || v_norm
            or v_norm like public.place_res_norm_name(r.customer_name) || ' %'
            or v_norm like '% ' || public.place_res_norm_name(r.customer_name)
          );
      else
        return jsonb_build_object('matched', false, 'reason', 'ambiguous');
      end if;
    elsif v_count > 1 then
      return jsonb_build_object('matched', false, 'reason', 'ambiguous');
    end if;
  end if;

  if v_id is null then
    return jsonb_build_object('matched', false, 'reason', 'none');
  end if;

  update public.place_reservation_requests
  set status = 'arrived'
  where id = v_id
    and status in ('pending', 'confirmed');

  if not found then
    return jsonb_build_object('matched', false, 'reason', 'none');
  end if;

  return jsonb_build_object('matched', true, 'id', v_id);
end;
$$;

revoke all on function public.place_res_norm_name(text) from public;

revoke all on function public.mark_place_reservation_arrived(text, integer) from public;
grant execute on function public.mark_place_reservation_arrived(text, integer) to anon, authenticated;
