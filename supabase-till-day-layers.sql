-- =============================================================================
-- LECHAIM — Till day layers: opening float + edited daily sales report
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Two completely separate layers. Neither writes to order_sessions,
-- paid_cash, paid_credit, paid_tip, or close-order / Z / print / kitchen.
--
-- 1) till_day_openings  — morning cash float. Not sales. Not "כולל הכל".
-- 2) till_day_reports   — optional declared daily totals (cash / credit / tip).
--    "כולל הכל" is NOT a column. UI computes cash + credit + tip.
--
-- Read / write: authenticated admin only (same login as the admin site).
-- Anon has no access. Save of the edited report is also gated in the UI by
-- staff_settings_verify_code (already exists; this file does not change it).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Opening float — one amount per business date
-- -----------------------------------------------------------------------------
create table if not exists public.till_day_openings (
  business_date date primary key,
  amount        numeric(10, 2) not null default 0
                check (amount >= 0),
  updated_at    timestamptz not null default now(),
  updated_by    uuid null
);

comment on table public.till_day_openings is
  'Morning till float by date. Declaration only. Not sales and not part of כולל הכל.';
comment on column public.till_day_openings.amount is
  'Cash left in the drawer at open. Never added to paid_* or daily sales.';

-- -----------------------------------------------------------------------------
-- 2) Edited daily sales report — one row per business date
-- -----------------------------------------------------------------------------
create table if not exists public.till_day_reports (
  business_date date primary key,
  cash          numeric(10, 2) not null default 0
                check (cash >= 0),
  credit        numeric(10, 2) not null default 0
                check (credit >= 0),
  tip           numeric(10, 2) not null default 0
                check (tip >= 0),
  updated_at    timestamptz not null default now(),
  updated_by    uuid null
);

comment on table public.till_day_reports is
  'Optional declared daily till totals. Does not change order_sessions. No stored grand total.';
comment on column public.till_day_reports.cash is
  'Declared cash sales for the day. Overlay only.';
comment on column public.till_day_reports.credit is
  'Declared credit sales for the day. Overlay only.';
comment on column public.till_day_reports.tip is
  'Declared tips for the day. Overlay only. Not added into sales on the card.';

-- -----------------------------------------------------------------------------
-- 3) Touch trigger — stamp updated_at / updated_by
-- -----------------------------------------------------------------------------
create or replace function public.till_day_layers_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists till_day_openings_touch on public.till_day_openings;
create trigger till_day_openings_touch
before insert or update on public.till_day_openings
for each row execute function public.till_day_layers_touch();

drop trigger if exists till_day_reports_touch on public.till_day_reports;
create trigger till_day_reports_touch
before insert or update on public.till_day_reports
for each row execute function public.till_day_layers_touch();

-- -----------------------------------------------------------------------------
-- 4) RLS — authenticated admin read/write; anon denied
-- -----------------------------------------------------------------------------
alter table public.till_day_openings enable row level security;
alter table public.till_day_openings force row level security;
alter table public.till_day_reports enable row level security;
alter table public.till_day_reports force row level security;

revoke all on table public.till_day_openings from public, anon, authenticated;
revoke all on table public.till_day_reports from public, anon, authenticated;

grant select, insert, update on table public.till_day_openings to authenticated;
grant select, insert, update on table public.till_day_reports to authenticated;

drop policy if exists "till_day_openings_auth_select" on public.till_day_openings;
create policy "till_day_openings_auth_select"
on public.till_day_openings
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "till_day_openings_auth_insert" on public.till_day_openings;
create policy "till_day_openings_auth_insert"
on public.till_day_openings
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "till_day_openings_auth_update" on public.till_day_openings;
create policy "till_day_openings_auth_update"
on public.till_day_openings
for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "till_day_reports_auth_select" on public.till_day_reports;
create policy "till_day_reports_auth_select"
on public.till_day_reports
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "till_day_reports_auth_insert" on public.till_day_reports;
create policy "till_day_reports_auth_insert"
on public.till_day_reports
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "till_day_reports_auth_update" on public.till_day_reports;
create policy "till_day_reports_auth_update"
on public.till_day_reports
for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

notify pgrst, 'reload schema';
