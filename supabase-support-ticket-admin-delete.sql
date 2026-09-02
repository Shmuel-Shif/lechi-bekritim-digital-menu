-- =============================================================================
-- LECHAIM — Allow authenticated admin to delete support tickets
-- Run in: Supabase → SQL Editor → Run
-- Do not run unless you want the admin "מחיקה" button to work.
--
-- Why this is needed:
--   support_tickets currently grants SELECT + UPDATE(status, updated_at, closed_at)
--   to authenticated. There is no DELETE grant and no DELETE RLS policy.
--   Anon still cannot delete.
--
-- CASCADE:
--   support_messages.ticket_id already references support_tickets(id)
--   ON DELETE CASCADE. No schema / FK change.
--
-- RLS gotcha:
--   PostgreSQL still checks RLS on cascaded child rows. A direct table DELETE
--   from the browser role can fail on support_messages even with CASCADE.
--   This RPC runs as SECURITY DEFINER so the ticket + messages are removed
--   safely in one step. Execute is granted only to authenticated (admin login).
-- =============================================================================

create or replace function public.delete_support_ticket(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  if p_id is null then
    raise exception 'invalid_id' using errcode = '22023';
  end if;

  delete from public.support_tickets
  where id = p_id;

  get diagnostics v_deleted = row_count;
  if v_deleted < 1 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.delete_support_ticket(uuid) from public, anon;
grant execute on function public.delete_support_ticket(uuid) to authenticated;

comment on function public.delete_support_ticket(uuid) is
  'Admin-only delete of a support ticket. Messages are removed via ON DELETE CASCADE.';

notify pgrst, 'reload schema';
