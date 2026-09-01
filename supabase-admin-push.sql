-- =============================================================================
-- LECHAIM — Admin Web Push (waiter call / bill / new customer order)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Then:
--   1. Deploy Edge Function send-admin-push
--   2. Set function secrets (VAPID_* + PUSH_WEBHOOK_SECRET)
--   3. Insert the webhook secret into admin_push_config (see bottom)
-- =============================================================================

create extension if not exists pg_net;

create table if not exists public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_push_subscriptions_endpoint_key unique (endpoint)
);

create index if not exists admin_push_subscriptions_user_idx
  on public.admin_push_subscriptions (user_id)
  where active = true;

create index if not exists admin_push_subscriptions_active_idx
  on public.admin_push_subscriptions (active)
  where active = true;

create table if not exists public.admin_push_config (
  id integer primary key default 1 check (id = 1),
  webhook_secret text not null,
  updated_at timestamptz not null default now()
);

alter table public.admin_push_subscriptions enable row level security;
alter table public.admin_push_config enable row level security;

drop policy if exists admin_push_select_own on public.admin_push_subscriptions;
create policy admin_push_select_own
  on public.admin_push_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists admin_push_insert_own on public.admin_push_subscriptions;
create policy admin_push_insert_own
  on public.admin_push_subscriptions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists admin_push_update_own on public.admin_push_subscriptions;
create policy admin_push_update_own
  on public.admin_push_subscriptions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists admin_push_delete_own on public.admin_push_subscriptions;
create policy admin_push_delete_own
  on public.admin_push_subscriptions
  for delete
  to authenticated
  using (user_id = auth.uid());

comment on table public.admin_push_subscriptions is
  'One Web Push subscription per admin device. Service role reads all active rows to send.';

comment on table public.admin_push_config is
  'Single-row webhook secret. No API policies — only SECURITY DEFINER trigger reads it.';

-- -----------------------------------------------------------------------------
-- New-order rule (do NOT use auth.uid()):
--   Customer / staff "שלח הזמנה" → submit_order_wave → orders.client_send_id set
--   Admin "הוסף מנה" → createOrder() with no client_send_id (or only items bump)
-- -----------------------------------------------------------------------------

create or replace function public.enqueue_admin_push(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_secret text;
  v_url text := 'https://inkdquzveijgikjnboet.supabase.co/functions/v1/send-admin-push';
begin
  if p_payload is null then
    return;
  end if;

  select webhook_secret
    into v_secret
  from public.admin_push_config
  where id = 1;

  if v_secret is null or length(trim(v_secret)) < 8 then
    raise warning 'admin_push: missing webhook secret in admin_push_config';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_secret
    ),
    body := p_payload
  );
exception
  when undefined_function then
    raise warning 'admin_push: pg_net not available';
  when others then
    raise warning 'admin_push skipped: %', sqlerrm;
end;
$$;

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

drop trigger if exists order_sessions_admin_push on public.order_sessions;
create trigger order_sessions_admin_push
after update of waiter_called, waiter_need, status, bill_requested
on public.order_sessions
for each row
execute function public.admin_push_from_session();

drop trigger if exists orders_admin_push on public.orders;
create trigger orders_admin_push
after insert
on public.orders
for each row
when (new.client_send_id is not null)
execute function public.admin_push_from_order();

revoke all on table public.admin_push_config from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_push_subscriptions
  to authenticated;

revoke all on function public.enqueue_admin_push(jsonb) from public, anon, authenticated;
revoke all on function public.admin_push_from_session() from public, anon, authenticated;
revoke all on function public.admin_push_from_order() from public, anon, authenticated;

-- One-time after you have PUSH_WEBHOOK_SECRET (same value as the Edge Function secret):
--
-- insert into public.admin_push_config (id, webhook_secret)
-- values (1, 'PASTE_PUSH_WEBHOOK_SECRET_HERE')
-- on conflict (id) do update
--   set webhook_secret = excluded.webhook_secret,
--       updated_at = now();
