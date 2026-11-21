
do $patch$
declare v_def text; v_oid oid;
begin
 select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='admin_review_identity_document';
 v_def:=pg_get_functiondef(v_oid);
 v_def:=replace(v_def,'IF v_admin IS NULL OR ((SELECT auth.jwt())->''app_metadata''->>''role'') IS DISTINCT FROM ''admin'' THEN','IF v_admin IS NULL OR NOT private.is_staff_admin() THEN');
 v_def:=replace(v_def,'RAISE EXCEPTION ''Administrator access required.'';\n  END IF;','RAISE EXCEPTION ''Administrator access required.'';\n  END IF;\n  IF NOT EXISTS(SELECT 1 FROM public.identity_documents d WHERE d.id=p_document_id AND private.can_access_customer(d.user_id)) THEN RAISE EXCEPTION ''This customer is not assigned to your administrator account.''; END IF;');
 execute v_def;
 select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='admin_review_transfer';
 v_def:=pg_get_functiondef(v_oid);
 v_def:=replace(v_def,'IF v_admin IS NULL OR ((select auth.jwt())->''app_metadata''->>''role'') IS DISTINCT FROM ''admin'' THEN','IF v_admin IS NULL OR NOT private.is_staff_admin() THEN');
 v_def:=replace(v_def,'IF v_admin IS NULL OR ((SELECT auth.jwt())->''app_metadata''->>''role'') IS DISTINCT FROM ''admin'' THEN','IF v_admin IS NULL OR NOT private.is_staff_admin() THEN');
 v_def:=replace(v_def,'RAISE EXCEPTION ''Administrator access required.''; END IF;','RAISE EXCEPTION ''Administrator access required.''; END IF; IF EXISTS(SELECT 1 FROM public.ledger_entries e JOIN public.bank_accounts a ON a.id=e.account_id WHERE e.transaction_id=p_transaction_id AND a.is_internal=false AND NOT private.can_access_customer(a.user_id)) THEN RAISE EXCEPTION ''This transfer includes a customer outside your assigned accounts.''; END IF;');
 execute v_def;
 select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='admin_revoke_user_session';
 v_def:=pg_get_functiondef(v_oid);
 v_def:=replace(v_def,'v_admin is null or ((select auth.jwt())->''app_metadata''->>''role'') is distinct from ''admin''','v_admin is null or not private.is_staff_admin()');
 execute v_def;
 select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='admin_set_device_trust';
 v_def:=pg_get_functiondef(v_oid);
 v_def:=replace(v_def,'v_admin is null or ((select auth.jwt())->''app_metadata''->>''role'') is distinct from ''admin''','v_admin is null or not private.is_staff_admin()');
 execute v_def;
end; $patch$;
drop policy if exists identity_docs_read_admin on storage.objects;
create policy identity_docs_read_scoped_staff on storage.objects for select to authenticated
using (bucket_id='identity-documents' and private.can_access_customer(nullif((storage.foldername(name))[1],'')::uuid));
