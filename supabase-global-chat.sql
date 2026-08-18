-- =============================================================================
-- LECHAIM — Stage 2: Global dine-in guest chat
-- Run in: Supabase → SQL Editor → New query → Run
-- Safe to re-run.
--
-- Separate from private table chat (table_chats / table_chat_messages).
-- Do not alter those tables.
-- =============================================================================

create extension if not exists "pgcrypto";

create sequence if not exists public.global_chat_guest_number_seq;

-- -----------------------------------------------------------------------------
-- 1) Members — one row per dine-in visit (session)
-- -----------------------------------------------------------------------------
create table if not exists public.global_chat_members (
  session_id              uuid primary key
                          references public.order_sessions (session_id)
                          on delete cascade,
  table_number            integer not null,
  guest_number            integer not null default nextval('public.global_chat_guest_number_seq'),
  display_name            text not null default 'אורח',
  accepted_guidelines_at  timestamptz null,
  is_muted                boolean not null default false,
  created_at              timestamptz not null default now()
);

comment on table public.global_chat_members is
  'Global chat membership for one dine-in visit. table_number is admin-only.';

create unique index if not exists global_chat_members_guest_number_idx
  on public.global_chat_members (guest_number);

-- -----------------------------------------------------------------------------
-- 2) Messages — one shared room. table_number is a snapshot for admin.
-- -----------------------------------------------------------------------------
create table if not exists public.global_chat_messages (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid null
                references public.order_sessions (session_id)
                on delete set null,
  sender        text not null
                check (sender in ('guest', 'staff')),
  display_name  text not null,
  guest_number  integer null,
  table_number  integer null,
  body          text not null
                check (char_length(trim(body)) between 1 and 500),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz null
);

comment on table public.global_chat_messages is
  'Shared dine-in evening chat. Guests never display table_number.';

create index if not exists global_chat_messages_created_idx
  on public.global_chat_messages (created_at desc);

alter table public.global_chat_members replica identity full;
alter table public.global_chat_messages replica identity full;

-- -----------------------------------------------------------------------------
-- 3) Fill member fields + require an open dine-in session
-- -----------------------------------------------------------------------------
create or replace function public.prepare_global_chat_member()
returns trigger
language plpgsql
as $$
declare
  sess_status text;
  sess_type text;
  sess_table integer;
begin
  select status, order_type, table_number
    into sess_status, sess_type, sess_table
  from public.order_sessions
  where session_id = new.session_id;

  if not found then
    raise exception 'global chat requires an existing session';
  end if;

  if sess_status = 'closed' then
    raise exception 'global chat is closed with the session';
  end if;

  if sess_type is not null and sess_type not in ('dine_in', 'dine-in', 'dinein') then
    raise exception 'global chat is dine-in only';
  end if;

  if sess_table is null then
    raise exception 'global chat requires a table number';
  end if;

  new.table_number := sess_table;
  if new.guest_number is null then
    new.guest_number := nextval('public.global_chat_guest_number_seq');
  end if;
  new.display_name := 'אורח ' || new.guest_number::text;
  return new;
end;
$$;

drop trigger if exists trg_global_chat_member_prepare on public.global_chat_members;
create trigger trg_global_chat_member_prepare
  before insert on public.global_chat_members
  for each row
  execute function public.prepare_global_chat_member();

-- Anon may accept guidelines; only staff may mute
create or replace function public.guard_global_chat_member_update()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'anon' then
    new.is_muted := old.is_muted;
    new.guest_number := old.guest_number;
    new.display_name := old.display_name;
    new.table_number := old.table_number;
    new.session_id := old.session_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_global_chat_member_guard on public.global_chat_members;
create trigger trg_global_chat_member_guard
  before update on public.global_chat_members
  for each row
  execute function public.guard_global_chat_member_update();

-- -----------------------------------------------------------------------------
-- 4) Validate + stamp messages
-- -----------------------------------------------------------------------------
create or replace function public.prepare_global_chat_message()
returns trigger
language plpgsql
as $$
declare
  sess_status text;
  sess_type text;
  member public.global_chat_members%rowtype;
begin
  new.body := trim(new.body);

  if new.sender = 'staff' then
    new.session_id := null;
    new.display_name := 'Lechaim';
    new.guest_number := null;
    new.table_number := null;
    return new;
  end if;

  if new.session_id is null then
    raise exception 'guest global chat requires a session';
  end if;

  select status, order_type
    into sess_status, sess_type
  from public.order_sessions
  where session_id = new.session_id;

  if not found or sess_status = 'closed' then
    raise exception 'global chat requires an open dine-in session';
  end if;

  if sess_type is not null and sess_type not in ('dine_in', 'dine-in', 'dinein') then
    raise exception 'global chat is dine-in only';
  end if;

  select * into member
  from public.global_chat_members
  where session_id = new.session_id;

  if not found then
    raise exception 'join global chat before sending';
  end if;

  if member.is_muted then
    raise exception 'global chat member is muted';
  end if;

  new.display_name := member.display_name;
  new.guest_number := member.guest_number;
  new.table_number := member.table_number;
  return new;
end;
$$;

drop trigger if exists trg_global_chat_message_prepare on public.global_chat_messages;
create trigger trg_global_chat_message_prepare
  before insert on public.global_chat_messages
  for each row
  execute function public.prepare_global_chat_message();

create or replace function public.guard_global_chat_message_update()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'anon' then
    raise exception 'only staff can moderate global chat';
  end if;
  new.session_id := old.session_id;
  new.sender := old.sender;
  new.display_name := old.display_name;
  new.guest_number := old.guest_number;
  new.table_number := old.table_number;
  new.body := old.body;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists trg_global_chat_message_guard on public.global_chat_messages;
create trigger trg_global_chat_message_guard
  before update on public.global_chat_messages
  for each row
  execute function public.guard_global_chat_message_update();

-- -----------------------------------------------------------------------------
-- 5) RLS — same public insert/select pattern as orders; updates guarded above
-- -----------------------------------------------------------------------------
alter table public.global_chat_members enable row level security;
alter table public.global_chat_messages enable row level security;

drop policy if exists "global_chat_members_select" on public.global_chat_members;
create policy "global_chat_members_select"
on public.global_chat_members
for select
to anon, authenticated
using (true);

drop policy if exists "global_chat_members_insert" on public.global_chat_members;
create policy "global_chat_members_insert"
on public.global_chat_members
for insert
to anon, authenticated
with check (true);

drop policy if exists "global_chat_members_update" on public.global_chat_members;
create policy "global_chat_members_update"
on public.global_chat_members
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "global_chat_messages_select" on public.global_chat_messages;
create policy "global_chat_messages_select"
on public.global_chat_messages
for select
to anon, authenticated
using (true);

drop policy if exists "global_chat_messages_insert" on public.global_chat_messages;
create policy "global_chat_messages_insert"
on public.global_chat_messages
for insert
to anon, authenticated
with check (true);

drop policy if exists "global_chat_messages_update" on public.global_chat_messages;
create policy "global_chat_messages_update"
on public.global_chat_messages
for update
to authenticated
using (true)
with check (true);

drop policy if exists "global_chat_messages_delete" on public.global_chat_messages;
create policy "global_chat_messages_delete"
on public.global_chat_messages
for delete
to authenticated
using (true);

-- -----------------------------------------------------------------------------
-- 6) Realtime
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'global_chat_members'
  ) then
    execute 'alter publication supabase_realtime add table public.global_chat_members';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'global_chat_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.global_chat_messages';
  end if;
end
$$;
