-- =============================================================================
-- LECHAIM — Global chat by guest (phone), not by table / order session
-- Run in: Supabase → SQL Editor → New query → Run
-- Safe to re-run.
--
-- After this, sending a global-chat message does NOT open a table in Admin.
-- Private table chat (table_chats) is unchanged.
-- =============================================================================

-- Drop FKs to order_sessions so guests are independent devices
alter table public.global_chat_members
  drop constraint if exists global_chat_members_session_id_fkey;

alter table public.global_chat_messages
  drop constraint if exists global_chat_messages_session_id_fkey;

alter table public.global_chat_reactions
  drop constraint if exists global_chat_reactions_session_id_fkey;

alter table public.global_chat_members
  alter column table_number drop not null;

comment on table public.global_chat_members is
  'Global chat membership for one guest device. session_id is a local guest uuid, not an order session.';

comment on column public.global_chat_members.session_id is
  'Guest device id (localStorage). Not a foreign key to order_sessions.';

comment on column public.global_chat_members.table_number is
  'Optional snapshot if the guest later picks a table. Admin-only.';

-- -----------------------------------------------------------------------------
-- Members: assign guest number only — no order session required
-- -----------------------------------------------------------------------------
create or replace function public.prepare_global_chat_member()
returns trigger
language plpgsql
as $$
begin
  if new.guest_number is null then
    new.guest_number := nextval('public.global_chat_guest_number_seq');
  end if;
  new.display_name := 'אורח ' || new.guest_number::text;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Messages: stamp from member row — no order session required
-- -----------------------------------------------------------------------------
create or replace function public.prepare_global_chat_message()
returns trigger
language plpgsql
as $$
declare
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
    raise exception 'guest global chat requires a guest id';
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
  if new.table_number is null then
    new.table_number := member.table_number;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reactions: guest id on members, not an open table session
-- -----------------------------------------------------------------------------
create or replace function public.prepare_global_chat_reaction()
returns trigger
language plpgsql
as $$
declare
  msg public.global_chat_messages%rowtype;
  member public.global_chat_members%rowtype;
begin
  if new.emoji not in ('❤️', '😂', '👍', '🔥', '😍', '👏') then
    raise exception 'invalid reaction';
  end if;

  select * into msg
  from public.global_chat_messages
  where id = new.message_id;

  if not found then
    raise exception 'global chat reaction requires an existing message';
  end if;

  if msg.deleted_at is not null then
    raise exception 'cannot react to a deleted message';
  end if;

  if new.sender = 'staff' then
    new.session_id := null;
    new.sender := 'staff';
    return new;
  end if;

  new.sender := 'guest';

  if new.session_id is null then
    raise exception 'guest reaction requires a guest id';
  end if;

  select * into member
  from public.global_chat_members
  where session_id = new.session_id;

  if not found then
    raise exception 'join global chat before reacting';
  end if;

  if member.is_muted then
    raise exception 'global chat member is muted';
  end if;

  return new;
end;
$$;
