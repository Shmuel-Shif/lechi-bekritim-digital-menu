-- =============================================================================
-- LECHAIM — Admin Web Push v2
-- dish_ready / kitchen_all_ready / kitchen_alert / reservation_pending
--
-- Run AFTER supabase-admin-push.sql. Safe to re-run.
-- Does NOT change table_opened / new_order (needs a separate decision).
-- Does NOT touch till / print / kitchen status logic / chat / inventory.
-- =============================================================================

create or replace function public.admin_push_from_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  v_type := null;

  if tg_op = 'UPDATE' then
    if new.waiter_called is true
      and old.waiter_called is distinct from true then
      v_type := 'waiter_call';
    elsif (
      new.status = 'bill_requested'
      and old.status is distinct from 'bill_requested'
    ) or (
      new.bill_requested is true
      and coalesce(old.bill_requested, false) is not true
    ) then
      v_type := 'bill_request';
    elsif new.kitchen_all_ready is true
      and coalesce(old.kitchen_all_ready, false) is not true then
      v_type := 'kitchen_all_ready';
    end if;
  end if;

  if v_type is null then
    return new;
  end if;

  perform public.enqueue_admin_push(jsonb_build_object(
    'type', v_type,
    'tableNumber', new.table_number,
    'sessionId', new.session_id,
    'orderType', new.order_type,
    'fulfillmentType', new.fulfillment_type
  ));

  return new;
end;
$$;

drop trigger if exists order_sessions_admin_push on public.order_sessions;
create trigger order_sessions_admin_push
after update of waiter_called, waiter_need, status, bill_requested, kitchen_all_ready
on public.order_sessions
for each row
execute function public.admin_push_from_session();

create or replace function public.admin_push_skip_kitchen_item(p_item public.order_items)
returns boolean
language plpgsql
immutable
as $$
declare
  v_pid text := lower(trim(coalesce(p_item.product_id, '')));
  v_cat text := lower(trim(coalesce(p_item.category, '')));
begin
  if p_item.parent_item_id is not null then
    return true;
  end if;
  if v_pid in ('fruit-plate', 'shabbat-fruit-plate') then
    return true;
  end if;
  if v_pid like 'doneness-%'
     or v_pid like 'shake-base-%'
     or v_pid like 'limonana-alcohol%' then
    return true;
  end if;
  if v_cat in ('colddrinks', 'hotdrinks', 'cocktails') then
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.admin_push_from_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.order_sessions%rowtype;
  v_name text;
begin
  if new.kitchen_status is distinct from 'ready' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.kitchen_status is not distinct from 'ready' then
    return new;
  end if;
  if public.admin_push_skip_kitchen_item(new) then
    return new;
  end if;

  select s.*
    into v_session
  from public.orders o
  join public.order_sessions s on s.session_id = o.session_id
  where o.id = new.order_id;

  if not found then
    return new;
  end if;

  v_name := nullif(trim(coalesce(new.product_name, new.print_name, '')), '');
  if v_name is null then
    v_name := coalesce(nullif(trim(new.product_id), ''), 'מנה');
  end if;

  perform public.enqueue_admin_push(jsonb_build_object(
    'type', 'dish_ready',
    'tableNumber', v_session.table_number,
    'sessionId', v_session.session_id,
    'orderId', new.order_id,
    'orderType', v_session.order_type,
    'fulfillmentType', v_session.fulfillment_type,
    'productName', v_name,
    'quantity', new.quantity
  ));

  return new;
end;
$$;

drop trigger if exists order_items_admin_push_ready on public.order_items;
create trigger order_items_admin_push_ready
after update of kitchen_status
on public.order_items
for each row
when (new.kitchen_status = 'ready' and old.kitchen_status is distinct from 'ready')
execute function public.admin_push_from_item();

drop trigger if exists order_items_admin_push_ready_ins on public.order_items;
create trigger order_items_admin_push_ready_ins
after insert
on public.order_items
for each row
when (new.kitchen_status = 'ready')
execute function public.admin_push_from_item();

create or replace function public.admin_push_from_kitchen_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'open' then
    return new;
  end if;

  perform public.enqueue_admin_push(jsonb_build_object(
    'type', 'kitchen_alert',
    'alertType', new.alert_type,
    'alertId', new.id,
    'productName', new.product_name,
    'productId', new.product_id,
    'message', new.message
  ));

  return new;
end;
$$;

drop trigger if exists kitchen_alerts_admin_push on public.kitchen_alerts;
create trigger kitchen_alerts_admin_push
after insert
on public.kitchen_alerts
for each row
when (new.status = 'open')
execute function public.admin_push_from_kitchen_alert();

create or replace function public.admin_push_from_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;

  perform public.enqueue_admin_push(jsonb_build_object(
    'type', 'reservation_pending',
    'reservationId', new.id,
    'customerName', new.customer_name,
    'partySize', new.party_size,
    'reservationDate', new.reservation_date,
    'arrivalTime', new.arrival_time
  ));

  return new;
end;
$$;

drop trigger if exists place_res_req_admin_push on public.place_reservation_requests;
create trigger place_res_req_admin_push
after insert
on public.place_reservation_requests
for each row
when (new.status = 'pending')
execute function public.admin_push_from_reservation();

revoke all on function public.admin_push_from_session() from public, anon, authenticated;
revoke all on function public.admin_push_from_item() from public, anon, authenticated;
revoke all on function public.admin_push_from_kitchen_alert() from public, anon, authenticated;
revoke all on function public.admin_push_from_reservation() from public, anon, authenticated;
revoke all on function public.admin_push_skip_kitchen_item(public.order_items) from public, anon, authenticated;
