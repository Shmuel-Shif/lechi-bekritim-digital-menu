-- =============================================================================
-- LECHAIM — Dine-in order mode (Stage 0 infrastructure)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Adds:
--   restaurant_flags.dine_in_order_mode   (representative | shared)
--   order_sessions.order_mode             snapshot for the visit
--   order_sessions.initial_order_done     "סיימנו להזמין" (unused until Stage 3)
--   orders.client_send_id                 unique send key (idempotent waves)
--   submit_order_wave(...)                atomic insert of order + items
--
-- Does NOT change customer UX by itself. Does NOT touch print, till,
-- kitchen_status, kitchen_all_ready, or existing session status.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Global toggle
-- -----------------------------------------------------------------------------
insert into public.restaurant_flags (flag_key, flag_value, flag_text)
values ('dine_in_order_mode', false, 'representative')
on conflict (flag_key) do nothing;

comment on table public.restaurant_flags is
  'Global restaurant switches. dine_in_order_mode.flag_text = representative|shared.';

-- -----------------------------------------------------------------------------
-- 2) Session snapshot + "finished initial order" flag
-- -----------------------------------------------------------------------------
alter table public.order_sessions
  add column if not exists order_mode text;

alter table public.order_sessions
  add column if not exists initial_order_done boolean not null default false;

alter table public.order_sessions
  drop constraint if exists order_sessions_order_mode_check;

alter table public.order_sessions
  add constraint order_sessions_order_mode_check
  check (order_mode is null or order_mode in ('representative', 'shared'));

comment on column public.order_sessions.order_mode is
  'Dine-in ordering mode snapshotted when the session started. Later admin toggles do not change this.';

comment on column public.order_sessions.initial_order_done is
  'True after a diner taps סיימנו להזמין. Does not lock later add-on waves.';

-- Open visits already in progress stay on the original (representative) system
update public.order_sessions
set order_mode = 'representative'
where order_mode is null
  and order_type = 'dine_in'
  and status in ('active', 'bill_requested');

-- -----------------------------------------------------------------------------
-- 3) Idempotent send key on each order wave
-- -----------------------------------------------------------------------------
alter table public.orders
  add column if not exists client_send_id text;

comment on column public.orders.client_send_id is
  'Client-generated send id. Same id must never create a second orders row or duplicate items.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_client_send_id_key'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_client_send_id_key unique (client_send_id);
  end if;
end $$;

create index if not exists orders_client_send_id_idx
  on public.orders (client_send_id)
  where client_send_id is not null;

