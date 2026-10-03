-- =============================================================================
-- LECHAIM — Admin sticky notes / reminders (פתקים)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Isolated module. Does NOT alter orders, till, documents, staff, kitchen,
-- or Restaurant OS.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admin_notes (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null,
  remind_at     timestamptz null,
  status        text not null default 'open'
                check (status in ('open', 'done')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz null,
  created_by    uuid null,
  constraint admin_notes_title_len check (char_length(title) between 1 and 120),
  constraint admin_notes_body_len check (char_length(body) between 1 and 4000),
  constraint admin_notes_done_completed check (
    (status = 'open' and completed_at is null)
    or (status = 'done' and completed_at is not null)
  )
);

create index if not exists admin_notes_status_idx
  on public.admin_notes (status, created_at desc);

create index if not exists admin_notes_remind_idx
  on public.admin_notes (remind_at asc nulls last)
  where status = 'open';

comment on table public.admin_notes is
  'Manager sticky notes / reminders. Done notes stay for history.';

create or replace function public.admin_notes_before_write()
returns trigger
language plpgsql
as $$
begin
  new.title := trim(new.title);
  new.body := trim(new.body);
  new.updated_at := now();
  if new.status = 'done' and new.completed_at is null then
    new.completed_at := now();
  end if;
  if new.status = 'open' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_admin_notes_before_write on public.admin_notes;
create trigger trg_admin_notes_before_write
before insert or update on public.admin_notes
for each row
execute function public.admin_notes_before_write();

alter table public.admin_notes enable row level security;
alter table public.admin_notes force row level security;

revoke all on table public.admin_notes from public, anon;
grant select, insert, update, delete on table public.admin_notes to authenticated;

drop policy if exists "admin_notes_auth_select" on public.admin_notes;
create policy "admin_notes_auth_select"
on public.admin_notes
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "admin_notes_auth_insert" on public.admin_notes;
create policy "admin_notes_auth_insert"
on public.admin_notes
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "admin_notes_auth_update" on public.admin_notes;
create policy "admin_notes_auth_update"
on public.admin_notes
for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "admin_notes_auth_delete" on public.admin_notes;
create policy "admin_notes_auth_delete"
on public.admin_notes
for delete
to authenticated
using (auth.uid() is not null);

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'admin_notes'
  ) then
    execute 'alter publication supabase_realtime add table public.admin_notes';
  end if;
end
$$;

notify pgrst, 'reload schema';
