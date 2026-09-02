-- =============================================================================
-- LECHAIM — Customer support tickets (public form → admin inbox)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Isolated from orders / till / print / dine-in chat / reservations.
-- public_order_no is optional free text — no FK to orders.
--
-- After first run: Dashboard → Database → Publications → supabase_realtime
--   should include support_tickets (this file also adds it when possible).
-- =============================================================================

create extension if not exists pgcrypto;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null unique default gen_random_uuid(),
  status text not null default 'new'
    check (status in ('new', 'open', 'closed')),
  customer_name text not null,
  customer_phone text,
  customer_email text,
  public_order_no text,
  subject text not null,
  locale text not null default 'he',
  contact_preference text not null default 'whatsapp'
    check (contact_preference in ('whatsapp', 'email', 'whatsapp_email')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  last_message_at timestamptz,
  constraint support_tickets_name_len check (char_length(trim(customer_name)) between 2 and 80),
  constraint support_tickets_phone_len check (
    customer_phone is null or char_length(trim(customer_phone)) between 6 and 32
  ),
  constraint support_tickets_email_len check (
    customer_email is null or char_length(trim(customer_email)) between 3 and 120
  ),
  constraint support_tickets_order_len check (
    public_order_no is null or char_length(trim(public_order_no)) between 1 and 40
  ),
  constraint support_tickets_subject_len check (char_length(trim(subject)) between 2 and 120),
  constraint support_tickets_contact_required check (
    (contact_preference = 'whatsapp' and customer_phone is not null)
    or (contact_preference = 'email' and customer_email is not null)
    or (
      contact_preference = 'whatsapp_email'
      and customer_phone is not null
      and customer_email is not null
    )
  )
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null
    references public.support_tickets (id)
    on delete cascade,
  sender text not null
    check (sender in ('customer', 'staff')),
  body text not null
    check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_status_created_idx
  on public.support_tickets (status, created_at desc);

create index if not exists support_tickets_new_idx
  on public.support_tickets (created_at desc)
  where status = 'new';

create index if not exists support_messages_ticket_created_idx
  on public.support_messages (ticket_id, created_at);

comment on table public.support_tickets is
  'Customer-service tickets from support.html. public_token is for future guest thread access (phase 2). Not linked to orders.';

comment on table public.support_messages is
  'Support thread lines. sender = customer | staff. Opening message is written by create_support_ticket RPC.';

comment on column public.support_tickets.public_order_no is
  'Optional customer-typed order number. Not a foreign key.';

comment on column public.support_tickets.contact_preference is
  'How the customer asked us to reply: whatsapp | email | whatsapp_email.';

alter table public.support_tickets replica identity full;
alter table public.support_messages replica identity full;

-- -----------------------------------------------------------------------------
-- RLS — tighter than dine-in chat. Anon cannot SELECT tickets or messages.
-- -----------------------------------------------------------------------------
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

revoke all on table public.support_tickets from public, anon, authenticated;
revoke all on table public.support_messages from public, anon, authenticated;

grant select on table public.support_tickets to authenticated;
grant update (status, updated_at, closed_at) on table public.support_tickets to authenticated;
grant select, insert on table public.support_messages to authenticated;

drop policy if exists support_tickets_anon_select on public.support_tickets;
drop policy if exists support_tickets_anon_insert on public.support_tickets;
drop policy if exists support_tickets_anon_update on public.support_tickets;
drop policy if exists support_tickets_anon_delete on public.support_tickets;

drop policy if exists support_tickets_auth_select on public.support_tickets;
create policy support_tickets_auth_select
  on public.support_tickets
  for select
  to authenticated
  using (true);

drop policy if exists support_tickets_auth_update on public.support_tickets;
create policy support_tickets_auth_update
  on public.support_tickets
  for update
  to authenticated
  using (true)
  with check (
    status in ('new', 'open', 'closed')
  );

drop policy if exists support_messages_anon_select on public.support_messages;
drop policy if exists support_messages_anon_insert on public.support_messages;

drop policy if exists support_messages_auth_select on public.support_messages;
create policy support_messages_auth_select
  on public.support_messages
  for select
  to authenticated
  using (true);

drop policy if exists support_messages_auth_insert_staff on public.support_messages;
create policy support_messages_auth_insert_staff
  on public.support_messages
  for insert
  to authenticated
  with check (sender = 'staff');

-- -----------------------------------------------------------------------------
-- Public create: SECURITY DEFINER RPC only (no anon table SELECT/INSERT)
-- -----------------------------------------------------------------------------
drop function if exists public.create_support_ticket(text, text, text, text, text, text, text);

create or replace function public.create_support_ticket(
  p_name text,
  p_phone text default null,
  p_email text default null,
  p_order_no text default null,
  p_subject text default null,
  p_body text default null,
  p_locale text default 'he',
  p_contact_preference text default 'whatsapp'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_token uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  v_order text := nullif(trim(coalesce(p_order_no, '')), '');
  v_subject text := trim(coalesce(p_subject, ''));
  v_body text := trim(coalesce(p_body, ''));
  v_locale text := lower(trim(coalesce(p_locale, 'he')));
  v_pref text := lower(trim(coalesce(p_contact_preference, 'whatsapp')));
begin
  if v_pref not in ('whatsapp', 'email', 'whatsapp_email') then
    v_pref := 'whatsapp';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  if v_pref in ('whatsapp', 'whatsapp_email') then
    if v_phone is null
      or char_length(v_phone) < 6
      or char_length(v_phone) > 32 then
      raise exception 'invalid_phone' using errcode = '22023';
    end if;
  elsif v_phone is not null and (
    char_length(v_phone) < 6 or char_length(v_phone) > 32
  ) then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  if v_pref in ('email', 'whatsapp_email') then
    if v_email is null
      or char_length(v_email) > 120
      or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'invalid_email' using errcode = '22023';
    end if;
  elsif v_email is not null and (
    char_length(v_email) > 120
    or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ) then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  if v_order is not null and char_length(v_order) > 40 then
    raise exception 'invalid_order_no' using errcode = '22023';
  end if;
  if char_length(v_subject) < 2 or char_length(v_subject) > 120 then
    raise exception 'invalid_subject' using errcode = '22023';
  end if;
  if char_length(v_body) < 4 or char_length(v_body) > 4000 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;
  if v_locale not in ('he', 'en', 'el') then
    v_locale := 'he';
  end if;

  insert into public.support_tickets (
    customer_name,
    customer_phone,
    customer_email,
    public_order_no,
    subject,
    locale,
    contact_preference,
    status,
    last_message_at
  ) values (
    v_name,
    v_phone,
    v_email,
    v_order,
    v_subject,
    v_locale,
    v_pref,
    'new',
    now()
  )
  returning id, public_token into v_id, v_token;

  insert into public.support_messages (ticket_id, sender, body)
  values (v_id, 'customer', v_body);

  return jsonb_build_object('ok', true, 'public_token', v_token);
end;
$$;

revoke all on function public.create_support_ticket(text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_support_ticket(text, text, text, text, text, text, text, text)
  to anon, authenticated;

comment on function public.create_support_ticket(text, text, text, text, text, text, text, text) is
  'Public support form. Phone required for WhatsApp preference, email required for email preference.';

create or replace function public.touch_support_ticket_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_tickets
  set
    last_message_at = new.created_at,
    updated_at = now()
  where id = new.ticket_id;
  return new;
end;
$$;

drop trigger if exists trg_support_message_touch on public.support_messages;
create trigger trg_support_message_touch
  after insert on public.support_messages
  for each row
  execute function public.touch_support_ticket_on_message();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_tickets'
  ) then
    execute 'alter publication supabase_realtime add table public.support_tickets';
  end if;
end
$$;

notify pgrst, 'reload schema';
