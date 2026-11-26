-- Fix the internal transfer RETURN QUERY type mismatch: bank_accounts.currency
-- is a fixed-width character type while the function declares currency as text.
create or replace function private.transfer_funds(
  p_from_account_id uuid,
  p_recipient_account_number text,
  p_amount_minor bigint,
  p_description text default null,
  p_idempotency_key text default null
)
returns table(transaction_id uuid, reference text, status text, amount_minor bigint, currency text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_from public.bank_accounts%rowtype;
  v_to public.bank_accounts%rowtype;
  v_balance bigint;
  v_tx_id uuid;
  v_reference text;
  v_existing public.ledger_transactions%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_amount_minor is null or p_amount_minor<=0 then raise exception 'Transfer amount must be greater than zero.'; end if;
  if p_recipient_account_number is null or length(trim(p_recipient_account_number))<>10 then raise exception 'Enter a valid 10-digit Nexora account number.'; end if;
  if p_idempotency_key is not null and length(trim(p_idempotency_key)) not between 8 and 120 then raise exception 'Invalid idempotency key.'; end if;
  if not exists(select 1 from public.admin_customer_assignments a where a.customer_user_id=v_user_id)
     and not private.is_super_admin() then
    raise exception 'A customer administrator has not yet been assigned to your profile. Contact Nexora support before sending a transfer.';
  end if;
  if p_idempotency_key is not null then
    select * into v_existing from public.ledger_transactions t
    where t.initiated_by=v_user_id and t.idempotency_key=p_idempotency_key;
    if found then
      if v_existing.metadata->>'source_account_id'<>p_from_account_id::text
        or v_existing.metadata->>'destination_account_number'<>trim(p_recipient_account_number)
        or v_existing.metadata->>'amount_minor'<>p_amount_minor::text then
        raise exception 'This idempotency key was already used for a different transfer.';
      end if;
      return query select v_existing.id,v_existing.reference,
        case when coalesce((v_existing.metadata->>'review_required')::boolean,false) then 'review' else v_existing.status end,
        p_amount_minor,coalesce(v_existing.metadata->>'currency','USD');
      return;
    end if;
  end if;
  perform a.id from public.bank_accounts a
  where a.id=p_from_account_id or a.account_number=trim(p_recipient_account_number)
  order by a.id for update;
  select * into v_from from public.bank_accounts
  where id=p_from_account_id and user_id=v_user_id;
  if not found or v_from.status<>'active' or v_from.is_internal then
    raise exception 'Source account is not available for transfers.';
  end if;
  select * into v_to from public.bank_accounts where account_number=trim(p_recipient_account_number);
  if not found or v_to.status<>'active' or v_to.is_internal then
    raise exception 'Recipient account not found or unavailable.';
  end if;
  if v_to.id=v_from.id then raise exception 'You cannot transfer funds to the same account.'; end if;
  if v_to.currency<>v_from.currency then
    raise exception 'Transfers must use the same currency. Use currency conversion between your own accounts.';
  end if;
  select coalesce(sum(e.amount_minor),0) into v_balance
  from public.ledger_entries e join public.ledger_transactions t on t.id=e.transaction_id
  where e.account_id=v_from.id and t.status='posted';
  if v_balance<p_amount_minor then raise exception 'Insufficient funds.'; end if;
  v_reference:='NX'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  insert into public.ledger_transactions(reference,transaction_type,status,description,initiated_by,idempotency_key,metadata)
  values(v_reference,'transfer','pending',coalesce(nullif(trim(p_description),''),'Nexora transfer'),
    v_user_id,p_idempotency_key,
    jsonb_build_object('source_account_id',v_from.id,'source_account',v_from.account_number,
      'destination_account_number',v_to.account_number,'destination_account_id',v_to.id,
      'amount_minor',p_amount_minor,'currency',v_from.currency,'review_required',true,
      'approval_required','assigned_admin'))
  returning id into v_tx_id;
  insert into public.ledger_entries(transaction_id,account_id,amount_minor,currency)
  values(v_tx_id,v_from.id,-p_amount_minor,v_from.currency),(v_tx_id,v_to.id,p_amount_minor,v_from.currency);
  insert into public.notifications(user_id,title,body,category)
  select a.admin_user_id,'Transfer awaiting approval',
    'A customer transfer is waiting for your review. Open Security reviews to approve or reject it.','security'
  from public.admin_customer_assignments a where a.customer_user_id=v_user_id;
  insert into public.notifications(user_id,title,body,category)
  select u.id,'Transfer awaiting administrator approval',
    'A customer transfer is waiting for review. Open Security reviews to approve or reject it.','security'
  from auth.users u where coalesce(u.raw_app_meta_data->>'role','')='super_admin';
  insert into public.notifications(user_id,title,body,category)
  values(v_user_id,'Transfer submitted for approval',
    'Your transfer has been submitted. It will not affect either account balance until your assigned administrator approves it.','transactions');
  return query select v_tx_id,v_reference,'review'::text,p_amount_minor,v_from.currency::text;
end;
$function$;
