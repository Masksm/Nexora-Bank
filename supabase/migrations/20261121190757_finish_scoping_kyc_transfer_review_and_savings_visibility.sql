
do $patch$
declare v_def text; v_oid oid;
begin
 select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='admin_review_identity_document';
 v_def:=pg_get_functiondef(v_oid);
 v_def:=replace(v_def,'IF NOT FOUND THEN RAISE EXCEPTION ''Identity document was not found.''; END IF;','IF NOT FOUND THEN RAISE EXCEPTION ''Identity document was not found.''; END IF; IF NOT private.can_access_customer(v_doc.user_id) THEN RAISE EXCEPTION ''This customer is not assigned to your administrator account.''; END IF;');
 execute v_def;
 select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='admin_review_transfer';
 v_def:=pg_get_functiondef(v_oid);
 v_def:=replace(v_def,'WHERE e.transaction_id=v_tx.id AND e.amount_minor > 0
  LIMIT 1;

  IF p_decision=''approve''','WHERE e.transaction_id=v_tx.id AND e.amount_minor > 0
  LIMIT 1;

  IF (v_source_user IS NOT NULL AND NOT private.can_access_customer(v_source_user)) OR (v_destination_user IS NOT NULL AND NOT private.can_access_customer(v_destination_user)) THEN RAISE EXCEPTION ''This transfer includes a customer outside your assigned accounts.''; END IF;

  IF p_decision=''approve''');
 execute v_def;
end; $patch$;
drop policy if exists savings_goals_select_own on public.savings_goals;
create policy savings_goals_select_scoped on public.savings_goals for select to authenticated using (user_id=(select auth.uid()) or private.can_access_customer(user_id));
drop policy if exists savings_goal_entries_select_own on public.savings_goal_entries;
create policy savings_goal_entries_select_scoped on public.savings_goal_entries for select to authenticated using (user_id=(select auth.uid()) or private.can_access_customer(user_id));
