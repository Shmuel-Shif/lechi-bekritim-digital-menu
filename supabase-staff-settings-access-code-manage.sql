-- =============================================================================
-- LECHAIM — Unified admin access code (staff + documents/sales)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Enable/disable toggles a gate; the secret code is set once and kept.
-- Enable with an existing secret only VERIFIES the code (does not replace it).
-- Disable turns the gate off and keeps the hash.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Staff helpers
-- -----------------------------------------------------------------------------
create or replace function public.staff_settings_code_is_set()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_settings_secrets s
    where s.id = 1
      and length(coalesce(s.code_hash, '')) > 0
  );
$$;

revoke all on function public.staff_settings_code_is_set() from public, anon;
grant execute on function public.staff_settings_code_is_set() to authenticated;

create or replace function public.staff_settings_is_unlocked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and (
       not public.staff_settings_code_is_set()
       or exists (
         select 1
         from public.staff_settings_unlocks u
         where u.user_id = auth.uid()
       )
     );
$$;

revoke all on function public.staff_settings_is_unlocked() from public;
grant execute on function public.staff_settings_is_unlocked() to authenticated;

create or replace function public.staff_settings_unlock(p_code text)
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

  select s.code_hash into v_hash
  from public.staff_settings_secrets s
  where s.id = 1
  limit 1;

  if v_hash is null then
    return jsonb_build_object('ok', true, 'code_not_required', true);
  end if;

  if p_code is null or length(trim(p_code)) < 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  if extensions.crypt(trim(p_code), v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  insert into public.staff_settings_unlocks (user_id, unlocked_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set unlocked_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.staff_settings_unlock(text) from public;
grant execute on function public.staff_settings_unlock(text) to authenticated;

create or replace function public.staff_settings_verify_code(p_code text)
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

  select s.code_hash into v_hash
  from public.staff_settings_secrets s
  where s.id = 1
  limit 1;

  if v_hash is null then
    return jsonb_build_object('ok', true, 'code_not_required', true);
  end if;

  if p_code is null or length(trim(p_code)) < 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  if extensions.crypt(trim(p_code), v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.staff_settings_verify_code(text) from public, anon;
grant execute on function public.staff_settings_verify_code(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Documents vault helpers (sales totals use the same vault)
-- -----------------------------------------------------------------------------
create or replace function public.documents_vault_code_is_set()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.documents_vault_secrets s
    where s.id = 1
      and length(coalesce(s.code_hash, '')) > 0
  );
$$;

revoke all on function public.documents_vault_code_is_set() from public, anon;
grant execute on function public.documents_vault_code_is_set() to authenticated;

create or replace function public.documents_vault_is_unlocked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and (
       not public.documents_vault_code_is_set()
       or exists (
         select 1
         from public.documents_vault_unlocks u
         where u.user_id = auth.uid()
       )
     );
$$;

revoke all on function public.documents_vault_is_unlocked() from public, anon;
grant execute on function public.documents_vault_is_unlocked() to authenticated;

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

  select s.code_hash into v_hash
  from public.documents_vault_secrets s
  where s.id = 1
  limit 1;

  if v_hash is null then
    return jsonb_build_object('ok', true, 'code_not_required', true);
  end if;

  if p_code is null or length(trim(p_code)) < 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
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

  select s.code_hash into v_hash
  from public.documents_vault_secrets s
  where s.id = 1
  limit 1;

  if v_hash is null then
    return jsonb_build_object('ok', true, 'code_not_required', true);
  end if;

  if p_code is null or length(trim(p_code)) < 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
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

  delete from public.documents_vault_unlocks where user_id is not null;
end;
$$;

revoke all on function public.documents_vault_set_code(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Gate on/off — code hash stays fixed; enable only verifies existing code
-- -----------------------------------------------------------------------------
create table if not exists public.admin_access_gate (
  id          integer primary key default 1 check (id = 1),
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now()
);

alter table public.admin_access_gate enable row level security;
alter table public.admin_access_gate force row level security;
revoke all on table public.admin_access_gate from public, anon, authenticated;

insert into public.admin_access_gate (id, enabled, updated_at)
values (
  1,
  exists (
    select 1 from public.staff_settings_secrets s where s.id = 1
  ) or exists (
    select 1 from public.documents_vault_secrets s where s.id = 1
  ),
  now()
)
on conflict (id) do nothing;

create or replace function public.admin_access_gate_is_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select g.enabled
    from public.admin_access_gate g
    where g.id = 1
  ), false);
$$;

revoke all on function public.admin_access_gate_is_enabled() from public, anon;
grant execute on function public.admin_access_gate_is_enabled() to authenticated;

create or replace function public.admin_access_code_has_secret()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.staff_settings_code_is_set()
      or public.documents_vault_code_is_set();
$$;

revoke all on function public.admin_access_code_has_secret() from public, anon;
grant execute on function public.admin_access_code_has_secret() to authenticated;

-- UI "פעיל" = gate is on (not merely that a hash exists)
create or replace function public.admin_access_code_is_set()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.admin_access_gate_is_enabled();
$$;

revoke all on function public.admin_access_code_is_set() from public, anon;
grant execute on function public.admin_access_code_is_set() to authenticated;

create or replace function public.staff_settings_is_unlocked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and (
       not public.admin_access_gate_is_enabled()
       or exists (
         select 1
         from public.staff_settings_unlocks u
         where u.user_id = auth.uid()
       )
     );
$$;

revoke all on function public.staff_settings_is_unlocked() from public;
grant execute on function public.staff_settings_is_unlocked() to authenticated;

create or replace function public.documents_vault_is_unlocked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and (
       not public.admin_access_gate_is_enabled()
       or exists (
         select 1
         from public.documents_vault_unlocks u
         where u.user_id = auth.uid()
       )
     );
$$;

revoke all on function public.documents_vault_is_unlocked() from public, anon;
grant execute on function public.documents_vault_is_unlocked() to authenticated;

create or replace function public.staff_settings_unlock(p_code text)
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

  if not public.admin_access_gate_is_enabled() then
    return jsonb_build_object('ok', true, 'code_not_required', true);
  end if;

  select s.code_hash into v_hash
  from public.staff_settings_secrets s
  where s.id = 1
  limit 1;

  if v_hash is null then
    return jsonb_build_object('ok', true, 'code_not_required', true);
  end if;

  if p_code is null or length(trim(p_code)) < 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  if extensions.crypt(trim(p_code), v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  insert into public.staff_settings_unlocks (user_id, unlocked_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set unlocked_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.staff_settings_unlock(text) from public;
grant execute on function public.staff_settings_unlock(text) to authenticated;

create or replace function public.staff_settings_verify_code(p_code text)
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

  if not public.admin_access_gate_is_enabled() then
    return jsonb_build_object('ok', true, 'code_not_required', true);
  end if;

  select s.code_hash into v_hash
  from public.staff_settings_secrets s
  where s.id = 1
  limit 1;

  if v_hash is null then
    return jsonb_build_object('ok', true, 'code_not_required', true);
  end if;

  if p_code is null or length(trim(p_code)) < 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  if extensions.crypt(trim(p_code), v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.staff_settings_verify_code(text) from public, anon;
grant execute on function public.staff_settings_verify_code(text) to authenticated;

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

  if not public.admin_access_gate_is_enabled() then
    return jsonb_build_object('ok', true, 'code_not_required', true);
  end if;

  select s.code_hash into v_hash
  from public.documents_vault_secrets s
  where s.id = 1
  limit 1;

  if v_hash is null then
    return jsonb_build_object('ok', true, 'code_not_required', true);
  end if;

  if p_code is null or length(trim(p_code)) < 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
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

  if not public.admin_access_gate_is_enabled() then
    return jsonb_build_object('ok', true, 'code_not_required', true);
  end if;

  select s.code_hash into v_hash
  from public.documents_vault_secrets s
  where s.id = 1
  limit 1;

  if v_hash is null then
    return jsonb_build_object('ok', true, 'code_not_required', true);
  end if;

  if p_code is null or length(trim(p_code)) < 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  if extensions.crypt(trim(p_code), v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.documents_vault_verify(text) from public, anon;
grant execute on function public.documents_vault_verify(text) to authenticated;

-- Enable gate: if secret exists → verify only (do NOT replace hash).
-- First time only → store the code once in both vaults.
create or replace function public.staff_settings_manage_set_code(
  p_new_code text,
  p_current_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff_hash text;
  v_docs_hash text;
  v_code text;
  v_ok boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_code := trim(coalesce(p_new_code, ''));
  if length(v_code) < 4 then
    return jsonb_build_object('ok', false, 'error', 'code_too_short');
  end if;
  if length(v_code) > 64 then
    return jsonb_build_object('ok', false, 'error', 'code_too_long');
  end if;

  select s.code_hash into v_staff_hash
  from public.staff_settings_secrets s
  where s.id = 1
  limit 1;

  select s.code_hash into v_docs_hash
  from public.documents_vault_secrets s
  where s.id = 1
  limit 1;

  if v_staff_hash is not null or v_docs_hash is not null then
    if v_staff_hash is not null and extensions.crypt(v_code, v_staff_hash) = v_staff_hash then
      v_ok := true;
    end if;
    if v_docs_hash is not null and extensions.crypt(v_code, v_docs_hash) = v_docs_hash then
      v_ok := true;
    end if;
    if not v_ok then
      return jsonb_build_object('ok', false, 'error', 'invalid_current_code');
    end if;
  else
    insert into public.staff_settings_secrets (id, code_hash, updated_at)
    values (1, extensions.crypt(v_code, extensions.gen_salt('bf')), now())
    on conflict (id) do update
      set code_hash = excluded.code_hash,
          updated_at = now();

    insert into public.documents_vault_secrets (id, code_hash, updated_at)
    values (1, extensions.crypt(v_code, extensions.gen_salt('bf')), now())
    on conflict (id) do update
      set code_hash = excluded.code_hash,
          updated_at = now();
  end if;

  insert into public.admin_access_gate (id, enabled, updated_at)
  values (1, true, now())
  on conflict (id) do update
    set enabled = true,
        updated_at = now();

  delete from public.staff_settings_unlocks where user_id is not null;
  delete from public.documents_vault_unlocks where user_id is not null;

  insert into public.staff_settings_unlocks (user_id, unlocked_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set unlocked_at = now();

  insert into public.documents_vault_unlocks (user_id, unlocked_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set unlocked_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.staff_settings_manage_set_code(text, text) from public, anon;
grant execute on function public.staff_settings_manage_set_code(text, text) to authenticated;

-- Disable gate: verify existing code, keep hash, turn gate off
create or replace function public.staff_settings_manage_clear_code(p_current_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff_hash text;
  v_docs_hash text;
  v_cur text;
  v_ok boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not public.admin_access_gate_is_enabled() then
    return jsonb_build_object('ok', true, 'already_cleared', true);
  end if;

  v_cur := trim(coalesce(p_current_code, ''));

  select s.code_hash into v_staff_hash
  from public.staff_settings_secrets s
  where s.id = 1
  limit 1;

  select s.code_hash into v_docs_hash
  from public.documents_vault_secrets s
  where s.id = 1
  limit 1;

  if v_staff_hash is null and v_docs_hash is null then
    insert into public.admin_access_gate (id, enabled, updated_at)
    values (1, false, now())
    on conflict (id) do update
      set enabled = false,
          updated_at = now();
    return jsonb_build_object('ok', true, 'already_cleared', true);
  end if;

  if length(v_cur) < 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_current_code');
  end if;

  if v_staff_hash is not null and extensions.crypt(v_cur, v_staff_hash) = v_staff_hash then
    v_ok := true;
  end if;
  if v_docs_hash is not null and extensions.crypt(v_cur, v_docs_hash) = v_docs_hash then
    v_ok := true;
  end if;
  if not v_ok then
    return jsonb_build_object('ok', false, 'error', 'invalid_current_code');
  end if;

  insert into public.admin_access_gate (id, enabled, updated_at)
  values (1, false, now())
  on conflict (id) do update
    set enabled = false,
        updated_at = now();

  delete from public.staff_settings_unlocks where user_id is not null;
  delete from public.documents_vault_unlocks where user_id is not null;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.staff_settings_manage_clear_code(text) from public, anon;
grant execute on function public.staff_settings_manage_clear_code(text) to authenticated;

create or replace function public.staff_settings_set_code(p_code text)
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

  insert into public.staff_settings_secrets (id, code_hash, updated_at)
  values (1, extensions.crypt(trim(p_code), extensions.gen_salt('bf')), now())
  on conflict (id) do update
    set code_hash = excluded.code_hash,
        updated_at = now();

  insert into public.documents_vault_secrets (id, code_hash, updated_at)
  values (1, extensions.crypt(trim(p_code), extensions.gen_salt('bf')), now())
  on conflict (id) do update
    set code_hash = excluded.code_hash,
        updated_at = now();

  insert into public.admin_access_gate (id, enabled, updated_at)
  values (1, true, now())
  on conflict (id) do update
    set enabled = true,
        updated_at = now();

  delete from public.staff_settings_unlocks where user_id is not null;
  delete from public.documents_vault_unlocks where user_id is not null;
end;
$$;

revoke all on function public.staff_settings_set_code(text) from public, anon, authenticated;
