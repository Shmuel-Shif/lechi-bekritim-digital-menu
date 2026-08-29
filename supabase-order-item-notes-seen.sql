-- LECHAIM — Kitchen unread alerts for per-dish notes.
-- Does NOT change notes / notes_el meaning, print, till, table close,
-- kitchen_status, kitchen_all_ready, or quantities.
-- Safe to re-run.
--
-- Unread iff note text exists AND notes_version > notes_seen_version.
-- Old rows stay 0/0 → no alert on first load after this SQL.
--
-- Run in: Supabase → SQL Editor → New query → Run.

alter table public.order_items
  add column if not exists notes_version integer;

alter table public.order_items
  add column if not exists notes_seen_version integer;

update public.order_items
  set notes_version = 0
  where notes_version is null;

update public.order_items
  set notes_seen_version = 0
  where notes_seen_version is null;

alter table public.order_items
  alter column notes_version set default 0;

alter table public.order_items
  alter column notes_seen_version set default 0;

alter table public.order_items
  alter column notes_version set not null;

alter table public.order_items
  alter column notes_seen_version set not null;

comment on column public.order_items.notes_version is
  'Bumped by trigger when notes / notes_el change. Kitchen unread if greater than notes_seen_version.';

comment on column public.order_items.notes_seen_version is
  'Last notes_version the kitchen acknowledged with קראתי. Opening a table does not change this.';

create or replace function public.bump_order_item_notes_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(trim(new.notes), '') <> ''
       or coalesce(trim(new.notes_el), '') <> '' then
      new.notes_version := 1;
      new.notes_seen_version := 0;
    else
      new.notes_version := 0;
      new.notes_seen_version := 0;
    end if;
    return new;
  end if;

  if (new.notes is distinct from old.notes)
     or (new.notes_el is distinct from old.notes_el) then
    if coalesce(trim(new.notes), '') = ''
       and coalesce(trim(new.notes_el), '') = '' then
      new.notes_version := 0;
      new.notes_seen_version := 0;
    else
      new.notes_version := coalesce(old.notes_version, 0) + 1;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists order_items_notes_version on public.order_items;

create trigger order_items_notes_version
before insert or update of notes, notes_el on public.order_items
for each row
execute function public.bump_order_item_notes_version();
