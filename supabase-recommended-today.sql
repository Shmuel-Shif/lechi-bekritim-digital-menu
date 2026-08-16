-- =============================================================================
-- LECHAIM — Recommended today (admin picks one dish → popup on menu entry)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run. Requires restaurant_flags (supabase-restaurant-flags.sql).
-- =============================================================================

insert into public.restaurant_flags (flag_key, flag_value, flag_text)
values ('recommended_today', false, null)
on conflict (flag_key) do nothing;

comment on table public.restaurant_flags is
  'Global restaurant switches. recommended_today.flag_text = product_id; flag_value=true while a dish is selected.';
