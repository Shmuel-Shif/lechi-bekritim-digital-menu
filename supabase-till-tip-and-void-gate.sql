-- =============================================================================
-- LECHAIM — Till tip columns + void-code verify RPC
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Requires:
--   supabase-till-payment.sql   (paid_total / paid_cash / paid_credit)
--   supabase-staff-settings-gate.sql  (staff_settings_secrets hash)
--
-- Does NOT change staff_employees / staff_shifts RLS.
-- Does NOT create an unlock session (unlike staff_settings_unlock).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- 1) Tip columns on closed sessions
--    paid_total / paid_cash / paid_credit remain SALES only.
--    paid_tip = paid_tip_cash + paid_tip_credit
-- -----------------------------------------------------------------------------
alter table public.order_sessions
  add column if not exists paid_tip numeric(10, 2) null
    check (paid_tip is null or paid_tip >= 0);

alter table public.order_sessions
  add column if not exists paid_tip_cash numeric(10, 2) null
    check (paid_tip_cash is null or paid_tip_cash >= 0);

alter table public.order_sessions
  add column if not exists paid_tip_credit numeric(10, 2) null
    check (paid_tip_credit is null or paid_tip_credit >= 0);

alter table public.order_sessions
  drop constraint if exists order_sessions_paid_tip_split_check;

alter table public.order_sessions
  add constraint order_sessions_paid_tip_split_check
  check (
    paid_tip is null
    or (
      coalesce(paid_tip_cash, 0) + coalesce(paid_tip_credit, 0) = paid_tip
    )
  );

comment on column public.order_sessions.paid_tip is
  'Tip only. Never included in paid_total / paid_cash / paid_credit (sales).';
comment on column public.order_sessions.paid_tip_cash is
  'Tip received in cash. Sales cash stays in paid_cash.';
comment on column public.order_sessions.paid_tip_credit is
  'Tip received on card. Sales credit stays in paid_credit.';

-- -----------------------------------------------------------------------------
-- 2) Verify access code without unlocking staff settings
-- -----------------------------------------------------------------------------
create or replace function public.staff_settings_verify_code(p_code text)
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

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.staff_settings_verify_code(text) from public, anon;
grant execute on function public.staff_settings_verify_code(text) to authenticated;
