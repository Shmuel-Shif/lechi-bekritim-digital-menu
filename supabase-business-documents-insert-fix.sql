-- =============================================================================
-- LECHAIM — Fix document insert RLS
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Symptom: "new row violates row-level security policy" when saving an invoice.
-- Does NOT change vault code, bucket privacy, till, or orders.
-- =============================================================================

grant execute on function public.documents_vault_is_unlocked() to authenticated;

drop policy if exists "business_documents_auth_insert" on public.business_documents;
create policy "business_documents_auth_insert"
on public.business_documents
for insert
to authenticated
with check (public.documents_vault_is_unlocked());

drop policy if exists "business_documents_auth_select" on public.business_documents;
create policy "business_documents_auth_select"
on public.business_documents
for select
to authenticated
using (public.documents_vault_is_unlocked());

drop policy if exists "business_documents_auth_update" on public.business_documents;
create policy "business_documents_auth_update"
on public.business_documents
for update
to authenticated
using (public.documents_vault_is_unlocked())
with check (public.documents_vault_is_unlocked());

drop policy if exists "documents_vault_storage_select" on storage.objects;
create policy "documents_vault_storage_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'business-documents'
  and public.documents_vault_is_unlocked()
);

drop policy if exists "documents_vault_storage_insert" on storage.objects;
create policy "documents_vault_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'business-documents'
  and public.documents_vault_is_unlocked()
);

drop policy if exists "documents_vault_storage_update" on storage.objects;
create policy "documents_vault_storage_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'business-documents'
  and public.documents_vault_is_unlocked()
)
with check (
  bucket_id = 'business-documents'
  and public.documents_vault_is_unlocked()
);

drop policy if exists "documents_vault_storage_delete" on storage.objects;
create policy "documents_vault_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'business-documents'
  and public.documents_vault_is_unlocked()
);

notify pgrst, 'reload schema';
