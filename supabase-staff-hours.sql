-- =============================================================================
-- LECHAIM — Staff hours (employee time clock + monthly payroll summary)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Isolated module: does NOT alter order_sessions / orders / order_items /
-- reservations / inventory / coupons / restaurant_flags.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- 1) Employees
-- -----------------------------------------------------------------------------
create table if not exists public.staff_employees (
  id              uuid primary key default gen_random_uuid(),
  name_en         text not null,
  position        text not null default '',
  pin_lookup      text not null,
  pin_hash        text not null,
  hourly_rate     numeric(10, 2) not null default 0
                  check (hourly_rate >= 0),
  bank_account    text not null default '',
  bank_name       text not null default '',
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint staff_employees_name_nonempty check (length(trim(name_en)) > 0),
  constraint staff_employees_pin_lookup_nonempty check (length(trim(pin_lookup)) > 0),
  constraint staff_employees_pin_hash_nonempty check (length(trim(pin_hash)) > 0)
);

create unique index if not exists staff_employees_pin_lookup_uidx
  on public.staff_employees (pin_lookup);

create index if not exists staff_employees_active_idx
  on public.staff_employees (active);

comment on table public.staff_employees is
  'Restaurant staff for time clock. PIN stored hashed; bank fields admin-only via RLS.';

comment on column public.staff_employees.pin_lookup is
  'Deterministic SHA-256 of PIN for uniqueness checks. Never expose to anon.';

comment on column public.staff_employees.pin_hash is
  'bcrypt hash (extensions.crypt). Never select from client UI.';

-- -----------------------------------------------------------------------------
-- 2) Shifts
-- -----------------------------------------------------------------------------
create table if not exists public.staff_shifts (
  id                     uuid primary key default gen_random_uuid(),
  employee_id            uuid not null
                         references public.staff_employees (id) on delete restrict,
  clock_in               timestamptz not null,
  clock_out              timestamptz null,
  hourly_rate_snapshot   numeric(10, 2) not null
                         check (hourly_rate_snapshot >= 0),
  notes                  text null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint staff_shifts_out_after_in
    check (clock_out is null or clock_out >= clock_in)
);

create index if not exists staff_shifts_employee_idx
  on public.staff_shifts (employee_id);

create index if not exists staff_shifts_clock_in_idx
  on public.staff_shifts (clock_in);

-- One open shift per employee (prevents double clock-in)
create unique index if not exists staff_shifts_one_open_per_employee
  on public.staff_shifts (employee_id)
  where clock_out is null;

comment on table public.staff_shifts is
  'Clock-in/out rows. clock_out null = open shift. hourly_rate_snapshot frozen at clock-in.';

-- -----------------------------------------------------------------------------
-- 3) updated_at helper
-- -----------------------------------------------------------------------------
create or replace function public.staff_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists staff_employees_set_updated_at on public.staff_employees;
create trigger staff_employees_set_updated_at
before update on public.staff_employees
for each row execute function public.staff_set_updated_at();

drop trigger if exists staff_shifts_set_updated_at on public.staff_shifts;
create trigger staff_shifts_set_updated_at
before update on public.staff_shifts
for each row execute function public.staff_set_updated_at();

-- -----------------------------------------------------------------------------
-- 4) PIN helpers (security definer — hash never computed in browser for verify)
-- -----------------------------------------------------------------------------
create or replace function public.staff_pin_lookup(p_pin text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(trim(p_pin), 'sha256'), 'hex');
$$;

create or replace function public.staff_pin_hash(p_pin text)
returns text
language sql
as $$
  select extensions.crypt(trim(p_pin), extensions.gen_salt('bf'));
$$;

