-- =============================================================================
-- LECHAIM — Income credits (זיכויים) inside business documents
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Extends business_documents only. Does NOT alter till sessions, orders,
-- Restaurant OS, or existing sale rows.
--
-- income_credit may be saved with or without an attached file/photo.
-- =============================================================================

insert into public.business_document_suppliers (name)
values ('זיכויים')
on conflict (name) do nothing;

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.business_documents'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) ilike '%document_type in%'
        or pg_get_constraintdef(oid) ilike '%manual_file%'
        or conname in (
          'business_documents_document_type_check',
          'business_documents_manual_file_check'
        )
      )
  loop
    execute format('alter table public.business_documents drop constraint if exists %I', c.conname);
  end loop;
end
$$;

alter table public.business_documents
  add constraint business_documents_document_type_check check (
    document_type in (
      'supplier_invoice',
      'receipt',
      'purchase_invoice',
      'expense',
      'other',
      'manual_payment',
      'income_credit'
    )
  );

-- manual_payment: always text-only (no file)
-- income_credit: file/photo optional
-- everything else: file required
alter table public.business_documents
  add constraint business_documents_manual_file_check check (
    (document_type = 'manual_payment' and storage_path is null)
    or (document_type = 'income_credit')
    or (
      document_type not in ('manual_payment', 'income_credit')
      and storage_path is not null
    )
  );

notify pgrst, 'reload schema';
