-- =============================================================================
-- LECHAIM — Central settings keys on restaurant_flags
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run. Reuses restaurant_flags (RLS + Realtime already enabled).
-- =============================================================================

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
