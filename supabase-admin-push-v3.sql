-- =============================================================================
-- LECHAIM — Admin Web Push v3 (table_opened only)
-- Run AFTER v1/v2. Safe to re-run.
-- =============================================================================

create or replace function public.admin_push_from_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.order_sessions%rowtype;
begin
  /* Customer send-wave only. Admin late-add has client_send_id null. */
  if new.client_send_id is null or length(trim(new.client_send_id)) < 8 then
    return new;
  end if;

  select *
    into v_session
  from public.order_sessions
  where session_id = new.session_id;

  if not found then
    return new;
  end if;

  /* First dine-in wave is table_opened, not new_order. */
  if v_session.order_type in ('dine_in', 'dine-in')
     and coalesce(new.order_number, 0) = 1 then
    return new;
  end if;

  perform public.enqueue_admin_push(jsonb_build_object(
    'type', 'new_order',
    'tableNumber', v_session.table_number,
    'sessionId', v_session.session_id,
    'orderId', new.id,
    'orderType', v_session.order_type,
    'fulfillmentType', v_session.fulfillment_type
  ));

  return new;
end;
$$;

create or replace function public.admin_push_table_opened()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.order_type is distinct from 'dine_in'
     and new.order_type is distinct from 'dine-in' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'active' then
      return new;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from 'draft'
       or new.status is distinct from 'active' then
      return new;
    end if;
  else
    return new;
  end if;

  perform public.enqueue_admin_push(jsonb_build_object(
    'type', 'table_opened',
    'tableNumber', new.table_number,
    'sessionId', new.session_id,
    'orderType', new.order_type,
    'fulfillmentType', new.fulfillment_type
  ));

  return new;
end;
$$;

drop trigger if exists order_sessions_admin_push_opened_ins on public.order_sessions;
create trigger order_sessions_admin_push_opened_ins
after insert
on public.order_sessions
for each row
when (
  new.order_type in ('dine_in', 'dine-in')
  and new.status = 'active'
)
execute function public.admin_push_table_opened();

drop trigger if exists order_sessions_admin_push_opened_upd on public.order_sessions;
create trigger order_sessions_admin_push_opened_upd
after update of status
on public.order_sessions
for each row
when (
  old.status = 'draft'
  and new.status = 'active'
  and new.order_type in ('dine_in', 'dine-in')
)
execute function public.admin_push_table_opened();

revoke all on function public.admin_push_from_order() from public, anon, authenticated;
revoke all on function public.admin_push_table_opened() from public, anon, authenticated;
