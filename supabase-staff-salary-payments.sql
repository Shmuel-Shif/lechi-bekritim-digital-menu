-- =============================================================================
-- LECHAIM — Staff salary payments (bank / cash)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Isolated: does NOT alter staff_shifts, clock RPCs, orders, till, or print.
-- Requires: supabase-staff-hours.sql (staff_employees must already exist).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.staff_salary_payments (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null
               references public.staff_employees (id) on delete restrict,
  paid_on      date not null,
  amount       numeric(10, 2) not null
               check (amount > 0),
  method       text not null
               check (method in ('cash', 'bank')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists staff_salary_payments_employee_idx
  on public.staff_salary_payments (employee_id);

create index if not exists staff_salary_payments_paid_on_idx
  on public.staff_salary_payments (paid_on);

comment on table public.staff_salary_payments is
  'Salary payments recorded by admin: employee, date, amount, bank or cash.';

drop trigger if exists staff_salary_payments_set_updated_at on public.staff_salary_payments;
create trigger staff_salary_payments_set_updated_at
before update on public.staff_salary_payments
for each row execute function public.staff_set_updated_at();

alter table public.staff_salary_payments enable row level security;

drop policy if exists "staff_salary_payments_auth_select" on public.staff_salary_payments;
create policy "staff_salary_payments_auth_select"
on public.staff_salary_payments
for select
to authenticated
using (true);

drop policy if exists "staff_salary_payments_auth_insert" on public.staff_salary_payments;
create policy "staff_salary_payments_auth_insert"
on public.staff_salary_payments
for insert
to authenticated
with check (true);

drop policy if exists "staff_salary_payments_auth_update" on public.staff_salary_payments;
create policy "staff_salary_payments_auth_update"
on public.staff_salary_payments
for update
to authenticated
using (true)
with check (true);

drop policy if exists "staff_salary_payments_auth_delete" on public.staff_salary_payments;
create policy "staff_salary_payments_auth_delete"
on public.staff_salary_payments
for delete
to authenticated
using (true);

revoke all on public.staff_salary_payments from public, anon;
grant select, insert, update, delete on public.staff_salary_payments to authenticated;

notify pgrst, 'reload schema';
