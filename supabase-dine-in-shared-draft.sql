-- =============================================================================
-- LECHAIM — Shared dine-in draft session (reservation question once per table)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Adds:
--   order_sessions.status may be 'draft'
--   order_sessions.reservation_question_answered
--   unique open-table index includes draft (one placeholder per table)
--
-- Draft is NOT an active table:
--   admin / kitchen / occupancy stay on active + bill_requested only.
-- First real send promotes draft → active.
-- Does NOT touch kitchen_status, kitchen_all_ready, till, or print.
-- =============================================================================

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.order_sessions'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
      and pg_get_constraintdef(con.oid) ilike '%active%'
      and pg_get_constraintdef(con.oid) ilike '%closed%'
  loop
    execute format('alter table public.order_sessions drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.order_sessions
  add constraint order_sessions_status_check
  check (status in ('draft', 'active', 'bill_requested', 'closed'));

alter table public.order_sessions
  add column if not exists reservation_question_answered boolean not null default false;

comment on column public.order_sessions.reservation_question_answered is
  'Shared dine-in: true after one guest answers הזמנתם מקום?. Later phones skip that modal.';

comment on column public.order_sessions.status is
  'draft = shared placeholder before first send. Not occupied. active / bill_requested / closed unchanged.';

drop index if exists public.order_sessions_one_open_dine_in_per_table;

create unique index order_sessions_one_open_dine_in_per_table
  on public.order_sessions (table_number)
  where order_type = 'dine_in'
    and status in ('draft', 'active', 'bill_requested')
    and table_number is not null;
