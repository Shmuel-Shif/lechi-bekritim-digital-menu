-- =============================================================================
-- LECHAIM — Hero slideshow dishes (admin toggle → rotating header foto)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
-- =============================================================================

alter table public.inventory
  add column if not exists hero_slideshow boolean not null default false;

comment on column public.inventory.hero_slideshow is
  'When true, dish image is included in the customer menu hero slideshow (תפריט מתחלף).';

-- Realtime already publishes public.inventory (replica identity full).
-- No new table / policies needed: same RLS as availability / recommended.
