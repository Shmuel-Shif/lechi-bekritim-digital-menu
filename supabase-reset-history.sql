-- =============================================================================
-- LECHAIM — Reset closed history (dine-in + takeaway) to empty
-- Run in: Supabase → SQL Editor → Run
-- Does NOT delete open sessions or Shabbat.
-- =============================================================================

delete from public.order_sessions
where status = 'closed'
  and order_type in ('dine_in', 'takeaway');
