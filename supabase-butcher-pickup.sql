-- Scheduled pickup date for butcher + takeaway/delivery (run in Supabase SQL Editor)
-- Reuses pickup_type / pickup_time; adds calendar day when customer picks a future slot.

alter table public.order_sessions
  add column if not exists pickup_date date null;

comment on column public.order_sessions.pickup_date is
  'Calendar day for scheduled pickup/delivery (YYYY-MM-DD). Null when ASAP or N/A.';
