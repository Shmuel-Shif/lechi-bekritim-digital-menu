-- =============================================================================
-- LECHAIM — Private expense supplier folder
-- Safe to re-run.
--
-- App behavior:
--   supplier_name = 'רכישה פרטית / מחוץ לכספי העסק'
--   category = 'private'
--   currency = EUR | ILS | USD
--   with file: document_type = supplier_invoice
--   without file: document_type = manual_payment
--
-- Currency is already handled by supabase-business-documents-insert-form.sql
-- (save_business_document). Re-run that file if UPDATE does not keep currency.
-- =============================================================================

insert into public.business_document_suppliers (name)
values ('רכישה פרטית / מחוץ לכספי העסק')
on conflict (name) do nothing;
