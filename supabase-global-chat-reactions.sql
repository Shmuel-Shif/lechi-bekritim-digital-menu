-- =============================================================================
-- LECHAIM — Stage 6: Reactions on the global dine-in chat
-- Run in: Supabase → SQL Editor → New query → Run
-- Safe to re-run.
--
-- Does NOT alter global_chat_messages.
-- Does NOT touch private table chat (table_chats / table_chat_messages).
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1) Reactions — one row per (message + reactor + emoji)
-- -----------------------------------------------------------------------------
create table if not exists public.global_chat_reactions (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null
              references public.global_chat_messages (id)
              on delete cascade,
  session_id  uuid null,
  sender      text not null
              check (sender in ('guest', 'staff')),
  emoji       text not null
              check (emoji in ('❤️', '😂', '👍', '🔥', '😍', '👏')),
  created_at  timestamptz not null default now(),
  constraint global_chat_reactions_actor_chk check (
    (sender = 'guest' and session_id is not null)
    or (sender = 'staff' and session_id is null)
  )
);

comment on table public.global_chat_reactions is
  'Emoji reactions on global chat messages. Guests keyed by session_id; staff is one shared Lechaim identity.';

create index if not exists global_chat_reactions_message_idx
  on public.global_chat_reactions (message_id);

create unique index if not exists global_chat_reactions_guest_unique_idx
  on public.global_chat_reactions (message_id, session_id, emoji)
  where session_id is not null;

create unique index if not exists global_chat_reactions_staff_unique_idx
  on public.global_chat_reactions (message_id, emoji)
  where sender = 'staff';

alter table public.global_chat_reactions replica identity full;

-- -----------------------------------------------------------------------------
-- 2) Validate insert — muted guests cannot react; deleted messages cannot
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

drop trigger if exists trg_global_chat_reaction_prepare on public.global_chat_reactions;
create trigger trg_global_chat_reaction_prepare
  before insert on public.global_chat_reactions
  for each row
  execute function public.prepare_global_chat_reaction();

-- Soft-delete of a message removes its reactions
create or replace function public.delete_global_chat_reactions_on_soft_delete()
returns trigger
language plpgsql
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.global_chat_reactions
    where message_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_global_chat_reactions_soft_delete on public.global_chat_messages;
create trigger trg_global_chat_reactions_soft_delete
  after update of deleted_at on public.global_chat_messages
  for each row
  execute function public.delete_global_chat_reactions_on_soft_delete();

-- -----------------------------------------------------------------------------
-- 3) RLS
-- -----------------------------------------------------------------------------
alter table public.global_chat_reactions enable row level security;

drop policy if exists "global_chat_reactions_select" on public.global_chat_reactions;
create policy "global_chat_reactions_select"
on public.global_chat_reactions
for select
to anon, authenticated
using (true);

drop policy if exists "global_chat_reactions_insert" on public.global_chat_reactions;
create policy "global_chat_reactions_insert"
on public.global_chat_reactions
for insert
to anon, authenticated
with check (true);

drop policy if exists "global_chat_reactions_delete" on public.global_chat_reactions;
create policy "global_chat_reactions_delete"
on public.global_chat_reactions
for delete
to anon, authenticated
using (true);

-- -----------------------------------------------------------------------------
-- 4) Realtime
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'global_chat_reactions'
  ) then
    execute 'alter publication supabase_realtime add table public.global_chat_reactions';
  end if;
end
$$;
