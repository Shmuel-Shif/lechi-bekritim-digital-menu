-- LECHAIM — Per-item kitchen status (on top of printed bons).
-- Does NOT change print, till, table close, prices, or order wave status.
-- Safe to re-run.

alter table public.order_items
  add column if not exists kitchen_status text;

alter table public.order_items
  alter column kitchen_status set default 'waiting';

update public.order_items
  set kitchen_status = 'waiting'
  where kitchen_status is null
     or kitchen_status not in ('waiting', 'preparing', 'ready');

alter table public.order_items
  alter column kitchen_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_items_kitchen_status_check'
  ) then
    alter table public.order_items
      add constraint order_items_kitchen_status_check
      check (kitchen_status in ('waiting', 'preparing', 'ready'));
  end if;
end $$;

create index if not exists order_items_kitchen_status_idx
  on public.order_items (kitchen_status);

comment on column public.order_items.kitchen_status is
  'Cook-facing dish state: waiting / preparing / ready. Independent of orders.status and printed_at.';