-- -----------------------------------------------------------------------------
-- 5) Upsert employee (hashes PIN server-side; PIN never stored plain)
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
-- 6) Clock in / out by PIN (admin authenticated only)
-- -----------------------------------------------------------------------------
create or replace function public.staff_clock(p_pin text, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  emp public.staff_employees%rowtype;
  open_shift public.staff_shifts%rowtype;
  v_hours numeric(10, 2);
  v_lookup text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_pin is null or length(trim(p_pin)) < 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_pin');
  end if;

  v_lookup := public.staff_pin_lookup(p_pin);

  select * into emp
  from public.staff_employees
  where pin_lookup = v_lookup
    and pin_hash = extensions.crypt(trim(p_pin), pin_hash)
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_pin');
  end if;

  if emp.active is not true then
    return jsonb_build_object('ok', false, 'error', 'inactive', 'employee_name', emp.name_en);
  end if;

  select * into open_shift
  from public.staff_shifts
  where employee_id = emp.id
    and clock_out is null
  order by clock_in desc
  limit 1;

  if lower(trim(p_action)) = 'in' then
    if open_shift.id is not null then
      return jsonb_build_object(
        'ok', false,
        'error', 'already_clocked_in',
        'employee_name', emp.name_en,
        'clock_in', open_shift.clock_in,
        'status', 'working'
      );
    end if;

    insert into public.staff_shifts (employee_id, clock_in, hourly_rate_snapshot)
    values (emp.id, now(), emp.hourly_rate)
    returning * into open_shift;

    return jsonb_build_object(
      'ok', true,
      'action', 'in',
      'employee_id', emp.id,
      'employee_name', emp.name_en,
      'clock_in', open_shift.clock_in,
      'status', 'working'
    );
  end if;

  if lower(trim(p_action)) = 'out' then
    if open_shift.id is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'not_clocked_in',
        'employee_name', emp.name_en
      );
    end if;

    update public.staff_shifts
    set clock_out = now()
    where id = open_shift.id
    returning * into open_shift;

    v_hours := round(
      (extract(epoch from (open_shift.clock_out - open_shift.clock_in)) / 3600.0)::numeric,
      2
    );

    return jsonb_build_object(
      'ok', true,
      'action', 'out',
      'employee_id', emp.id,
      'employee_name', emp.name_en,
      'clock_in', open_shift.clock_in,
      'clock_out', open_shift.clock_out,
      'hours', v_hours,
      'status', 'out'
    );
  end if;

  return jsonb_build_object('ok', false, 'error', 'invalid_action');
end;
$$;

revoke all on function public.staff_clock(text, text) from public;
grant execute on function public.staff_clock(text, text) to authenticated;

-- Do not expose helper hash functions broadly
revoke all on function public.staff_pin_lookup(text) from public;
revoke all on function public.staff_pin_hash(text) from public;

-- -----------------------------------------------------------------------------
-- 7) RLS — authenticated admin only (no anon)
-- -----------------------------------------------------------------------------
alter table public.staff_employees enable row level security;
alter table public.staff_shifts enable row level security;

drop policy if exists "staff_employees_auth_select" on public.staff_employees;
create policy "staff_employees_auth_select"
on public.staff_employees
for select
to authenticated
using (true);

drop policy if exists "staff_employees_auth_insert" on public.staff_employees;
create policy "staff_employees_auth_insert"
on public.staff_employees
for insert
to authenticated
with check (true);

drop policy if exists "staff_employees_auth_update" on public.staff_employees;
create policy "staff_employees_auth_update"
on public.staff_employees
for update
to authenticated
using (true)
with check (true);

drop policy if exists "staff_employees_auth_delete" on public.staff_employees;
create policy "staff_employees_auth_delete"
on public.staff_employees
for delete
to authenticated
using (true);

drop policy if exists "staff_shifts_auth_select" on public.staff_shifts;
create policy "staff_shifts_auth_select"
on public.staff_shifts
for select
to authenticated
using (true);

drop policy if exists "staff_shifts_auth_insert" on public.staff_shifts;
create policy "staff_shifts_auth_insert"
on public.staff_shifts
for insert
to authenticated
with check (true);

drop policy if exists "staff_shifts_auth_update" on public.staff_shifts;
create policy "staff_shifts_auth_update"
on public.staff_shifts
for update
to authenticated
using (true)
with check (true);

drop policy if exists "staff_shifts_auth_delete" on public.staff_shifts;
create policy "staff_shifts_auth_delete"
on public.staff_shifts
for delete
to authenticated
using (true);

-- Explicit: anon has no policies → no access
