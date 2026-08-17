-- =============================================================================
-- LECHAIM — Shop hours overrides (admin פתח חנות / סגור חנות)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run. Requires restaurant_flags.
--
-- shop_force_open: open outside 14:00–22:00 until flag_text (ISO).
-- shop_force_close: close during 14:00–22:00 until flag_text (ISO).
-- If admin does not click, both expire at 22:00 (or midnight if after close)
-- and the normal schedule resumes.
-- =============================================================================

insert into public.restaurant_flags (flag_key, flag_value, flag_text)
values ('shop_force_open', false, null)
on conflict (flag_key) do nothing;

insert into public.restaurant_flags (flag_key, flag_value, flag_text)
values ('shop_force_close', false, null)
on conflict (flag_key) do nothing;

comment on table public.restaurant_flags is
  'Global restaurant switches. shop_force_open / shop_force_close last until flag_text (ISO); then schedule applies.';
