-- =============================================================================
-- LECHAIM — Support tickets: contact preference (WhatsApp / Email)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run. Does not touch orders / till / print / reservations.
--
-- After this RPC, the public form sends p_contact_preference.
-- Existing tickets get contact_preference = 'whatsapp'.
-- =============================================================================

alter table public.support_tickets
  add column if not exists contact_preference text not null default 'whatsapp';

alter table public.support_tickets
  drop constraint if exists support_tickets_contact_preference_check;
alter table public.support_tickets
  add constraint support_tickets_contact_preference_check
  check (contact_preference in ('whatsapp', 'email', 'whatsapp_email'));

alter table public.support_tickets
  alter column customer_phone drop not null;

alter table public.support_tickets
  drop constraint if exists support_tickets_phone_len;
alter table public.support_tickets
  add constraint support_tickets_phone_len
  check (
    customer_phone is null
    or char_length(trim(customer_phone)) between 6 and 32
  );

alter table public.support_tickets
  drop constraint if exists support_tickets_contact_required;
alter table public.support_tickets
  add constraint support_tickets_contact_required
  check (
    (contact_preference = 'whatsapp' and customer_phone is not null)
    or (contact_preference = 'email' and customer_email is not null)
    or (
      contact_preference = 'whatsapp_email'
      and customer_phone is not null
      and customer_email is not null
    )
  );

comment on column public.support_tickets.contact_preference is
  'How the customer asked us to reply: whatsapp | email | whatsapp_email.';

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

notify pgrst, 'reload schema';
