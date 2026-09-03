-- =============================================================================
-- LECHAIM — Business documents vault (invoices / receipts / expenses)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Isolated module. Does NOT alter order_sessions, till, staff_employees,
-- staff_shifts, staff_clock, inventory, support, print, or kitchen.
--
-- Does NOT use staff_settings_unlock / staff_settings_is_unlocked.
--
-- After first run, set the documents access code once (SQL Editor, as postgres):
--   select public.documents_vault_set_code('YOUR_CODE_HERE');
-- Do not put the real code in website files.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- 1) Documents vault (separate from payroll gate)
-- -----------------------------------------------------------------------------
create table if not exists public.documents_vault_secrets (
  id          integer primary key default 1
              check (id = 1),
  code_hash   text not null,
  updated_at  timestamptz not null default now()
);

create table if not exists public.documents_vault_unlocks (
  user_id      uuid primary key,
  unlocked_at  timestamptz not null default now()
);

alter table public.documents_vault_secrets enable row level security;
alter table public.documents_vault_unlocks enable row level security;
alter table public.documents_vault_secrets force row level security;
alter table public.documents_vault_unlocks force row level security;

revoke all on table public.documents_vault_secrets from public, anon, authenticated;
revoke all on table public.documents_vault_unlocks from public, anon, authenticated;

comment on table public.documents_vault_secrets is
  'Bcrypt hash of the documents vault code. Never readable by anon/authenticated.';
comment on table public.documents_vault_unlocks is
  'Per-auth-user unlock rows for the documents vault. No localStorage.';

create or replace function public.documents_vault_is_unlocked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (
       select 1
       from public.documents_vault_unlocks u
       where u.user_id = auth.uid()
     );
$$;

revoke all on function public.documents_vault_is_unlocked() from public, anon;
grant execute on function public.documents_vault_is_unlocked() to authenticated;

