-- =============================================================================
-- LECHAIM — Quantity tracking for selected dishes (asado, steaks, fish, …)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run. Re-run this file even if you already ran an older version.
--
-- Default: no tracking (same as today).
-- Admin enables tracking per dish and sets how many units are left.
-- Each order_items insert/update/delete adjusts remaining count.
-- At 0 → inventory.available = false (dish disappears from the customer menu).
-- Removing a line (admin) returns those units. Closing a table does not.
--
-- Oversell: two tables cannot both take the last units. The second send
-- is rejected (INSUFFICIENT_STOCK) and the whole order wave is rolled back.
-- =============================================================================

alter table public.inventory
  add column if not exists stock_tracked boolean not null default false;

alter table public.inventory
  add column if not exists stock_qty integer not null default 0;

alter table public.inventory
  drop constraint if exists inventory_stock_qty_nonneg;

alter table public.inventory
  add constraint inventory_stock_qty_nonneg check (stock_qty >= 0);

comment on column public.inventory.stock_tracked is
  'When true, remaining units (stock_qty) decrease with customer/admin orders.';

comment on column public.inventory.stock_qty is
  'Remaining sellable units while stock_tracked. 0 auto-marks available=false.';

create or replace function public.adjust_tracked_stock(p_product_id text, p_consume integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tracked boolean;
  v_left integer;
begin
  if p_product_id is null or p_consume is null or p_consume = 0 then
    return;
  end if;

  select stock_tracked, stock_qty
    into v_tracked, v_left
  from public.inventory
  where product_id = p_product_id
  for update;

  if not found or v_tracked is not true then
    return;
  end if;

  if p_consume > 0 and v_left < p_consume then
    raise exception 'INSUFFICIENT_STOCK:%:%', p_product_id, v_left
      using errcode = 'P0001';
  end if;

  update public.inventory
  set
    stock_qty = greatest(0, stock_qty - p_consume),
    available = case
      when greatest(0, stock_qty - p_consume) <= 0 then false
      when stock_qty <= 0 and greatest(0, stock_qty - p_consume) > 0 then true
      else available
    end
  where product_id = p_product_id
    and stock_tracked = true;
end;
$$;

create or replace function public.apply_inventory_stock_from_order_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.adjust_tracked_stock(new.product_id, greatest(0, coalesce(new.quantity, 0)));
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.adjust_tracked_stock(old.product_id, -greatest(0, coalesce(old.quantity, 0)));
    return old;
  end if;

  if new.product_id is distinct from old.product_id then
    perform public.adjust_tracked_stock(old.product_id, -greatest(0, coalesce(old.quantity, 0)));
    perform public.adjust_tracked_stock(new.product_id, greatest(0, coalesce(new.quantity, 0)));
  else
    perform public.adjust_tracked_stock(
      new.product_id,
      greatest(0, coalesce(new.quantity, 0)) - greatest(0, coalesce(old.quantity, 0))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_apply_inventory_stock on public.order_items;

create trigger order_items_apply_inventory_stock
after insert or update of product_id, quantity or delete
on public.order_items
for each row
execute function public.apply_inventory_stock_from_order_item();

select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'inventory'
  and column_name in ('stock_tracked', 'stock_qty')
order by column_name;
