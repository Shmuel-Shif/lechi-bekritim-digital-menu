-- =============================================================================
-- LECHAIM — Locked daily sales report
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- One locked report per business date. This file does not read or write
-- order_sessions, business_documents, or till_day_reports.
-- It creates empty tables and functions only. It does not insert any day,
-- including 2026-09-28, 2026-09-29, and 2026-09-30.
-- The financial summary does not read these tables yet.
-- A day of all zeros is still a lock. Do not treat 0 as "no report".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Current lock — one row per business date
-- -----------------------------------------------------------------------------
create table if not exists public.daily_report_locks (
  business_date date primary key,
  cash          numeric(10, 2) not null default 0
                check (cash >= 0),
  credit        numeric(10, 2) not null default 0
                check (credit >= 0),
  tip           numeric(10, 2) not null default 0
                check (tip >= 0),
  sales         numeric(10, 2) not null default 0
                check (sales >= 0),
  source        text not null
                check (source in ('till', 'whatsapp')),
  note          text null,
  locked_at     timestamptz not null default now(),
  locked_by     uuid null,
  revised_at    timestamptz null,
  revised_by    uuid null,
  constraint daily_report_locks_sales_is_cash_plus_credit
    check (sales = cash + credit)
);

comment on table public.daily_report_locks is
  'Locked daily till report. One row per date. Not orders and not a Z document. Sales = cash + credit, tips excluded.';
comment on column public.daily_report_locks.sales is
  'Cash plus credit at lock or correction time. Tips are never included.';
comment on column public.daily_report_locks.source is
  'till = locked from the sales screen. whatsapp = typed later from a WhatsApp report.';

-- -----------------------------------------------------------------------------
-- 2) Revision log — append only. The first lock row is never updated.
-- -----------------------------------------------------------------------------
create table if not exists public.daily_report_revisions (
  id            uuid primary key default gen_random_uuid(),
  business_date date not null,
  cash          numeric(10, 2) not null check (cash >= 0),
  credit        numeric(10, 2) not null check (credit >= 0),
  tip           numeric(10, 2) not null check (tip >= 0),
  sales         numeric(10, 2) not null check (sales >= 0),
  source        text not null check (source in ('till', 'whatsapp')),
  reason        text not null default '',
  created_by    uuid null,
  created_at    timestamptz not null default now(),
  action        text not null check (action in ('lock', 'correct')),
  constraint daily_report_revisions_sales_is_cash_plus_credit
    check (sales = cash + credit),
  constraint daily_report_revisions_correct_needs_reason
    check (action = 'lock' or char_length(btrim(reason)) > 0)
);

comment on table public.daily_report_revisions is
  'Append-only history of a locked day. action=lock is the original report and must not be updated.';

create index if not exists daily_report_revisions_date_idx
  on public.daily_report_revisions (business_date, created_at);

-- -----------------------------------------------------------------------------
-- 3) RLS — authenticated admin read/write; anon denied.
--    Locks can be inserted and updated, not deleted.
--    Revisions can be inserted and read, not updated or deleted.
-- -----------------------------------------------------------------------------
alter table public.daily_report_locks enable row level security;
alter table public.daily_report_locks force row level security;
alter table public.daily_report_revisions enable row level security;
alter table public.daily_report_revisions force row level security;

revoke all on table public.daily_report_locks from public, anon, authenticated;
revoke all on table public.daily_report_revisions from public, anon, authenticated;

grant select, insert, update on table public.daily_report_locks to authenticated;
grant select, insert on table public.daily_report_revisions to authenticated;

drop policy if exists "daily_report_locks_auth_select" on public.daily_report_locks;
create policy "daily_report_locks_auth_select"
on public.daily_report_locks
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "daily_report_locks_auth_insert" on public.daily_report_locks;
create policy "daily_report_locks_auth_insert"
on public.daily_report_locks
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "daily_report_locks_auth_update" on public.daily_report_locks;
create policy "daily_report_locks_auth_update"
on public.daily_report_locks
for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "daily_report_revisions_auth_select" on public.daily_report_revisions;
create policy "daily_report_revisions_auth_select"
on public.daily_report_revisions
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "daily_report_revisions_auth_insert" on public.daily_report_revisions;
create policy "daily_report_revisions_auth_insert"
on public.daily_report_revisions
for insert
to authenticated
with check (auth.uid() is not null);

