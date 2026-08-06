-- Shabbat orders open/close switch (run in Supabase SQL Editor)
-- Reuses public.restaurant_flags. Safe to re-run.

insert into public.restaurant_flags (flag_key, flag_value)
values ('shabbat_orders_enabled', true)
on conflict (flag_key) do nothing;

comment on table public.restaurant_flags is
  'Global restaurant switches. shabbat_orders_enabled=true means customer Shabbat ordering is open.';
