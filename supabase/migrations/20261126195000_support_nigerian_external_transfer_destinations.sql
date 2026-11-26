-- Allow Nigerian external-transfer beneficiaries to use a 10-digit NUBAN
-- account number instead of an IBAN. Other destination validation is unchanged.
create or replace function public.submit_external_transfer_request(
  p_source_account_id uuid,
  p_amount_minor bigint,
  p_destination_country text,
  p_bank_name text,
  p_beneficiary_name text,
  p_account_number text default null,
  p_routing_number text default null,
  p_sort_code text default null,
  p_iban text default null,
  p_bic text default null,
  p_pin text default null,
  p_otp_challenge_id uuid default null,
  p_otp_code text default null
)
returns table(request_id uuid, reference text, status text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_user uuid := auth.uid();
  v_account public.bank_accounts%rowtype;
  v_balance bigint;
  v_request public.external_transfer_requests%rowtype;
  v_session_id uuid := nullif(auth.jwt()->>'session_id','')::uuid;
  v_fingerprint text;
  v_device_trusted boolean;
  v_pin_locked boolean := false;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not private.check_transaction_pin(v_user,p_pin) then
    select coalesce(locked_until > now(),false) into v_pin_locked
    from public.transaction_pins where user_id=v_user;
    return query select null::uuid,null::text,
      case when v_pin_locked then 'pin_locked' else 'pin_invalid' end;
    return;
  end if;
  select s.device_fingerprint,d.is_trusted into v_fingerprint,v_device_trusted
  from public.user_sessions s
  join public.trusted_devices d on d.user_id=s.user_id and d.fingerprint=s.device_fingerprint
  where s.user_id=v_user and s.auth_session_id=v_session_id
    and s.revoked_at is null and d.is_blocked=false
  limit 1;
  if not found then raise exception 'This device session is blocked or could not be verified.'; end if;
  if p_amount_minor is null or p_amount_minor<=0 then raise exception 'Enter a valid amount.'; end if;
  if p_destination_country !~ '^[A-Z]{2}$' then raise exception 'Choose a valid destination country.'; end if;
  if length(trim(coalesce(p_bank_name,''))) not between 2 and 120 then raise exception 'Enter a valid recipient bank name.'; end if;
  if length(trim(coalesce(p_beneficiary_name,''))) not between 2 and 120 then raise exception 'Enter the recipient account-holder name.'; end if;
  select * into v_account from public.bank_accounts
  where id=p_source_account_id and user_id=v_user and is_internal=false for update;
  if not found or v_account.status<>'active' then
    raise exception 'SOURCE_ACCOUNT_INVALID: Select an active Nexora source account.';
  end if;
  if v_account.currency<>'USD' then
    raise exception 'International transfer requests currently require a USD source account.';
  end if;
  select coalesce(sum(e.amount_minor),0)::bigint into v_balance
  from public.ledger_entries e join public.ledger_transactions t on t.id=e.transaction_id
  where e.account_id=v_account.id and t.status='posted';
  if v_balance<p_amount_minor then raise exception 'Available balance is insufficient for this transfer request.'; end if;
  if p_destination_country='US' and
    (coalesce(p_routing_number,'') !~ '^[0-9]{9}$' or coalesce(p_account_number,'') !~ '^[0-9]{4,17}$') then
    raise exception 'Enter a valid US routing number and account number.';
  elsif p_destination_country='GB' and
    (coalesce(p_sort_code,'') !~ '^[0-9]{6}$' or coalesce(p_account_number,'') !~ '^[0-9]{8}$') then
    raise exception 'Enter a valid UK sort code and account number.';
  elsif p_destination_country='NG' and coalesce(p_account_number,'') !~ '^[0-9]{10}$' then
    raise exception 'Enter a valid 10-digit Nigerian NUBAN account number.';
  elsif p_destination_country not in ('US','GB','NG') and length(trim(coalesce(p_iban,'')))<15 then
    raise exception 'Enter the recipient IBAN.';
  end if;
  insert into public.external_transfer_requests(
    user_id,source_account_id,amount_minor,currency,destination_country,
    bank_name,beneficiary_name,account_number,routing_number,sort_code,iban,bic
  ) values(
    v_user,v_account.id,p_amount_minor,v_account.currency,p_destination_country,
    trim(p_bank_name),trim(p_beneficiary_name),nullif(trim(coalesce(p_account_number,'')),''),
    nullif(trim(coalesce(p_routing_number,'')),''),
    nullif(trim(coalesce(p_sort_code,'')),''),
    nullif(upper(regexp_replace(coalesce(p_iban,''),'\\s','','g')),''),
    nullif(upper(trim(coalesce(p_bic,''))),'')
  ) returning * into v_request;
  insert into public.notifications(user_id,title,body,category)
  values(v_user,'Transfer submitted','Your international transfer request has been submitted for review.','transactions');
  return query select v_request.id,v_request.reference,v_request.status;
end;
$function$;
revoke all on function public.submit_external_transfer_request(uuid,bigint,text,text,text,text,text,text,text,text,text,uuid,text) from public,anon;
grant execute on function public.submit_external_transfer_request(uuid,bigint,text,text,text,text,text,text,text,text,text,uuid,text) to authenticated;
