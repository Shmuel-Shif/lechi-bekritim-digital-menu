-- Daily till: payment method + amounts on closed sessions
-- Run in Supabase SQL editor (authenticated admin uses existing session RLS).
-- Safe to re-run.

alter table public.order_sessions
  add column if not exists payment_method text null;

alter table public.order_sessions
  add column if not exists paid_total numeric(10, 2) null
  check (paid_total is null or paid_total >= 0);

alter table public.order_sessions
  add column if not exists paid_cash numeric(10, 2) null
  check (paid_cash is null or paid_cash >= 0);

alter table public.order_sessions
  add column if not exists paid_credit numeric(10, 2) null
  check (paid_credit is null or paid_credit >= 0);

-- Allow cash | credit | split (drop older check if present)
do $$
begin
  alter table public.order_sessions drop constraint if exists order_sessions_payment_method_check;
exception when undefined_object then null;
end $$;

alter table public.order_sessions
  drop constraint if exists order_sessions_payment_method_check;

alter table public.order_sessions
  add constraint order_sessions_payment_method_check
  check (payment_method is null or payment_method in ('cash', 'credit', 'split'));

create index if not exists order_sessions_closed_at_idx
  on public.order_sessions (closed_at desc)
  where status = 'closed';

comment on column public.order_sessions.payment_method is 'cash | credit | split — set when admin closes the session';
comment on column public.order_sessions.paid_total is 'Final amount charged at close';
comment on column public.order_sessions.paid_cash is 'Cash portion (full amount if cash-only)';
comment on column public.order_sessions.paid_credit is 'Credit portion (full amount if credit-only)';
