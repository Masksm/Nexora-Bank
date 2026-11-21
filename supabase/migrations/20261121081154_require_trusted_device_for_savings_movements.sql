-- Savings goal movements must use a session that has passed Nexora device trust checks.
create or replace function private.move_savings_goal_funds(
  p_goal_id uuid,p_account_id uuid,p_amount_minor bigint,p_direction text,p_idempotency_key text
)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,private as $function$
declare
  v_user_id uuid:=auth.uid(); v_session_id uuid:=nullif(auth.jwt()->>'session_id','')::uuid; v_device_trusted boolean:=false;
  v_goal public.savings_goals%rowtype; v_account public.bank_accounts%rowtype; v_custody public.bank_accounts%rowtype;
  v_balance bigint; v_goal_balance bigint; v_tx_id uuid; v_reference text; v_existing public.ledger_transactions%rowtype;
  v_tx_type text; v_source uuid; v_destination uuid; v_entry_amount bigint;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  if p_amount_minor is null or p_amount_minor<=0 or p_amount_minor>100000000000 then raise exception 'Enter a valid amount.'; end if;
  if coalesce(p_direction,'') not in ('contribution','withdrawal') then raise exception 'Invalid savings operation.'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 120 then raise exception 'A valid request key is required.'; end if;

  select coalesce(s.device_trusted,false) into v_device_trusted from public.user_sessions s
  where s.auth_session_id=v_session_id and s.user_id=v_user_id and s.revoked_at is null order by s.created_at desc limit 1;
  if not coalesce(v_device_trusted,false) then
    raise exception 'Savings transfers require a trusted device. Complete device verification or contact customer care.';
  end if;

  select * into v_existing from public.ledger_transactions where initiated_by=v_user_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.metadata->>'savings_goal_id'<>p_goal_id::text or v_existing.metadata->>'account_id'<>p_account_id::text
      or v_existing.metadata->>'amount_minor'<>p_amount_minor::text or v_existing.metadata->>'direction'<>p_direction then
      raise exception 'This request key was already used for a different savings operation.';
    end if;
    return v_existing.id;
  end if;

  select * into v_goal from public.savings_goals where id=p_goal_id and user_id=v_user_id for update;
  if not found then raise exception 'Savings goal not found.'; end if;
  select * into v_account from public.bank_accounts where id=p_account_id and user_id=v_user_id and is_internal=false for update;
  if not found or v_account.status<>'active' then raise exception 'Choose one of your active accounts.'; end if;
  select * into v_custody from public.bank_accounts where is_internal=true and account_name='Nexora Savings Custody' and status='active' for update;
  if not found then raise exception 'Savings service is temporarily unavailable.'; end if;

  select coalesce(sum(amount_minor),0)::bigint into v_goal_balance from public.savings_goal_entries where goal_id=p_goal_id and user_id=v_user_id;
  select coalesce(sum(e.amount_minor),0)::bigint into v_balance from public.ledger_entries e join public.ledger_transactions t on t.id=e.transaction_id
  where e.account_id=case when p_direction='contribution' then v_account.id else v_custody.id end and t.status='posted';

  if p_direction='contribution' then
    if v_goal.status<>'active' then raise exception 'This savings goal is already complete.'; end if;
    if v_balance<p_amount_minor then raise exception 'Insufficient available balance.'; end if;
    v_source:=v_account.id; v_destination:=v_custody.id; v_entry_amount:=p_amount_minor; v_tx_type:='savings_contribution';
  else
    if p_amount_minor>v_goal_balance then raise exception 'Withdrawal exceeds this goal''s available savings.'; end if;
    if v_balance<p_amount_minor then raise exception 'Savings funds are temporarily unavailable.'; end if;
    v_source:=v_custody.id; v_destination:=v_account.id; v_entry_amount:=-p_amount_minor; v_tx_type:='savings_withdrawal';
  end if;

  v_reference:='NXSG'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  insert into public.ledger_transactions(reference,transaction_type,status,description,initiated_by,idempotency_key,metadata)
  values(v_reference,v_tx_type,'pending',case when p_direction='contribution' then 'Savings goal contribution' else 'Savings goal withdrawal' end,
    v_user_id,p_idempotency_key,jsonb_build_object('savings_goal_id',p_goal_id,'account_id',p_account_id,'amount_minor',p_amount_minor,'direction',p_direction))
  returning id into v_tx_id;
  insert into public.ledger_entries(transaction_id,account_id,amount_minor,currency)
  values(v_tx_id,v_source,-p_amount_minor,v_account.currency),(v_tx_id,v_destination,p_amount_minor,v_account.currency);
  update public.ledger_transactions set status='posted',posted_at=now() where id=v_tx_id;
  insert into public.savings_goal_entries(goal_id,user_id,transaction_id,account_id,amount_minor)
  values(p_goal_id,v_user_id,v_tx_id,p_account_id,v_entry_amount);
  select coalesce(sum(amount_minor),0)::bigint into v_goal_balance from public.savings_goal_entries where goal_id=p_goal_id and user_id=v_user_id;
  update public.savings_goals set status=case when v_goal_balance>=target_minor then 'completed' else 'active' end,updated_at=now() where id=p_goal_id;
  return v_tx_id;
exception when unique_violation then
  if p_idempotency_key is not null then
    select * into v_existing from public.ledger_transactions where initiated_by=v_user_id and idempotency_key=p_idempotency_key;
    if found and v_existing.metadata->>'savings_goal_id'=p_goal_id::text and v_existing.metadata->>'account_id'=p_account_id::text
      and v_existing.metadata->>'amount_minor'=p_amount_minor::text and v_existing.metadata->>'direction'=p_direction then return v_existing.id; end if;
  end if;
  raise;
end;
$function$;
