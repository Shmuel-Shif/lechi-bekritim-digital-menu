-- =============================================================================
-- LECHAIM — Kitchen ↔ admin chat
-- Run in: Supabase → SQL Editor → New query → Run
-- Safe to re-run.
--
-- Does NOT replace kitchen_alerts. Does NOT touch till / print / table close.
-- =============================================================================

create table if not exists public.kitchen_chat (
  id          uuid primary key default gen_random_uuid(),
  sender      text not null,
  body        text not null,
  alert_id    text null,
  alert_type  text null,
  canned_id   text null,
  extra       text null,
  created_at  timestamptz not null default now(),

  constraint kitchen_chat_sender_ok
    check (sender in ('kitchen', 'admin')),
  constraint kitchen_chat_body_len
    check (char_length(trim(body)) between 1 and 500)
);

create index if not exists kitchen_chat_created_idx
  on public.kitchen_chat (created_at desc);

comment on table public.kitchen_chat is
  'Kitchen tablet ↔ admin free chat. Alert taps also log a line that later shows as approved.';

alter table public.kitchen_chat enable row level security;

drop policy if exists "kitchen_chat_select" on public.kitchen_chat;
create policy "kitchen_chat_select"
on public.kitchen_chat for select
to anon, authenticated
using (true);

drop policy if exists "kitchen_chat_kitchen_insert" on public.kitchen_chat;
create policy "kitchen_chat_kitchen_insert"
on public.kitchen_chat for insert
to anon, authenticated
with check (sender = 'kitchen');

drop policy if exists "kitchen_chat_admin_insert" on public.kitchen_chat;
create policy "kitchen_chat_admin_insert"
on public.kitchen_chat for insert
to authenticated
with check (sender = 'admin');

alter table public.kitchen_chat replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'kitchen_chat'
  ) then
    execute 'alter publication supabase_realtime add table public.kitchen_chat';
  end if;
end $$;
