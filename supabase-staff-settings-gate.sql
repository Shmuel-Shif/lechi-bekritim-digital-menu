-- =============================================================================
-- LECHAIM — Staff settings access gate
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Requires: supabase-staff-hours.sql (staff_employees, staff_shifts,
--           staff_clock, staff_upsert_employee).
--
-- Does NOT alter staff_clock. Clock in/out keeps working without unlock.
-- After this script, set the access code once (SQL Editor, as postgres):
--   select public.staff_settings_set_code('YOUR_CODE_HERE');
-- Do not put the real code in the website files.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- 1) Secret (hash only) + per-user unlock rows
-- -----------------------------------------------------------------------------
create table if not exists public.staff_settings_secrets (
  id          integer primary key default 1
              check (id = 1),
  code_hash   text not null,
  updated_at  timestamptz not null default now()
);

create table if not exists public.staff_settings_unlocks (
  user_id      uuid primary key,
  unlocked_at  timestamptz not null default now()
);

alter table public.staff_settings_secrets enable row level security;
alter table public.staff_settings_unlocks enable row level security;
alter table public.staff_settings_secrets force row level security;
alter table public.staff_settings_unlocks force row level security;

revoke all on table public.staff_settings_secrets from public, anon, authenticated;
revoke all on table public.staff_settings_unlocks from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) Helpers / RPCs
-- -----------------------------------------------------------------------------
create or replace function public.staff_settings_is_unlocked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (
       select 1
       from public.staff_settings_unlocks u
       where u.user_id = auth.uid()
     );
$$;

revoke all on function public.staff_settings_is_unlocked() from public;
grant execute on function public.staff_settings_is_unlocked() to authenticated;

