create or replace function public.convert_currency(
 p_from_account_id uuid, p_to_account_id uuid, p_quote_id uuid, p_amount_minor bigint, p_pin text
)
returns table(transaction_id uuid, reference text, source_amount_minor bigint, destination_amount_minor bigint, rate numeric, fee_minor bigint)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private', 'extensions'
as $function$
declare
 v_user uuid:=auth.uid();
 v_from public.bank_accounts%rowtype;
 v_to public.bank_accounts%rowtype;
 v_quote public.fx_rate_quotes%rowtype;
 v_dest bigint;
 v_fee bigint:=0;
 v_tx uuid;
 v_ref text;
 v_source_clearing uuid;
 v_dest_clearing uuid;
 v_currency_issue boolean;
begin
 if v_user is null then raise exception 'Authentication required.'; end if;
 if not private.check_transaction_pin(v_user,p_pin) then return; end if;
 select * into v_quote from public.fx_rate_quotes
 where id=p_quote_id and user_id=v_user and consumed_at is null and expires_at>now() for update;
 if not found then raise exception 'Exchange quote expired. Request a new quote.'; end if;
 select * into v_from from public.bank_accounts
 where id=p_from_account_id and user_id=v_user and status='active' and is_internal=false for update;
 if not found then raise exception 'SOURCE_ACCOUNT_INVALID: Select an active Nexora source account.'; end if;
 select * into v_to from public.bank_accounts
 where id=p_to_account_id and user_id=v_user and status='active' and is_internal=false for update;
 if not found then raise exception 'DESTINATION_ACCOUNT_INVALID: Select an active Nexora destination account.'; end if;
 if v_from.id=v_to.id then raise exception 'Choose two different Nexora accounts.'; end if;
 if v_from.currency<>v_quote.base_currency or v_to.currency<>v_quote.quote_currency then
   raise exception 'The exchange quote does not match the selected accounts. Request a new quote.';
 end if;
 if p_amount_minor is null or p_amount_minor<=0 then raise exception 'Enter a valid conversion amount.'; end if;
 if (select coalesce(sum(e.amount_minor),0)
     from public.ledger_entries e join public.ledger_transactions t on t.id=e.transaction_id
     where e.account_id=v_from.id and t.status='posted')<p_amount_minor then
   raise exception 'Insufficient funds in the selected source account.';
 end if;
 v_dest:=floor((p_amount_minor::numeric*v_quote.rate)+0.5)::bigint;
 if v_dest<=0 then raise exception 'Converted amount is too small.'; end if;
 v_source_clearing:=private.ensure_fx_clearing_account(v_from.currency);
 v_dest_clearing:=private.ensure_fx_clearing_account(v_to.currency);
 if v_source_clearing=v_dest_clearing then raise exception 'FX clearing accounts are not configured separately for both currencies.'; end if;
 v_ref:='NXFX'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,14));
 insert into public.ledger_transactions(reference,transaction_type,status,description,initiated_by,metadata)
 values(v_ref,'transfer','pending','Currency conversion '||v_from.currency||' to '||v_to.currency,v_user,
   jsonb_build_object(
    'fx_quote_id',v_quote.id,'rate',v_quote.rate,
    'source_account_id',v_from.id,'destination_account_id',v_to.id,
    'source_clearing_account_id',v_source_clearing,'destination_clearing_account_id',v_dest_clearing,
    'source_amount_minor',p_amount_minor,'destination_amount_minor',v_dest,
    'source_currency',v_from.currency,'destination_currency',v_to.currency,'rate_source',v_quote.source
   )
 ) returning id into v_tx;
 insert into public.ledger_entries(transaction_id,account_id,amount_minor,currency)
 values
  (v_tx,v_from.id,-p_amount_minor,v_from.currency),
  (v_tx,v_source_clearing,p_amount_minor,v_from.currency),
  (v_tx,v_dest_clearing,-v_dest,v_to.currency),
  (v_tx,v_to.id,v_dest,v_to.currency);
 select exists(
   select 1 from public.ledger_entries as le
   where le.transaction_id=v_tx
   group by le.currency having sum(le.amount_minor)<>0
 ) into v_currency_issue;
 if v_currency_issue then
   raise exception 'FX_LEDGER_UNBALANCED: Currency conversion was stopped because its ledger entries did not balance. No balances were changed.';
 end if;
 update public.ledger_transactions set status='posted',posted_at=now() where id=v_tx;
 update public.fx_rate_quotes set consumed_at=now() where id=v_quote.id;
 return query select v_tx,v_ref,p_amount_minor,v_dest,v_quote.rate,v_fee;
end;
$function$;