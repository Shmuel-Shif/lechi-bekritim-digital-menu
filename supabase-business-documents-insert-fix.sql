-- =============================================================================
-- LECHAIM — Fix document insert (RLS + vault-gated save RPC)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Symptom: "new row violates row-level security policy" when saving
-- a cash/credit payment or an invoice.
-- Does NOT change vault code, till, orders, or print.
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

create or replace function public.save_business_document(p_row jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved public.business_documents;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not public.documents_vault_is_unlocked() then
    return jsonb_build_object('ok', false, 'error', 'not_unlocked');
  end if;

  if p_row is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_row');
  end if;

  insert into public.business_documents (
    id,
    storage_bucket,
    storage_path,
    original_filename,
    mime_type,
    file_size_bytes,
    document_type,
    category,
    supplier_name,
    document_number,
    document_date,
    currency,
    amount_before_vat,
    vat_amount,
    amount_total,
    notes,
    status,
    ocr_status,
    ocr_raw,
    created_by
  ) values (
    coalesce(nullif(p_row->>'id', '')::uuid, gen_random_uuid()),
    coalesce(nullif(p_row->>'storage_bucket', ''), 'business-documents'),
    nullif(p_row->>'storage_path', ''),
    coalesce(p_row->>'original_filename', ''),
    coalesce(p_row->>'mime_type', ''),
    nullif(p_row->>'file_size_bytes', '')::integer,
    coalesce(nullif(p_row->>'document_type', ''), 'supplier_invoice'),
    coalesce(p_row->>'category', ''),
    coalesce(p_row->>'supplier_name', ''),
    coalesce(p_row->>'document_number', ''),
    nullif(p_row->>'document_date', '')::date,
    coalesce(nullif(p_row->>'currency', ''), 'EUR'),
    nullif(p_row->>'amount_before_vat', '')::numeric,
    nullif(p_row->>'vat_amount', '')::numeric,
    nullif(p_row->>'amount_total', '')::numeric,
    coalesce(p_row->>'notes', ''),
    coalesce(nullif(p_row->>'status', ''), 'saved'),
    coalesce(nullif(p_row->>'ocr_status', ''), 'none'),
    case
      when p_row->'ocr_raw' is null or p_row->>'ocr_raw' in ('', 'null') then null
      else p_row->'ocr_raw'
    end,
    auth.uid()
  )
  returning * into v_saved;

  return jsonb_build_object('ok', true, 'row', to_jsonb(v_saved));
end;
$$;

revoke all on function public.save_business_document(jsonb) from public, anon;
grant execute on function public.save_business_document(jsonb) to authenticated;

notify pgrst, 'reload schema';