-- -----------------------------------------------------------------------------
-- 4) Atomic lock / correct. Does not touch orders, Z, or till_day_reports.
--    The original action=lock revision is never updated.
-- -----------------------------------------------------------------------------
create or replace function public.lock_daily_report(p_row jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved public.daily_report_locks;
  v_date date;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_row is null then
    return json_build_object('ok', false, 'error', 'invalid_row');
  end if;

  v_date := nullif(p_row->>'business_date', '')::date;
  if v_date is null then
    return json_build_object('ok', false, 'error', 'invalid_date');
  end if;
  if exists (select 1 from public.daily_report_locks d where d.business_date = v_date) then
    return json_build_object('ok', false, 'error', 'already_locked');
  end if;

  insert into public.daily_report_locks (
    business_date, cash, credit, tip, sales, source, note, locked_at, locked_by, revised_at, revised_by
  ) values (
    v_date,
    (p_row->>'cash')::numeric,
    (p_row->>'credit')::numeric,
    (p_row->>'tip')::numeric,
    (p_row->>'sales')::numeric,
    p_row->>'source',
    nullif(p_row->>'note', ''),
    coalesce(nullif(p_row->>'locked_at', '')::timestamptz, now()),
    auth.uid(),
    null,
    null
  )
  returning * into v_saved;

  insert into public.daily_report_revisions (
    business_date, cash, credit, tip, sales, source, reason, created_by, created_at, action
  ) values (
    v_date,
    v_saved.cash,
    v_saved.credit,
    v_saved.tip,
    v_saved.sales,
    v_saved.source,
    '',
    auth.uid(),
    v_saved.locked_at,
    'lock'
  );

  return json_build_object('ok', true, 'row', to_json(v_saved));
exception
  when unique_violation then
    return json_build_object('ok', false, 'error', 'already_locked');
end;
$$;

create or replace function public.correct_daily_report(p_row jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved public.daily_report_locks;
  v_date date;
  v_reason text;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_row is null then
    return json_build_object('ok', false, 'error', 'invalid_row');
  end if;

  v_date := nullif(p_row->>'business_date', '')::date;
  v_reason := btrim(coalesce(p_row->>'reason', ''));
  if v_date is null then
    return json_build_object('ok', false, 'error', 'invalid_date');
  end if;
  if v_reason = '' then
    return json_build_object('ok', false, 'error', 'reason_required');
  end if;
  if not exists (select 1 from public.daily_report_locks d where d.business_date = v_date) then
    return json_build_object('ok', false, 'error', 'not_locked');
  end if;

  update public.daily_report_locks
  set
    cash = (p_row->>'cash')::numeric,
    credit = (p_row->>'credit')::numeric,
    tip = (p_row->>'tip')::numeric,
    sales = (p_row->>'sales')::numeric,
    revised_at = coalesce(nullif(p_row->>'revised_at', '')::timestamptz, now()),
    revised_by = auth.uid()
  where business_date = v_date
  returning * into v_saved;

  insert into public.daily_report_revisions (
    business_date, cash, credit, tip, sales, source, reason, created_by, created_at, action
  ) values (
    v_date,
    v_saved.cash,
    v_saved.credit,
    v_saved.tip,
    v_saved.sales,
    v_saved.source,
    v_reason,
    auth.uid(),
    v_saved.revised_at,
    'correct'
  );

  return json_build_object('ok', true, 'row', to_json(v_saved));
end;
$$;

revoke all on function public.lock_daily_report(jsonb) from public, anon;
revoke all on function public.correct_daily_report(jsonb) from public, anon;
grant execute on function public.lock_daily_report(jsonb) to authenticated;
grant execute on function public.correct_daily_report(jsonb) to authenticated;

notify pgrst, 'reload schema';