create or replace function public.staff_settings_set_code(p_code text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_code is null or length(trim(p_code)) < 4 then
    raise exception 'code_too_short';
  end if;
  if length(trim(p_code)) > 64 then
    raise exception 'code_too_long';
  end if;

  insert into public.staff_settings_secrets (id, code_hash, updated_at)
  values (1, extensions.crypt(trim(p_code), extensions.gen_salt('bf')), now())
  on conflict (id) do update
    set code_hash = excluded.code_hash,
        updated_at = now();

  delete from public.staff_settings_unlocks;
end;
$$;

revoke all on function public.staff_settings_set_code(text) from public, anon, authenticated;

create or replace function public.staff_settings_unlock(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_code is null or length(trim(p_code)) < 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select s.code_hash into v_hash
  from public.staff_settings_secrets s
  where s.id = 1
  limit 1;

  if v_hash is null then
    return jsonb_build_object('ok', false, 'error', 'code_not_set');
  end if;

  if extensions.crypt(trim(p_code), v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  insert into public.staff_settings_unlocks (user_id, unlocked_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set unlocked_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.staff_settings_unlock(text) from public;
grant execute on function public.staff_settings_unlock(text) to authenticated;

create or replace function public.staff_settings_lock()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', true);
  end if;

  delete from public.staff_settings_unlocks
  where user_id = auth.uid();

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.staff_settings_lock() from public;
grant execute on function public.staff_settings_lock() to authenticated;

-- Open-now list for the clock panel. No salary, bank, ids, or hashes.
create or replace function public.staff_open_now()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  return jsonb_build_object(
    'ok', true,
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'employee_name', e.name_en,
          'clock_in', s.clock_in
        )
        order by s.clock_in desc
      )
      from public.staff_shifts s
      join public.staff_employees e on e.id = s.employee_id
      where s.clock_out is null
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.staff_open_now() from public;
grant execute on function public.staff_open_now() to authenticated;

-- -----------------------------------------------------------------------------
-- 3) Upsert employee — same behavior, plus unlock required
--    (SECURITY DEFINER bypasses RLS, so the check must live here.)
-- -----------------------------------------------------------------------------
create or replace function public.staff_upsert_employee(
  p_id uuid,
  p_name_en text,
  p_position text,
  p_hourly_rate numeric,
  p_bank_account text,
  p_bank_name text,
  p_active boolean,
  p_pin text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_lookup text;
  v_hash text;
  v_existing uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.staff_settings_is_unlocked() then
    raise exception 'not_unlocked';
  end if;

  if p_name_en is null or length(trim(p_name_en)) = 0 then
    raise exception 'name_required';
  end if;

  if p_hourly_rate is null or p_hourly_rate < 0 then
    raise exception 'invalid_hourly_rate';
  end if;

  if p_id is null then
    if p_pin is null or length(trim(p_pin)) < 4 or length(trim(p_pin)) > 12 then
      raise exception 'pin_required';
    end if;
    if trim(p_pin) !~ '^[0-9]+$' then
      raise exception 'pin_digits_only';
    end if;

    v_lookup := public.staff_pin_lookup(p_pin);
    select id into v_existing
    from public.staff_employees
    where pin_lookup = v_lookup
    limit 1;
    if v_existing is not null then
      raise exception 'pin_taken';
    end if;

    v_hash := public.staff_pin_hash(p_pin);

    insert into public.staff_employees (
      name_en, position, pin_lookup, pin_hash,
      hourly_rate, bank_account, bank_name, active
    ) values (
      trim(p_name_en),
      coalesce(trim(p_position), ''),
      v_lookup,
      v_hash,
      round(p_hourly_rate::numeric, 2),
      coalesce(trim(p_bank_account), ''),
      coalesce(trim(p_bank_name), ''),
      coalesce(p_active, true)
    )
    returning id into v_id;

    return v_id;
  end if;

  if not exists (select 1 from public.staff_employees where id = p_id) then
    raise exception 'employee_not_found';
  end if;

  if p_pin is not null and length(trim(p_pin)) > 0 then
    if length(trim(p_pin)) < 4 or length(trim(p_pin)) > 12 then
      raise exception 'invalid_pin';
    end if;
    if trim(p_pin) !~ '^[0-9]+$' then
      raise exception 'pin_digits_only';
    end if;

    v_lookup := public.staff_pin_lookup(p_pin);
    select id into v_existing
    from public.staff_employees
    where pin_lookup = v_lookup and id <> p_id
    limit 1;
    if v_existing is not null then
      raise exception 'pin_taken';
    end if;

    v_hash := public.staff_pin_hash(p_pin);

    update public.staff_employees set
      name_en = trim(p_name_en),
      position = coalesce(trim(p_position), ''),
      hourly_rate = round(p_hourly_rate::numeric, 2),
      bank_account = coalesce(trim(p_bank_account), ''),
      bank_name = coalesce(trim(p_bank_name), ''),
      active = coalesce(p_active, true),
      pin_lookup = v_lookup,
      pin_hash = v_hash
    where id = p_id;
  else
    update public.staff_employees set
      name_en = trim(p_name_en),
      position = coalesce(trim(p_position), ''),
      hourly_rate = round(p_hourly_rate::numeric, 2),
      bank_account = coalesce(trim(p_bank_account), ''),
      bank_name = coalesce(trim(p_bank_name), ''),
      active = coalesce(p_active, true)
    where id = p_id;
  end if;

  return p_id;
end;
$$;

revoke all on function public.staff_upsert_employee(
  uuid, text, text, numeric, text, text, boolean, text
) from public;
grant execute on function public.staff_upsert_employee(
  uuid, text, text, numeric, text, text, boolean, text
) to authenticated;

-- -----------------------------------------------------------------------------
-- 4) RLS — table access only after unlock
--    staff_clock / staff_open_now are SECURITY DEFINER and do not use this.
-- -----------------------------------------------------------------------------
drop policy if exists "staff_employees_auth_select" on public.staff_employees;
create policy "staff_employees_auth_select"
on public.staff_employees
for select
to authenticated
using (public.staff_settings_is_unlocked());

drop policy if exists "staff_employees_auth_insert" on public.staff_employees;
create policy "staff_employees_auth_insert"
on public.staff_employees
for insert
to authenticated
with check (public.staff_settings_is_unlocked());

drop policy if exists "staff_employees_auth_update" on public.staff_employees;
create policy "staff_employees_auth_update"
on public.staff_employees
for update
to authenticated
using (public.staff_settings_is_unlocked())
with check (public.staff_settings_is_unlocked());

drop policy if exists "staff_employees_auth_delete" on public.staff_employees;
create policy "staff_employees_auth_delete"
on public.staff_employees
for delete
to authenticated
using (public.staff_settings_is_unlocked());

drop policy if exists "staff_shifts_auth_select" on public.staff_shifts;
create policy "staff_shifts_auth_select"
on public.staff_shifts
for select
to authenticated
using (public.staff_settings_is_unlocked());

drop policy if exists "staff_shifts_auth_insert" on public.staff_shifts;
create policy "staff_shifts_auth_insert"
on public.staff_shifts
for insert
to authenticated
with check (public.staff_settings_is_unlocked());

drop policy if exists "staff_shifts_auth_update" on public.staff_shifts;
create policy "staff_shifts_auth_update"
on public.staff_shifts
for update
to authenticated
using (public.staff_settings_is_unlocked())
with check (public.staff_settings_is_unlocked());

drop policy if exists "staff_shifts_auth_delete" on public.staff_shifts;
create policy "staff_shifts_auth_delete"
on public.staff_shifts
for delete
to authenticated
using (public.staff_settings_is_unlocked());

grant select, insert, update, delete on public.staff_employees to authenticated;
grant select, insert, update, delete on public.staff_shifts to authenticated;

-- staff_clock stays granted to authenticated (unchanged in supabase-staff-hours.sql).
grant execute on function public.staff_clock(text, text) to authenticated;
