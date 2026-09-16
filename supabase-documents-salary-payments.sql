-- =============================================================================
-- LECHAIM — Salary payments for the documents financial center
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Why: staff_employees is locked behind staff_settings_is_unlocked().
-- Documents vault unlock is a different code, so the documents screen cannot
-- read employee names from staff_employees directly.
--
-- This RPC returns paid salaries + employee name only after the documents
-- vault is unlocked. It does NOT return PIN, bank account, or other staff
-- fields. It does NOT change staff_clock, till, Z, or order_sessions.
-- =============================================================================

create or replace function public.documents_salary_payments()
returns table (
  id uuid,
  paid_on date,
  amount numeric,
  method text,
  created_at timestamptz,
  employee_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.documents_vault_is_unlocked() then
    raise exception 'not_unlocked';
  end if;

  return query
  select
    p.id,
    p.paid_on,
    p.amount,
    p.method,
    p.created_at,
    coalesce(nullif(trim(e.name_en), ''), 'עובד'::text) as employee_name
  from public.staff_salary_payments p
  left join public.staff_employees e on e.id = p.employee_id
  order by p.paid_on desc, p.created_at desc;
end;
$$;

revoke all on function public.documents_salary_payments() from public, anon;
grant execute on function public.documents_salary_payments() to authenticated;

notify pgrst, 'reload schema';
