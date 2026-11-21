do $patch$
declare v_def text; v_oid oid;
begin
 select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='admin_review_transfer';
 v_def:=pg_get_functiondef(v_oid);
 v_def:=replace(v_def,'WHERE e.transaction_id=p_transaction_id AND a.is_internal=false AND NOT private.can_access_customer(a.user_id)','WHERE e.transaction_id=p_transaction_id AND e.amount_minor < 0 AND a.is_internal=false AND NOT private.can_access_customer(a.user_id)');
 v_def:=replace(v_def,'IF (v_source_user IS NOT NULL AND NOT private.can_access_customer(v_source_user)) OR (v_destination_user IS NOT NULL AND NOT private.can_access_customer(v_destination_user)) THEN','IF v_source_user IS NULL OR NOT private.can_access_customer(v_source_user) THEN');
 execute v_def;
end; $patch$;