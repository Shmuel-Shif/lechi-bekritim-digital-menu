-- =============================================================================
-- LECHAIM — Stage 1: Private dine-in table chat
-- Run in: Supabase → SQL Editor → New query → Run
-- Safe to re-run.
--
-- Chat is bound to order_sessions.session_id (one visit).
-- table_number is denormalized for admin display only.
-- Closing the session cascade-deletes the chat.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1) table_chats — one thread per dine-in session
-- -----------------------------------------------------------------------------
create table if not exists public.table_chats (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null unique
                      references public.order_sessions (session_id)
                      on delete cascade,
  table_number        integer not null,
  staff_unread_count  integer not null default 0
                      check (staff_unread_count >= 0),
  guest_unread_count  integer not null default 0
                      check (guest_unread_count >= 0),
  staff_last_read_at  timestamptz null,
  guest_last_read_at  timestamptz null,
  last_message_at     timestamptz null,
  last_message_preview text null,
  created_at          timestamptz not null default now()
);

comment on table public.table_chats is
  'One private chat thread per dine-in visit (order_sessions.session_id).';

create index if not exists table_chats_table_number_idx
  on public.table_chats (table_number);

-- -----------------------------------------------------------------------------
-- 2) table_chat_messages
-- -----------------------------------------------------------------------------
create table if not exists public.table_chat_messages (
  id            uuid primary key default gen_random_uuid(),
  chat_id       uuid not null
                references public.table_chats (id)
                on delete cascade,
  session_id    uuid not null
                references public.order_sessions (session_id)
                on delete cascade,
  table_number  integer not null,
  sender        text not null
                check (sender in ('guest', 'staff')),
  body          text not null
                check (char_length(trim(body)) between 1 and 500),
  created_at    timestamptz not null default now()
);

comment on table public.table_chat_messages is
  'Private dine-in chat lines. sender = guest (customer) or staff (admin).';

create index if not exists table_chat_messages_chat_created_idx
  on public.table_chat_messages (chat_id, created_at);

create index if not exists table_chat_messages_session_created_idx
  on public.table_chat_messages (session_id, created_at);

alter table public.table_chats replica identity full;
alter table public.table_chat_messages replica identity full;

-- -----------------------------------------------------------------------------
-- 3) Unread + last-message trigger
-- -----------------------------------------------------------------------------
create or replace function public.touch_table_chat_on_message()
returns trigger
language plpgsql
as $$
declare
  preview text;
begin
  preview := left(trim(new.body), 80);

  if new.sender = 'guest' then
    update public.table_chats
    set
      staff_unread_count = staff_unread_count + 1,
      last_message_at = new.created_at,
      last_message_preview = preview
    where id = new.chat_id;
  elsif new.sender = 'staff' then
    update public.table_chats
    set
      guest_unread_count = guest_unread_count + 1,
      last_message_at = new.created_at,
      last_message_preview = preview
    where id = new.chat_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_table_chat_on_message on public.table_chat_messages;
create trigger trg_table_chat_on_message
  after insert on public.table_chat_messages
  for each row
  execute function public.touch_table_chat_on_message();

-- -----------------------------------------------------------------------------
-- 3b) Chat only while the dine-in session is open
-- -----------------------------------------------------------------------------
create or replace function public.ensure_open_dinein_chat_session()
returns trigger
language plpgsql
as $$
declare
  sess_status text;
  sess_type text;
begin
  select status, order_type
    into sess_status, sess_type
  from public.order_sessions
  where session_id = new.session_id;

  if not found then
    raise exception 'dine-in chat requires an existing session';
  end if;

  if sess_status = 'closed' then
    raise exception 'dine-in chat is closed with the session';
  end if;

  if sess_type is not null and sess_type not in ('dine_in', 'dine-in', 'dinein') then
    raise exception 'private chat is dine-in only';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_table_chats_open_session on public.table_chats;
create trigger trg_table_chats_open_session
  before insert on public.table_chats
  for each row
  execute function public.ensure_open_dinein_chat_session();

drop trigger if exists trg_table_chat_messages_open_session on public.table_chat_messages;
create trigger trg_table_chat_messages_open_session
  before insert on public.table_chat_messages
  for each row
  execute function public.ensure_open_dinein_chat_session();

-- -----------------------------------------------------------------------------
-- 4) RLS — same public pattern as order_sessions (client filters by session_id)
-- -----------------------------------------------------------------------------
alter table public.table_chats enable row level security;
alter table public.table_chat_messages enable row level security;

drop policy if exists "table_chats_public_select" on public.table_chats;
create policy "table_chats_public_select"
on public.table_chats
for select
to anon, authenticated
using (true);

drop policy if exists "table_chats_public_insert" on public.table_chats;
create policy "table_chats_public_insert"
on public.table_chats
for insert
to anon, authenticated
with check (true);

drop policy if exists "table_chats_public_update" on public.table_chats;
create policy "table_chats_public_update"
on public.table_chats
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "table_chat_messages_public_select" on public.table_chat_messages;
create policy "table_chat_messages_public_select"
on public.table_chat_messages
for select
to anon, authenticated
using (true);

drop policy if exists "table_chat_messages_public_insert" on public.table_chat_messages;
create policy "table_chat_messages_public_insert"
on public.table_chat_messages
for insert
to anon, authenticated
with check (true);

-- -----------------------------------------------------------------------------
-- 5) Realtime publication
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'table_chats'
  ) then
    execute 'alter publication supabase_realtime add table public.table_chats';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'table_chat_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.table_chat_messages';
  end if;
end
$$;
