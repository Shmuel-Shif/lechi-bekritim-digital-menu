-- =============================================================================
-- LECHAIM — Persist document suppliers + allow cash/credit payments without a file
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Does NOT change vault / bucket privacy / till / orders.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Supplier catalog (survives refresh)
-- -----------------------------------------------------------------------------
create table if not exists public.business_document_suppliers (
  name        text primary key,
  created_at  timestamptz not null default now(),
  constraint business_document_suppliers_name_nonempty
    check (length(trim(name)) > 0),
  constraint business_document_suppliers_name_len
    check (char_length(name) <= 120)
);

comment on table public.business_document_suppliers is
  'Supplier folders in documents. Names persist even before the first invoice.';

insert into public.business_document_suppliers (name)
values
  ('ירקות'),
  ('דה מארט'),
  ('שתייה'),
  ('דגים'),
  ('לחם'),
  ('ביצים'),
  ('חד פעמי'),
  ('חשבוניות קטנות'),
  ('חשבוניות כלליות'),
  ('דוח Z'),
  ('תשלום מזומן/אשראי')
on conflict (name) do nothing;

insert into public.business_document_suppliers (name)
select distinct trim(d.supplier_name)
from public.business_documents d
where length(trim(d.supplier_name)) > 0
on conflict (name) do nothing;

alter table public.business_document_suppliers enable row level security;
alter table public.business_document_suppliers force row level security;

revoke all on table public.business_document_suppliers from public, anon;
grant select, insert, delete on table public.business_document_suppliers to authenticated;

drop policy if exists "business_document_suppliers_auth_select"
  on public.business_document_suppliers;
create policy "business_document_suppliers_auth_select"
on public.business_document_suppliers
for select
to authenticated
using (public.documents_vault_is_unlocked());

drop policy if exists "business_document_suppliers_auth_insert"
  on public.business_document_suppliers;
create policy "business_document_suppliers_auth_insert"
on public.business_document_suppliers
for insert
to authenticated
with check (public.documents_vault_is_unlocked());

drop policy if exists "business_document_suppliers_auth_delete"
  on public.business_document_suppliers;
create policy "business_document_suppliers_auth_delete"
on public.business_document_suppliers
for delete
to authenticated
using (public.documents_vault_is_unlocked());

-- -----------------------------------------------------------------------------
-- 2) Manual cash/credit payment rows may have no Storage file
-- -----------------------------------------------------------------------------
alter table public.business_documents
  alter column storage_path drop not null;

alter table public.business_documents
  alter column file_size_bytes drop not null;

alter table public.business_documents
  alter column original_filename set default '';

alter table public.business_documents
  drop constraint if exists business_documents_manual_file_check;

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
        pg_get_constraintdef(oid) ilike '%file_size_bytes%'
        or pg_get_constraintdef(oid) ilike '%mime_type in%'
        or pg_get_constraintdef(oid) ilike '%document_type in%'
        or pg_get_constraintdef(oid) ilike '%original_filename%'
        or conname in (
          'business_documents_filename_len',
          'business_documents_mime_ok',
          'business_documents_document_type_check',
          'business_documents_file_size_bytes_check',
          'business_documents_manual_file_check'
        )
      )
  loop
    execute format('alter table public.business_documents drop constraint if exists %I', c.conname);
  end loop;
end
$$;

alter table public.business_documents
  add constraint business_documents_filename_len check (
    storage_path is null
    or char_length(trim(original_filename)) between 1 and 180
  );

alter table public.business_documents
  add constraint business_documents_mime_ok check (
    storage_path is null
    or mime_type in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf'
    )
  );

alter table public.business_documents
  add constraint business_documents_file_size_bytes_check check (
    file_size_bytes is null
    or (file_size_bytes > 0 and file_size_bytes <= 15728640)
  );

alter table public.business_documents
  add constraint business_documents_document_type_check check (
    document_type in (
      'supplier_invoice',
      'receipt',
      'purchase_invoice',
      'expense',
      'other',
      'manual_payment'
    )
  );

alter table public.business_documents
  add constraint business_documents_manual_file_check check (
    (document_type = 'manual_payment' and storage_path is null)
    or (document_type <> 'manual_payment' and storage_path is not null)
  );

notify pgrst, 'reload schema';
