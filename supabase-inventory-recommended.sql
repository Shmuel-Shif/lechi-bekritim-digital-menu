-- =============================================================================
-- LECHAIM — Recommended dishes (admin toggle → customer card ribbon)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
-- =============================================================================

alter table public.inventory
  add column if not exists recommended boolean not null default false;

comment on column public.inventory.recommended is
  'When true, customer menu shows a "מומלץ" ribbon on the dish card.';

-- Realtime already publishes public.inventory (replica identity full).
-- No new table / policies needed: same RLS as availability.
