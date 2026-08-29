-- LECHAIM — Stored Greek translation for per-dish kitchen notes.
-- Does NOT change print, till, table close, prices, kitchen_status, or existing notes.
-- Safe to re-run.
--
-- notes      = original Hebrew (unchanged meaning)
-- notes_el   = Greek saved once at admin save time
--
-- Old rows keep notes as-is and notes_el NULL. Do not backfill.
--
-- After this SQL, deploy the Edge Function (once):
--   supabase functions deploy translate-note
--   supabase secrets set GOOGLE_TRANSLATE_API_KEY=your_key
-- Or in the Supabase Dashboard: Edge Functions → translate-note → Secrets.

alter table public.order_items
  add column if not exists notes_el text;

comment on column public.order_items.notes_el is
  'Greek kitchen note, saved once with notes. Null on older rows — kitchen shows notes as-is.';
