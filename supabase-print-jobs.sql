-- =============================================================================
-- LECHAIM — Cloud print jobs (phone → Supabase → local printer-service)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Authenticated admin: INSERT pending rows only (and SELECT own rows).
-- Local printer-service (service_role): claim + status updates.
-- The PC path POST http://127.0.0.1:3001/print is unchanged and does not
-- write to this table.
-- =============================================================================

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  printer text not null check (printer in ('kitchen', 'bar')),
  ticket text not null check (char_length(ticket) > 0),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'printed', 'failed')),
  error text,
  source text not null default 'phone',
  claimed_at timestamptz,
  printed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists print_jobs_pending_idx
  on public.print_jobs (created_at)
  where status = 'pending';

create index if not exists print_jobs_user_idx
  on public.print_jobs (user_id, created_at desc);

alter table public.print_jobs enable row level security;

revoke all on table public.print_jobs from public, anon, authenticated;
grant select, insert on table public.print_jobs to authenticated;
grant all on table public.print_jobs to service_role;

drop policy if exists print_jobs_select_own on public.print_jobs;
create policy print_jobs_select_own
  on public.print_jobs
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists print_jobs_insert_pending on public.print_jobs;
create policy print_jobs_insert_pending
  on public.print_jobs
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and claimed_at is null
    and printed_at is null
    and error is null
    and printer in ('kitchen', 'bar')
    and char_length(ticket) > 0
  );

comment on table public.print_jobs is
  'Phone print queue. Local printer-service claims pending rows and feeds the existing kitchen/bar queue. PC localhost prints never write here.';

-- Atomic claim: pending → processing. SKIP LOCKED so two PCs cannot take the same row.
create or replace function public.claim_print_jobs(p_limit integer default 5)
returns setof public.print_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit is null or p_limit < 1 then
    p_limit := 1;
  end if;
  if p_limit > 20 then
    p_limit := 20;
  end if;

  return query
  update public.print_jobs as j
  set
    status = 'processing',
    claimed_at = now(),
    updated_at = now()
  where j.id in (
    select p.id
    from public.print_jobs as p
    where p.status = 'pending'
    order by p.created_at asc
    for update skip locked
    limit p_limit
  )
  returning j.*;
end;
$$;

revoke all on function public.claim_print_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_print_jobs(integer) to service_role;

comment on function public.claim_print_jobs(integer) is
  'Local print service only (service_role). Atomically claims pending print jobs.';
