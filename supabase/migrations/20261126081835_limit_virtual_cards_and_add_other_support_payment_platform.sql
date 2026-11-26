alter table public.support_payment_procedures
  add column if not exists platform_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.support_payment_procedures'::regclass
      and conname='support_payment_procedures_platform_name_check'
  ) then
    alter table public.support_payment_procedures
      add constraint support_payment_procedures_platform_name_check
      check (platform_name is null or (length(trim(platform_name)) between 2 and 80));
  end if;
end $$;

create unique index if not exists virtual_cards_one_per_customer_idx
  on public.virtual_cards(user_id);

create or replace function private.create_virtual_card(p_account_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_user uuid := auth.uid();
  v_account public.bank_accounts%rowtype;
  v_card_id uuid;
  v_name text;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select * into v_account
  from public.bank_accounts
  where id=p_account_id and user_id=v_user and is_internal=false;
  if not found or v_account.status <> 'active' then
    raise exception 'An active customer account is required.';
  end if;
  if exists (select 1 from public.virtual_cards where user_id=v_user) then
    raise exception 'You can have only one virtual card.';
  end if;
  select coalesce(
    nullif(trim(p.display_name),''),
    nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
    'NEXORA CUSTOMER'
  )
  into v_name
  from public.profiles p
  where p.user_id=v_user;
  insert into public.virtual_cards(
    user_id,account_id,cardholder_name,network,last4,
    expiry_month,expiry_year,status
  )
  values(
    v_user,p_account_id,upper(v_name),'visa',
    lpad((floor(random()*10000))::integer::text,4,'0'),
    extract(month from now())::integer,
    extract(year from now())::integer+4,'active'
  )
  returning id into v_card_id;
  return v_card_id;
end;
$function$;

create or replace function private.create_support_payment_procedure(
  p_conversation_id uuid,
  p_cryptocurrency text,
  p_network text,
  p_wallet_address text,
  p_expected_amount numeric,
  p_amount_currency text,
  p_purpose text,
  p_platform_name text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_customer uuid;
  v_role text := coalesce(auth.jwt()->'app_metadata'->>'role','');
  v_id uuid;
  v_reference text;
  v_body text;
  v_platform text := nullif(trim(p_platform_name),'');
begin
  if v_actor is null or v_role not in ('admin','super_admin') then
    raise exception 'Only staff administrators can issue payment procedures.';
  end if;
  if p_conversation_id is null
     or nullif(trim(p_cryptocurrency),'') is null
     or nullif(trim(p_network),'') is null
     or nullif(trim(p_wallet_address),'') is null
     or p_expected_amount is null or p_expected_amount <= 0
     or nullif(trim(p_amount_currency),'') is null
     or length(trim(p_purpose)) < 3 or length(trim(p_purpose)) > 500 then
    raise exception 'Complete all payment procedure fields with a valid positive amount.';
  end if;
  if upper(trim(p_cryptocurrency)) = 'OTHER' then
    if v_platform is null or length(v_platform) < 2 or length(v_platform) > 80
       or upper(trim(p_network)) <> 'MANUAL'
       or length(trim(p_amount_currency)) < 2 or length(trim(p_amount_currency)) > 12 then
      raise exception 'For Other payment methods, enter the platform/software name and asset or currency.';
    end if;
  elsif upper(trim(p_cryptocurrency)) not in ('USDT','BTC') then
    raise exception 'Choose a supported payment method.';
  end if;

  select c.user_id into v_customer
  from public.support_conversations c
  where c.id = p_conversation_id
  for update;
  if v_customer is null then raise exception 'Support conversation not found.'; end if;
  if not private.can_access_customer(v_customer) then
    raise exception 'You are not assigned to this customer.';
  end if;
  if v_role = 'admin' and not exists (
    select 1 from public.admin_customer_assignments a
    where a.admin_user_id = v_actor and a.customer_user_id = v_customer
  ) then raise exception 'You are not assigned to this customer.'; end if;

  v_id := gen_random_uuid();
  v_reference := 'NX-' || upper(substr(replace(v_id::text,'-',''),1,12));
  insert into public.support_payment_procedures(
    id, conversation_id, customer_user_id, created_by, cryptocurrency,
    network, wallet_address, expected_amount, amount_currency,
    payment_reference, purpose, platform_name
  ) values (
    v_id, p_conversation_id, v_customer, v_actor, upper(trim(p_cryptocurrency)),
    upper(trim(p_network)), trim(p_wallet_address), p_expected_amount,
    upper(trim(p_amount_currency)), v_reference, trim(p_purpose), v_platform
  );

  if upper(trim(p_cryptocurrency)) = 'OTHER' then
    v_body := 'PAYMENT INSTRUCTION' || E'\n\n'
      || 'This payment instruction was issued by Nexora Support. Review the details carefully before making any payment.' || E'\n'
      || 'Security notice: Never share your password, one-time codes, private keys or recovery phrase with anyone.' || E'\n\n'
      || 'Payment method: Other' || E'\n'
      || 'Platform / software: ' || v_platform || E'\n'
      || 'Asset / currency: ' || upper(trim(p_amount_currency)) || E'\n'
      || 'Payment destination / details: ' || trim(p_wallet_address) || E'\n'
      || 'Expected amount: ' || p_expected_amount::text || ' ' || upper(trim(p_amount_currency)) || E'\n'
      || 'Reference: ' || v_reference || E'\n'
      || 'Purpose: ' || trim(p_purpose) || E'\n\n'
      || 'Status: Awaiting payment.' || E'\n'
      || 'Please confirm that you have read and understood these payment details. Do not send funds if any detail is incorrect.';
  else
    v_body := 'AUTOMATED PAYMENT PROCEDURE' || E'\n\n'
      || 'This payment procedure was issued by Nexora Support. Review the details carefully before making any payment.' || E'\n'
      || 'Security notice: Never share your password, one-time codes, private keys or recovery phrase with anyone.' || E'\n\n'
      || 'Cryptocurrency: ' || upper(trim(p_cryptocurrency)) || E'\n'
      || 'Network: ' || trim(p_network) || E'\n'
      || 'Receiving address: ' || trim(p_wallet_address) || E'\n'
      || 'Expected amount: ' || p_expected_amount::text || ' ' || upper(trim(p_amount_currency)) || E'\n'
      || 'Reference: ' || v_reference || E'\n'
      || 'Purpose: ' || trim(p_purpose) || E'\n\n'
      || 'Status: Awaiting payment.' || E'\n'
      || 'Please confirm that you have read and understood these payment details. Do not send funds if any detail is incorrect.';
  end if;

  insert into public.support_messages(conversation_id,sender_user_id,sender_role,body)
  values (p_conversation_id, null, 'system', v_body);
  insert into public.support_payment_procedure_audit(
    procedure_id,actor_user_id,actor_role,action,details
  ) values (
    v_id,v_actor,v_role,'issued',jsonb_build_object(
      'conversation_id',p_conversation_id,'customer_user_id',v_customer,
      'cryptocurrency',upper(trim(p_cryptocurrency)),'network',upper(trim(p_network)),
      'platform_name',v_platform,'wallet_address',trim(p_wallet_address),
      'expected_amount',p_expected_amount,'amount_currency',upper(trim(p_amount_currency)),
      'payment_reference',v_reference,'purpose',trim(p_purpose),'bot_message',v_body
    )
  );
  update public.support_conversations
  set updated_at=now(), status='waiting_customer'
  where id=p_conversation_id;
  return v_id;
end;
$function$;

create or replace function public.create_support_payment_procedure(
  p_conversation_id uuid,
  p_cryptocurrency text,
  p_network text,
  p_wallet_address text,
  p_expected_amount numeric,
  p_amount_currency text,
  p_purpose text,
  p_platform_name text
)
returns uuid
language sql
set search_path to ''
as $function$
  select private.create_support_payment_procedure(
    p_conversation_id,p_cryptocurrency,p_network,p_wallet_address,
    p_expected_amount,p_amount_currency,p_purpose,p_platform_name
  );
$function$;

revoke all on function private.create_support_payment_procedure(uuid,text,text,text,numeric,text,text,text) from public, anon;
grant execute on function private.create_support_payment_procedure(uuid,text,text,text,numeric,text,text,text) to authenticated;
revoke all on function public.create_support_payment_procedure(uuid,text,text,text,numeric,text,text,text) from public, anon;
grant execute on function public.create_support_payment_procedure(uuid,text,text,text,numeric,text,text,text) to authenticated;
