
do $patch$
declare v_def text; v_oid oid; v_pos integer; v_end integer;
begin
 select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='admin_review_transfer';
 v_def:=pg_get_functiondef(v_oid);
 v_pos:=strpos(lower(v_def),'raise exception ''administrator access required.'';');
 if v_pos>0 then
  v_end:=strpos(lower(substr(v_def,v_pos)),'end if;');
  if v_end>0 then
   v_end:=v_pos+v_end+length('end if;')-1;
   v_def:=substr(v_def,1,v_end)||E'\n  IF EXISTS(SELECT 1 FROM public.ledger_entries e JOIN public.bank_accounts a ON a.id=e.account_id WHERE e.transaction_id=p_transaction_id AND a.is_internal=false AND NOT private.can_access_customer(a.user_id)) THEN RAISE EXCEPTION ''This transfer includes a customer outside your assigned accounts.''; END IF;'||substr(v_def,v_end+1);
  end if;
 end if;
 execute v_def;
end; $patch$;
