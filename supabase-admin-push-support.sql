-- =============================================================================
-- LECHAIM — Admin Web Push for new customer-support tickets
-- Run AFTER supabase-admin-push.sql (and v2/v3 if those were used).
-- Safe to re-run.
--
-- Fires once per INSERT into support_tickets with status = 'new'
-- (create_support_ticket). Does not fire on later messages, close, or undo.
-- Does NOT change till / print / RLS / other push types.
-- =============================================================================

create or replace function public.admin_push_from_support_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'new' then
    return new;
  end if;

  perform public.enqueue_admin_push(jsonb_build_object(
    'type', 'support_ticket_new',
    'ticketId', new.id
  ));

  return new;
end;
$$;

drop trigger if exists support_tickets_admin_push on public.support_tickets;
create trigger support_tickets_admin_push
after insert
on public.support_tickets
for each row
when (new.status = 'new')
execute function public.admin_push_from_support_ticket();

revoke all on function public.admin_push_from_support_ticket() from public, anon, authenticated;
