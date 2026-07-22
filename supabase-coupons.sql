-- =============================================================================
-- LECHAIM — Coupons (additive migration)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) coupons catalog
-- -----------------------------------------------------------------------------
create table if not exists public.coupons (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null,
  discount_percent   numeric(5, 2) not null
                     check (discount_percent > 0 and discount_percent <= 100),
  active             boolean not null default true,
  valid_from         timestamptz null,
  valid_until        timestamptz null,
  max_uses           integer null
                     check (max_uses is null or max_uses > 0),
  used_count         integer not null default 0
                     check (used_count >= 0),
  notes              text null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint coupons_code_nonempty check (length(trim(code)) > 0)
);

-- Case-insensitive unique code
create unique index if not exists coupons_code_unique_ci
  on public.coupons (lower(trim(code)));

create index if not exists coupons_active_idx
  on public.coupons (active)
  where active = true;

comment on table public.coupons is
  'Discount codes validated by customers at bill request. Manage in Supabase — do not hardcode in the website.';

-- Seed first coupon (5%)
insert into public.coupons (code, discount_percent, active, notes)
select 'Lechaimisra339', 5, true, 'Launch coupon 5%'
where not exists (
  select 1 from public.coupons where lower(trim(code)) = lower('Lechaimisra339')
);

-- -----------------------------------------------------------------------------
-- 2) Session-level discount fields (applied at bill request)
-- -----------------------------------------------------------------------------
alter table public.order_sessions
  add column if not exists coupon_code text null;

alter table public.order_sessions
  add column if not exists discount_percent numeric(5, 2) null
  check (discount_percent is null or (discount_percent > 0 and discount_percent <= 100));

alter table public.order_sessions
  add column if not exists discount_amount numeric(10, 2) null
  check (discount_amount is null or discount_amount >= 0);

alter table public.order_sessions
  add column if not exists subtotal numeric(10, 2) null
  check (subtotal is null or subtotal >= 0);

comment on column public.order_sessions.coupon_code is
  'Coupon applied when customer requested the bill.';
comment on column public.order_sessions.discount_percent is
  'Percent discount from the coupon at bill time.';
comment on column public.order_sessions.discount_amount is
  'Absolute discount amount (currency) at bill time.';
comment on column public.order_sessions.subtotal is
  'Session total before discount at bill time.';

-- -----------------------------------------------------------------------------
-- 3) Secure validation RPC (anon cannot list all coupon codes)
-- -----------------------------------------------------------------------------
alter table public.coupons enable row level security;

drop policy if exists "coupons_no_direct_select" on public.coupons;
-- No direct SELECT/INSERT/UPDATE/DELETE for anon/authenticated via table.
-- Admins can manage via service role / Table Editor (bypasses RLS) or later auth policies.

drop policy if exists "coupons_auth_select" on public.coupons;
create policy "coupons_auth_select"
on public.coupons
for select
to authenticated
using (true);

drop policy if exists "coupons_auth_write" on public.coupons;
create policy "coupons_auth_write"
on public.coupons
for all
to authenticated
using (true)
with check (true);

create or replace function public.validate_coupon(p_code text)
returns table (
  code text,
  discount_percent numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
begin
  normalized := lower(trim(coalesce(p_code, '')));
  if normalized = '' then
    return;
  end if;

  return query
  select c.code::text, c.discount_percent
  from public.coupons c
  where lower(trim(c.code)) = normalized
    and c.active = true
    and (c.valid_from is null or c.valid_from <= now())
    and (c.valid_until is null or c.valid_until >= now())
    and (c.max_uses is null or c.used_count < c.max_uses)
  limit 1;
end;
$$;

revoke all on function public.validate_coupon(text) from public;
grant execute on function public.validate_coupon(text) to anon, authenticated;

create or replace function public.increment_coupon_use(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.coupons
  set used_count = used_count + 1,
      updated_at = now()
  where lower(trim(code)) = lower(trim(coalesce(p_code, '')))
    and active = true;
end;
$$;

revoke all on function public.increment_coupon_use(text) from public;
grant execute on function public.increment_coupon_use(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4) Verify
-- -----------------------------------------------------------------------------
select code, discount_percent, active, used_count
from public.coupons
order by created_at;