-- -----------------------------------------------------------------------------
-- 4) Atomic wave insert (order + items). Replay returns the existing wave.
-- -----------------------------------------------------------------------------
create or replace function public.submit_order_wave(
  p_session_id uuid,
  p_client_send_id text,
  p_total numeric,
  p_status text default 'submitted',
  p_language text default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_send_id text;
  v_order public.orders%rowtype;
  v_order_number integer;
  v_status text;
  v_language text;
  v_item jsonb;
  v_new_id uuid;
  v_parent_id uuid;
  v_map jsonb := '{}'::jsonb;
  v_replayed boolean := false;
  v_items jsonb;
begin
  v_send_id := nullif(trim(coalesce(p_client_send_id, '')), '');
  if p_session_id is null then
    raise exception 'submit_order_wave: session_id is required';
  end if;
  if v_send_id is null or char_length(v_send_id) < 8 then
    raise exception 'submit_order_wave: client_send_id is required';
  end if;

  v_status := case
    when p_status in ('submitted', 'preparing', 'ready', 'served', 'cancelled')
      then p_status
    else 'submitted'
  end;
  v_language := case
    when p_language in ('he', 'en', 'el') then p_language
    else null
  end;

  /* Serialize waves on this session so order_number stays unique. */
  perform pg_advisory_xact_lock(hashtext(p_session_id::text));

  select *
    into v_order
  from public.orders
  where client_send_id = v_send_id
  limit 1;

  if found then
    v_replayed := true;
  else
    select coalesce(max(order_number), 0) + 1
      into v_order_number
    from public.orders
    where session_id = p_session_id;

    begin
      insert into public.orders (
        session_id,
        order_number,
        total,
        status,
        language,
        client_send_id
      )
      values (
        p_session_id,
        v_order_number,
        coalesce(p_total, 0),
        v_status,
        v_language,
        v_send_id
      )
      returning * into v_order;
    exception
      when unique_violation then
        select *
          into v_order
        from public.orders
        where client_send_id = v_send_id
        limit 1;
        if not found then
          raise;
        end if;
        v_replayed := true;
    end;
  end if;

  if not v_replayed then
    /* Pass 1: lines without a parent */
    for v_item in
      select value
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as t(value)
    loop
      if nullif(trim(coalesce(v_item->>'parent_client_item_id', '')), '') is not null then
        continue;
      end if;

      insert into public.order_items (
        order_id,
        product_id,
        product_name,
        print_name,
        quantity,
        price,
        category,
        notes,
        notes_el,
        side_dish,
        parent_item_id,
        unit_type,
        selected_weight,
        price_per_kg,
        thaw_count
      )
      values (
        v_order.id,
        coalesce(nullif(trim(v_item->>'product_id'), ''), 'unknown'),
        coalesce(v_item->>'product_name', ''),
        coalesce(v_item->>'print_name', ''),
        greatest(1, coalesce((v_item->>'quantity')::integer, 1)),
        coalesce((v_item->>'price')::numeric, 0),
        nullif(trim(v_item->>'category'), ''),
        nullif(v_item->>'notes', ''),
        nullif(trim(v_item->>'notes_el'), ''),
        nullif(v_item->>'side_dish', ''),
        null,
        nullif(trim(v_item->>'unit_type'), ''),
        nullif(v_item->>'selected_weight', '')::numeric,
        nullif(v_item->>'price_per_kg', '')::numeric,
        case
          when nullif(v_item->>'thaw_count', '') is null then null
          else greatest(0, (v_item->>'thaw_count')::integer)
        end
      )
      returning id into v_new_id;

      if nullif(trim(coalesce(v_item->>'client_item_id', '')), '') is not null then
        v_map := v_map || jsonb_build_object(v_item->>'client_item_id', v_new_id);
      end if;
    end loop;

    /* Pass 2: sides / children */
    for v_item in
      select value
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as t(value)
    loop
      if nullif(trim(coalesce(v_item->>'parent_client_item_id', '')), '') is null then
        continue;
      end if;

      v_parent_id := null;
      if v_map ? (v_item->>'parent_client_item_id') then
        v_parent_id := (v_map ->> (v_item->>'parent_client_item_id'))::uuid;
      end if;

      insert into public.order_items (
        order_id,
        product_id,
        product_name,
        print_name,
        quantity,
        price,
        category,
        notes,
        notes_el,
        side_dish,
        parent_item_id,
        unit_type,
        selected_weight,
        price_per_kg,
        thaw_count
      )
      values (
        v_order.id,
        coalesce(nullif(trim(v_item->>'product_id'), ''), 'unknown'),
        coalesce(v_item->>'product_name', ''),
        coalesce(v_item->>'print_name', ''),
        greatest(1, coalesce((v_item->>'quantity')::integer, 1)),
        coalesce((v_item->>'price')::numeric, 0),
        nullif(trim(v_item->>'category'), ''),
        nullif(v_item->>'notes', ''),
        nullif(trim(v_item->>'notes_el'), ''),
        nullif(v_item->>'side_dish', ''),
        v_parent_id,
        nullif(trim(v_item->>'unit_type'), ''),
        nullif(v_item->>'selected_weight', '')::numeric,
        nullif(v_item->>'price_per_kg', '')::numeric,
        case
          when nullif(v_item->>'thaw_count', '') is null then null
          else greatest(0, (v_item->>'thaw_count')::integer)
        end
      )
      returning id into v_new_id;

      if nullif(trim(coalesce(v_item->>'client_item_id', '')), '') is not null then
        v_map := v_map || jsonb_build_object(v_item->>'client_item_id', v_new_id);
      end if;
    end loop;
  end if;

  select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at, i.id), '[]'::jsonb)
    into v_items
  from public.order_items i
  where i.order_id = v_order.id;

  return jsonb_build_object(
    'replayed', v_replayed,
    'order', to_jsonb(v_order),
    'items', v_items
  );
end;
$$;

comment on function public.submit_order_wave(uuid, text, numeric, text, text, jsonb) is
  'Insert one Send Order wave. Same client_send_id returns the existing order and items.';

revoke all on function public.submit_order_wave(uuid, text, numeric, text, text, jsonb) from public;
grant execute on function public.submit_order_wave(uuid, text, numeric, text, text, jsonb) to anon, authenticated;
