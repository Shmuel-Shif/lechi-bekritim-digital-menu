-- =============================================================================
-- LECHAIM — Restaurant flags (dine-in close countdown)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
-- =============================================================================

create table if not exists public.restaurant_flags (
  flag_key   text primary key,
  flag_value boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.restaurant_flags
  add column if not exists flag_text text null;

comment on table public.restaurant_flags is
  'Global restaurant switches. dine_in_close_at.flag_text = ISO deadline; flag_value=true while countdown/closed active.';

comment on column public.restaurant_flags.flag_text is
  'Optional string payload (e.g. ISO timestamp for dine_in_close_at).';

-- New countdown key (deadline stored in flag_text)
insert into public.restaurant_flags (flag_key, flag_value, flag_text)
values ('dine_in_close_at', false, null)
on conflict (flag_key) do nothing;

-- Keep legacy boolean row harmless if it already exists
insert into public.restaurant_flags (flag_key, flag_value)
values ('dine_in_orders_closed', false)
on conflict (flag_key) do nothing;

-- Customer takeaway card: when true, hide delivery wording + address option
insert into public.restaurant_flags (flag_key, flag_value)
values ('deliveries_closed', false)
on conflict (flag_key) do nothing;

-- Customer Shabbat card: when false, disable ordering entry + shabbat.html
insert into public.restaurant_flags (flag_key, flag_value)
values ('shabbat_orders_enabled', true)
on conflict (flag_key) do nothing;

-- Central settings (hours / delivery copy / Shabbat pickup) live in flag_text
insert into public.restaurant_flags (flag_key, flag_value, flag_text)
values
  ('hours_open', true, '14:00'),
  ('hours_close', true, '21:00'),
  ('hours_weekly', true, '{"0":{"open":true,"from":"14:00","to":"21:00"},"1":{"open":true,"from":"14:00","to":"21:00"},"2":{"open":true,"from":"14:00","to":"21:00"},"3":{"open":true,"from":"14:00","to":"21:00"},"4":{"open":true,"from":"14:00","to":"21:00"},"5":{"open":false,"from":"14:00","to":"21:00"},"6":{"open":false,"from":"14:00","to":"21:00"}}'),
  ('delivery_fee', true, '10'),
  ('delivery_min_order', true, '100'),
  ('delivery_eta', true, '30–45 דקות'),
  ('shabbat_pickup_time', true, '14:00')
on conflict (flag_key) do nothing;

alter table public.restaurant_flags enable row level security;

drop policy if exists "restaurant_flags_public_select" on public.restaurant_flags;
create policy "restaurant_flags_public_select"
on public.restaurant_flags
for select
to anon, authenticated
using (true);

drop policy if exists "restaurant_flags_auth_insert" on public.restaurant_flags;
create policy "restaurant_flags_auth_insert"
on public.restaurant_flags
for insert
to authenticated
with check (true);

drop policy if exists "restaurant_flags_auth_update" on public.restaurant_flags;
create policy "restaurant_flags_auth_update"
on public.restaurant_flags
for update
to authenticated
using (true)
with check (true);

drop policy if exists "restaurant_flags_auth_delete" on public.restaurant_flags;
create policy "restaurant_flags_auth_delete"
on public.restaurant_flags
for delete
to authenticated
using (true);

grant select on public.restaurant_flags to anon, authenticated;
grant insert, update, delete on public.restaurant_flags to authenticated;

alter table public.restaurant_flags replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'restaurant_flags'
  ) then
    execute 'alter publication supabase_realtime add table public.restaurant_flags';
  end if;
end $$;
