-- LECHAIM — Session-level kitchen confirmation (independent of table/order status).
-- Does NOT change print, till, table close, prices, or order_sessions.status.
-- Safe to re-run.

alter table public.order_sessions
  add column if not exists kitchen_all_ready boolean;

alter table public.order_sessions
  alter column kitchen_all_ready set default false;

update public.order_sessions
  set kitchen_all_ready = false
  where kitchen_all_ready is null;

alter table public.order_sessions
  alter column kitchen_all_ready set not null;

comment on column public.order_sessions.kitchen_all_ready is
  'Cook confirmed every active dish is ready. Independent of status / bill_requested / printed_at.';

create or replace function public.reset_kitchen_all_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
begin
  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and new.kitchen_status is distinct from 'ready') then
    select o.session_id into sid
    from public.orders o
    where o.id = new.order_id;
    if sid is not null then
      update public.order_sessions
        set kitchen_all_ready = false
        where session_id = sid
          and kitchen_all_ready is true;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_reset_kitchen_all_ready on public.order_items;

create trigger order_items_reset_kitchen_all_ready
after insert or update of kitchen_status on public.order_items
for each row
execute function public.reset_kitchen_all_ready();
