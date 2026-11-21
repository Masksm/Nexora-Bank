
create or replace function private.assert_customer_access(p_user_id uuid)
returns void language plpgsql stable security definer set search_path=''
as $$ begin if p_user_id is null or not private.can_access_customer(p_user_id) then raise exception 'This customer is not assigned to your administrator account.'; end if; end; $$;
revoke all on function private.assert_customer_access(uuid) from public,anon;
grant execute on function private.assert_customer_access(uuid) to authenticated;

do $migration$
declare r record; v_def text; v_pos integer; v_end integer; v_check text;
begin
 for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'admin_%'
 loop
  v_def:=pg_get_functiondef(r.oid);
  v_def:=replace(v_def,'v_admin_id is null or ((select auth.jwt())->''app_metadata''->>''role'') is distinct from ''admin''','v_admin_id is null or not private.is_staff_admin()');
  v_def:=replace(v_def,'v_admin is null or ((SELECT auth.jwt())->''app_metadata''->>''role'') IS DISTINCT FROM ''admin''','v_admin is null or not private.is_staff_admin()');
  v_def:=replace(v_def,'v_admin is null or ((select auth.jwt())->''app_metadata''->>''role'') IS DISTINCT FROM ''admin''','v_admin is null or not private.is_staff_admin()');
  v_def:=replace(v_def,'v_admin_id is null or ((SELECT auth.jwt())->''app_metadata''->>''role'') IS DISTINCT FROM ''admin''','v_admin_id is null or not private.is_staff_admin()');
  if r.proname in ('admin_adjust_balance','admin_generate_demo_history','admin_reset_demo_history','admin_set_account_status') then
   v_check:='if not exists(select 1 from public.bank_accounts a where a.id=p_account_id and a.is_internal=false and private.can_access_customer(a.user_id)) then raise exception ''This customer account is not assigned to your administrator account.''; end if;';
  elsif r.proname='admin_review_transfer' then
   v_check:='if exists(select 1 from public.ledger_entries e join public.bank_accounts a on a.id=e.account_id where e.transaction_id=p_transaction_id and a.is_internal=false and not private.can_access_customer(a.user_id)) then raise exception ''This transfer includes a customer outside your assigned accounts.''; end if;';
  elsif r.proname='admin_review_identity_document' then
   v_check:='if not exists(select 1 from public.identity_documents d where d.id=p_document_id and private.can_access_customer(d.user_id)) then raise exception ''This customer is not assigned to your administrator account.''; end if;';
  elsif r.proname='admin_revoke_user_session' then
   v_check:='if not exists(select 1 from public.user_sessions s where s.id=p_session_record_id and private.can_access_customer(s.user_id)) then raise exception ''This customer is not assigned to your administrator account.''; end if;';
  elsif r.proname='admin_set_device_trust' then
   v_check:='if not exists(select 1 from public.trusted_devices d where d.id=p_device_id and private.can_access_customer(d.user_id)) then raise exception ''This customer is not assigned to your administrator account.''; end if;';
  else v_check:=null;
  end if;
  if v_check is not null then
   v_pos:=strpos(v_def,'raise exception ''Administrator access required.'';');
   if v_pos>0 then
    v_end:=strpos(substr(v_def,v_pos),'end if;');
    if v_end>0 then v_end:=v_pos+v_end+length('end if;')-1; v_def:=substr(v_def,1,v_end)||E'\n  '||v_check||substr(v_def,v_end+1); end if;
   end if;
  end if;
  execute v_def;
 end loop;
end; $migration$;

create or replace function private.super_admin_directory()
returns table(user_id uuid,email text,role text,display_name text,account_count bigint,assigned_customer_count bigint)
language plpgsql stable security definer set search_path='pg_catalog','public','auth'
as $$
begin
 if not private.is_super_admin() then raise exception 'Super Admin access required.'; end if;
 return query select u.id,u.email,coalesce(u.raw_app_meta_data->>'role','customer'),
 coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.display_name,'Name not provided'),
 (select count(*) from public.bank_accounts b where b.user_id=u.id and b.is_internal=false),
 (select count(*) from public.admin_customer_assignments a where a.admin_user_id=u.id)
 from auth.users u left join public.profiles p on p.user_id=u.id
 order by case coalesce(u.raw_app_meta_data->>'role','customer') when 'super_admin' then 0 when 'admin' then 1 else 2 end,u.created_at desc;
end; $$;
create or replace function public.super_admin_directory()
returns table(user_id uuid,email text,role text,display_name text,account_count bigint,assigned_customer_count bigint)
language sql security invoker set search_path=''
as $$ select * from private.super_admin_directory(); $$;
revoke all on function private.super_admin_directory() from public,anon;
revoke all on function public.super_admin_directory() from public,anon;
grant execute on function public.super_admin_directory() to authenticated;
