-- =============================================================================
-- LECHAIM — Fix document delete (Storage API vs storage.objects)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Why: Postgres DELETE on storage.objects is blocked:
--   "Direct deletion from storage tables is not allowed. Use the Storage API instead."
-- The admin client now removes the file via Storage API, then this RPC deletes the row.
-- Does not change vault, bucket privacy, or other RLS.
-- =============================================================================

create or replace function public.delete_business_document(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  if p_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_id');
  end if;

  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not public.documents_vault_is_unlocked() then
    return jsonb_build_object('ok', false, 'error', 'not_unlocked');
  end if;

  delete from public.business_documents
  where id = p_id;

  get diagnostics v_deleted = row_count;
  if v_deleted < 1 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.delete_business_document(uuid) from public, anon;
grant execute on function public.delete_business_document(uuid) to authenticated;

comment on function public.delete_business_document(uuid) is
  'Vault-gated delete of a business document row. Client removes the Storage object via Storage API.';

notify pgrst, 'reload schema';
