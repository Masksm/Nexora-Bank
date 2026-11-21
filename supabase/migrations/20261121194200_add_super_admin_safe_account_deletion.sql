-- Safe Super Admin account deletion. Financial history is retained; funded accounts cannot be deleted.
alter table public.bank_accounts drop constraint if exists bank_accounts_user_id_fkey;
alter table public.bank_accounts add constraint bank_accounts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;
alter table public.bank_accounts drop constraint if exists bank_accounts_internal_owner_check;
alter table public.bank_accounts add constraint bank_accounts_internal_owner_check check (
  (is_internal = true and user_id is null and account_type = 'internal')
  or
  (is_internal = false and account_type in ('checking','savings')
    and (user_id is not null or (user_id is null and status = 'closed')))
);

alter table public.savings_goals alter column user_id drop not null;
alter table public.savings_goals drop constraint if exists savings_goals_user_id_fkey;
alter table public.savings_goals add constraint savings_goals_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.savings_goal_entries alter column user_id drop not null;
alter table public.savings_goal_entries drop constraint if exists savings_goal_entries_user_id_fkey;
alter table public.savings_goal_entries add constraint savings_goal_entries_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.scheduled_transfers alter column user_id drop not null;
alter table public.scheduled_transfers drop constraint if exists scheduled_transfers_user_id_fkey;
alter table public.scheduled_transfers add constraint scheduled_transfers_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

drop policy if exists identity_docs_delete_super_admin on storage.objects;
create policy identity_docs_delete_super_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'identity-documents' and private.is_super_admin());

create or replace function private.super_admin_account_deletion_preview(p_user_id uuid)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public','private','auth','storage'
as $$
declare v_email text; v_role text; v_account_count integer; v_storage_objects jsonb;
begin
  if auth.uid() is null or not private.is_super_admin() then raise exception 'Super Admin access required.'; end if;
  if p_user_id is null or p_user_id = auth.uid() then raise exception 'You cannot delete your own Super Admin account.'; end if;
  select u.email, coalesce(u.raw_app_meta_data->>'role','customer') into v_email,v_role
  from auth.users u where u.id=p_user_id for update;
  if not found then raise exception 'User account not found.'; end if;
  if v_role='super_admin' then raise exception 'A Super Admin account cannot be deleted here.'; end if;

  if exists(select 1 from public.account_balances b join public.bank_accounts a on a.id=b.account_id
    where a.user_id=p_user_id and not a.is_internal and b.balance_minor<>0) then
    raise exception 'This account has a non-zero balance. Move or withdraw all funds before deleting it.';
  end if;
  if exists(select 1 from public.ledger_entries e join public.ledger_transactions t on t.id=e.transaction_id
    join public.bank_accounts a on a.id=e.account_id
    where a.user_id=p_user_id and not a.is_internal and t.status='pending') then
    raise exception 'This account has a pending financial transaction. Resolve it before deleting the account.';
  end if;
  if exists(select 1 from public.savings_goals g where g.user_id=p_user_id
    and (select coalesce(sum(e.amount_minor),0) from public.savings_goal_entries e where e.goal_id=g.id)<>0) then
    raise exception 'This account still has money in a savings goal. Withdraw the savings before deleting the account.';
  end if;

  select count(*)::integer into v_account_count from public.bank_accounts a where a.user_id=p_user_id and not a.is_internal;
  select coalesce(jsonb_agg(jsonb_build_object('bucket_id',o.bucket_id,'name',o.name)),'[]'::jsonb)
    into v_storage_objects from storage.objects o
    where o.bucket_id='identity-documents' and (o.owner=p_user_id or split_part(o.name,'/',1)=p_user_id::text);
  return jsonb_build_object('user_id',p_user_id,'email',v_email,'role',v_role,'account_count',v_account_count,'storage_objects',v_storage_objects);
end;
$$;

create or replace function private.super_admin_delete_account(p_user_id uuid,p_confirm_email text)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public','private','auth'
as $$
declare
  v_preview jsonb; v_email text; v_role text; v_actor uuid:=auth.uid();
  v_closed_accounts integer:=0; v_cancelled_transfers integer:=0;
begin
  if v_actor is null or not private.is_super_admin() then raise exception 'Super Admin access required.'; end if;
  v_preview:=private.super_admin_account_deletion_preview(p_user_id);
  v_email:=v_preview->>'email'; v_role:=v_preview->>'role';
  if lower(trim(coalesce(p_confirm_email,'')))<>lower(v_email) then raise exception 'Confirmation email does not match this account.'; end if;

  update public.scheduled_transfers set status='cancelled',updated_at=now()
    where user_id=p_user_id and status in ('scheduled','submitted_for_review');
  get diagnostics v_cancelled_transfers=row_count;

  delete from public.admin_customer_assignments
    where admin_user_id=p_user_id or customer_user_id=p_user_id or assigned_by=p_user_id;

  update public.bank_accounts set status='closed',user_id=null,account_name='Closed account',nickname=null,updated_at=now()
    where user_id=p_user_id and is_internal=false;
  get diagnostics v_closed_accounts=row_count;

  update public.savings_goals set user_id=null where user_id=p_user_id;
  update public.savings_goal_entries set user_id=null where user_id=p_user_id;
  update public.scheduled_transfers set user_id=null where user_id=p_user_id;

  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,reason,before_state,after_state)
  values(v_actor,'delete_user_account','user_account',p_user_id::text,
    'Super Admin permanently deleted an account after zero-balance and pending-transaction checks.',
    jsonb_build_object('role',v_role,'account_count',v_closed_accounts),
    jsonb_build_object('deleted',true,'closed_accounts',v_closed_accounts,'cancelled_scheduled_transfers',v_cancelled_transfers));

  delete from auth.users where id=p_user_id;
  if not found then raise exception 'User account could not be deleted.'; end if;
  return jsonb_build_object('deleted',true,'closed_accounts',v_closed_accounts,'cancelled_scheduled_transfers',v_cancelled_transfers);
end;
$$;

create or replace function public.super_admin_prepare_account_deletion(p_user_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.super_admin_account_deletion_preview($1); $$;
create or replace function public.super_admin_delete_account(p_user_id uuid,p_confirm_email text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.super_admin_delete_account($1,$2); $$;

revoke all on function private.super_admin_account_deletion_preview(uuid) from public,anon;
revoke all on function private.super_admin_delete_account(uuid,text) from public,anon;
revoke all on function public.super_admin_prepare_account_deletion(uuid) from public,anon;
revoke all on function public.super_admin_delete_account(uuid,text) from public,anon;
grant execute on function private.super_admin_account_deletion_preview(uuid) to authenticated;
grant execute on function private.super_admin_delete_account(uuid,text) to authenticated;
grant execute on function public.super_admin_prepare_account_deletion(uuid) to authenticated;
grant execute on function public.super_admin_delete_account(uuid,text) to authenticated;
