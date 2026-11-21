-- Prevent deletion while another customer's pending scheduled transfer targets the account.
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

  perform a.id from public.bank_accounts a
    where a.user_id=p_user_id and not a.is_internal order by a.id for update;
  perform g.id from public.savings_goals g
    where g.user_id=p_user_id order by g.id for update;
  perform s.id from public.scheduled_transfers s
    where s.user_id=p_user_id and s.status in ('scheduled','submitted_for_review') order by s.id for update;

  if exists(select 1 from public.account_balances b join public.bank_accounts a on a.id=b.account_id
    where a.user_id=p_user_id and not a.is_internal and b.balance_minor<>0) then
    raise exception 'This account has a non-zero balance. Move or withdraw all funds before deleting it.';
  end if;
  if exists(select 1 from public.ledger_entries e join public.ledger_transactions t on t.id=e.transaction_id
    join public.bank_accounts a on a.id=e.account_id
    where a.user_id=p_user_id and not a.is_internal and t.status='pending')
    or exists(select 1 from public.ledger_transactions t where t.initiated_by=p_user_id and t.status='pending') then
    raise exception 'This account has a pending financial transaction. Resolve it before deleting the account.';
  end if;
  if exists(select 1 from public.savings_goals g where g.user_id=p_user_id
    and (select coalesce(sum(e.amount_minor),0) from public.savings_goal_entries e where e.goal_id=g.id)<>0) then
    raise exception 'This account still has money in a savings goal. Withdraw the savings before deleting the account.';
  end if;
  if exists(select 1 from public.scheduled_transfers s
    join public.bank_accounts a on a.account_number=s.recipient_account_number
    where a.user_id=p_user_id and s.user_id<>p_user_id and s.status in ('scheduled','submitted_for_review')) then
    raise exception 'Another customer has a scheduled transfer to this account. Resolve that incoming transfer before deleting the account.';
  end if;

  select count(*)::integer into v_account_count from public.bank_accounts a where a.user_id=p_user_id and not a.is_internal;
  select coalesce(jsonb_agg(jsonb_build_object('bucket_id',o.bucket_id,'name',o.name)),'[]'::jsonb)
    into v_storage_objects from storage.objects o
    where o.bucket_id='identity-documents' and (o.owner=p_user_id or split_part(o.name,'/',1)=p_user_id::text);
  return jsonb_build_object('user_id',p_user_id,'email',v_email,'role',v_role,'account_count',v_account_count,'storage_objects',v_storage_objects);
end;
$$;