create or replace function public.documents_vault_set_code(p_code text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_code is null or length(trim(p_code)) < 4 then
    raise exception 'code_too_short';
  end if;
  if length(trim(p_code)) > 64 then
    raise exception 'code_too_long';
  end if;

  insert into public.documents_vault_secrets (id, code_hash, updated_at)
  values (1, extensions.crypt(trim(p_code), extensions.gen_salt('bf')), now())
  on conflict (id) do update
    set code_hash = excluded.code_hash,
        updated_at = now();

  delete from public.documents_vault_unlocks;
end;
$$;

revoke all on function public.documents_vault_set_code(text) from public, anon, authenticated;

create or replace function public.documents_vault_verify(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_code is null or length(trim(p_code)) < 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select s.code_hash into v_hash
  from public.documents_vault_secrets s
  where s.id = 1
  limit 1;

  if v_hash is null then
    return jsonb_build_object('ok', false, 'error', 'code_not_set');
  end if;

  if extensions.crypt(trim(p_code), v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.documents_vault_verify(text) from public, anon;
grant execute on function public.documents_vault_verify(text) to authenticated;

create or replace function public.documents_vault_unlock(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_code is null or length(trim(p_code)) < 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select s.code_hash into v_hash
  from public.documents_vault_secrets s
  where s.id = 1
  limit 1;

  if v_hash is null then
    return jsonb_build_object('ok', false, 'error', 'code_not_set');
  end if;

  if extensions.crypt(trim(p_code), v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  insert into public.documents_vault_unlocks (user_id, unlocked_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set unlocked_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.documents_vault_unlock(text) from public, anon;
grant execute on function public.documents_vault_unlock(text) to authenticated;

create or replace function public.documents_vault_lock()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', true);
  end if;

  delete from public.documents_vault_unlocks
  where user_id = auth.uid();

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.documents_vault_lock() from public, anon;
grant execute on function public.documents_vault_lock() to authenticated;

-- -----------------------------------------------------------------------------
-- 2) business_documents
-- -----------------------------------------------------------------------------
create table if not exists public.business_documents (
  id                  uuid primary key default gen_random_uuid(),
  storage_bucket      text not null default 'business-documents',
  storage_path        text not null,
  original_filename   text not null,
  mime_type           text not null,
  file_size_bytes     integer not null
                      check (file_size_bytes > 0 and file_size_bytes <= 15728640),
  document_type       text not null default 'other'
                      check (document_type in (
                        'supplier_invoice',
                        'receipt',
                        'purchase_invoice',
                        'expense',
                        'other'
                      )),
  category            text not null default '',
  supplier_name       text not null default '',
  document_number     text not null default '',
  document_date       date null,
  currency            text not null default 'EUR'
                      check (char_length(currency) = 3),
  amount_before_vat   numeric(10, 2) null
                      check (amount_before_vat is null or amount_before_vat >= 0),
  vat_amount          numeric(10, 2) null
                      check (vat_amount is null or vat_amount >= 0),
  amount_total        numeric(10, 2) null
                      check (amount_total is null or amount_total >= 0),
  notes               text not null default '',
  status              text not null default 'draft'
                      check (status in ('draft', 'saved', 'archived')),
  ocr_status          text not null default 'none'
                      check (ocr_status in ('none', 'pending', 'done', 'failed')),
  ocr_raw             jsonb null,
  created_at          timestamptz not null default now(),
  created_by          uuid null,
  updated_at          timestamptz not null default now(),

  constraint business_documents_path_unique unique (storage_bucket, storage_path),
  constraint business_documents_filename_len check (
    char_length(trim(original_filename)) between 1 and 180
  ),
  constraint business_documents_mime_ok check (
    mime_type in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf'
    )
  ),
  constraint business_documents_bucket_ok check (
    storage_bucket = 'business-documents'
  ),
  constraint business_documents_notes_len check (char_length(notes) <= 2000),
  constraint business_documents_supplier_len check (char_length(supplier_name) <= 120),
  constraint business_documents_category_len check (char_length(category) <= 80),
  constraint business_documents_number_len check (char_length(document_number) <= 80)
);

create index if not exists business_documents_created_idx
  on public.business_documents (created_at desc);

create index if not exists business_documents_date_idx
  on public.business_documents (document_date desc nulls last);

create index if not exists business_documents_status_idx
  on public.business_documents (status);

create index if not exists business_documents_type_idx
  on public.business_documents (document_type);

create index if not exists business_documents_supplier_idx
  on public.business_documents (supplier_name);

comment on table public.business_documents is
  'Restaurant business documents (supplier invoices, receipts, expenses). Files live in private Storage bucket business-documents.';
comment on column public.business_documents.ocr_status is
  'Reserved for future OCR. Always none in v1.';
comment on column public.business_documents.ocr_raw is
  'Reserved for future OCR payload. Null in v1.';
comment on column public.business_documents.status is
  'draft = missing key fields (needs attention); saved = complete; archived = hidden from active lists.';

create or replace function public.business_documents_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;
    new.updated_at := now();
    if new.ocr_status is null or new.ocr_status = '' then
      new.ocr_status := 'none';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.storage_bucket is distinct from old.storage_bucket
     or new.storage_path is distinct from old.storage_path
     or new.mime_type is distinct from old.mime_type then
    raise exception 'file_fields_immutable' using errcode = '22023';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_business_documents_before_write on public.business_documents;
create trigger trg_business_documents_before_write
before insert or update on public.business_documents
for each row
execute function public.business_documents_before_write();

alter table public.business_documents enable row level security;
alter table public.business_documents force row level security;

revoke all on table public.business_documents from public, anon, authenticated;
grant select, insert, update on table public.business_documents to authenticated;
-- Delete row via delete_business_document RPC. File via Storage API.

drop policy if exists "business_documents_auth_select" on public.business_documents;
create policy "business_documents_auth_select"
on public.business_documents
for select
to authenticated
using (public.documents_vault_is_unlocked());

drop policy if exists "business_documents_auth_insert" on public.business_documents;
create policy "business_documents_auth_insert"
on public.business_documents
for insert
to authenticated
with check (
  public.documents_vault_is_unlocked()
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists "business_documents_auth_update" on public.business_documents;
create policy "business_documents_auth_update"
on public.business_documents
for update
to authenticated
using (public.documents_vault_is_unlocked())
with check (public.documents_vault_is_unlocked());

drop policy if exists "business_documents_auth_delete" on public.business_documents;
-- No direct DELETE policy. RPC only.

-- -----------------------------------------------------------------------------
-- 3) Vault-gated delete of the business_documents row.
-- Storage file is removed by the client via Storage API (not DELETE on storage.objects).
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 4) Private Storage bucket + RLS
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-documents',
  'business-documents',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

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

-- -----------------------------------------------------------------------------
-- 5) Realtime
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'business_documents'
  ) then
    execute 'alter publication supabase_realtime add table public.business_documents';
  end if;
end
$$;

notify pgrst, 'reload schema';
