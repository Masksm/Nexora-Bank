
create table if not exists public.admin_customer_assignments (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  customer_user_id uuid not null references auth.users(id) on delete restrict,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (admin_user_id, customer_user_id),
  constraint admin_assignment_not_self check (admin_user_id <> customer_user_id)
);
create index if not exists admin_customer_assignments_customer_idx on public.admin_customer_assignments(customer_user_id);
create index if not exists admin_customer_assignments_admin_idx on public.admin_customer_assignments(admin_user_id);
alter table public.admin_customer_assignments enable row level security;

create or replace function private.is_super_admin()
returns boolean language sql stable security definer set search_path=''
as $$ select coalesce((select auth.jwt())->'app_metadata'->>'role','') = 'super_admin'; $$;
create or replace function private.is_staff_admin()
returns boolean language sql stable security definer set search_path=''
as $$ select coalesce((select auth.jwt())->'app_metadata'->>'role','') in ('admin','super_admin'); $$;
create or replace function private.can_access_customer(p_customer_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select p_customer_user_id = (select auth.uid())
    or private.is_super_admin()
    or (coalesce((select auth.jwt())->'app_metadata'->>'role','') = 'admin'
      and exists(select 1 from public.admin_customer_assignments a
        where a.admin_user_id=(select auth.uid()) and a.customer_user_id=p_customer_user_id));
$$;
revoke all on function private.is_super_admin() from public,anon;
revoke all on function private.is_staff_admin() from public,anon;
revoke all on function private.can_access_customer(uuid) from public,anon;
grant execute on function private.is_super_admin() to authenticated;
grant execute on function private.is_staff_admin() to authenticated;
grant execute on function private.can_access_customer(uuid) to authenticated;

drop policy if exists admin_customer_assignments_super_admin_manage on public.admin_customer_assignments;
drop policy if exists admin_customer_assignments_read_scope on public.admin_customer_assignments;
create policy admin_customer_assignments_read_scope on public.admin_customer_assignments for select to authenticated
using (private.is_super_admin() or admin_user_id=(select auth.uid()));
create policy admin_customer_assignments_super_admin_manage on public.admin_customer_assignments for all to authenticated
using (private.is_super_admin()) with check (private.is_super_admin());

drop policy if exists bank_accounts_select_own_or_admin on public.bank_accounts;
create policy bank_accounts_select_scoped on public.bank_accounts for select to authenticated
using (user_id=(select auth.uid()) or (not is_internal and private.can_access_customer(user_id)) or (is_internal and private.is_super_admin()));
drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_scoped on public.profiles for select to authenticated
using (user_id=(select auth.uid()) or private.can_access_customer(user_id));
drop policy if exists customer_verifications_select_own_or_admin on public.customer_verifications;
create policy customer_verifications_select_scoped on public.customer_verifications for select to authenticated
using (user_id=(select auth.uid()) or private.can_access_customer(user_id));
drop policy if exists identity_documents_select_own_or_admin on public.identity_documents;
create policy identity_documents_select_scoped on public.identity_documents for select to authenticated
using (user_id=(select auth.uid()) or private.can_access_customer(user_id));
drop policy if exists ledger_entries_select_own_or_admin on public.ledger_entries;
create policy ledger_entries_select_scoped on public.ledger_entries for select to authenticated
using (exists(select 1 from public.bank_accounts a where a.id=ledger_entries.account_id
 and (a.user_id=(select auth.uid()) or (not a.is_internal and private.can_access_customer(a.user_id)) or (a.is_internal and private.is_super_admin()))));
drop policy if exists ledger_transactions_select_related_or_admin on public.ledger_transactions;
create policy ledger_transactions_select_scoped on public.ledger_transactions for select to authenticated
using (exists(select 1 from public.ledger_entries e join public.bank_accounts a on a.id=e.account_id
 where e.transaction_id=ledger_transactions.id
 and (a.user_id=(select auth.uid()) or (not a.is_internal and private.can_access_customer(a.user_id)) or (a.is_internal and private.is_super_admin()))));
drop policy if exists support_conversations_select_own_or_admin on public.support_conversations;
create policy support_conversations_select_scoped on public.support_conversations for select to authenticated
using (user_id=(select auth.uid()) or private.can_access_customer(user_id));
drop policy if exists support_conversations_update_admin on public.support_conversations;
create policy support_conversations_update_scoped on public.support_conversations for update to authenticated
using (private.can_access_customer(user_id) and private.is_staff_admin())
with check (private.can_access_customer(user_id) and private.is_staff_admin());
drop policy if exists support_messages_select_own_or_admin on public.support_messages;
create policy support_messages_select_scoped on public.support_messages for select to authenticated
using (exists(select 1 from public.support_conversations c where c.id=support_messages.conversation_id
 and (c.user_id=(select auth.uid()) or private.can_access_customer(c.user_id))));
drop policy if exists support_messages_insert_authorized on public.support_messages;
create policy support_messages_insert_scoped on public.support_messages for insert to authenticated
with check (sender_user_id=(select auth.uid()) and (
 (sender_role='customer' and exists(select 1 from public.support_conversations c where c.id=support_messages.conversation_id and c.user_id=(select auth.uid())))
 or (sender_role='admin' and private.is_staff_admin() and exists(select 1 from public.support_conversations c where c.id=support_messages.conversation_id and private.can_access_customer(c.user_id)))));
drop policy if exists user_sessions_select_own_or_admin on public.user_sessions;
create policy user_sessions_select_scoped on public.user_sessions for select to authenticated
using (user_id=(select auth.uid()) or private.can_access_customer(user_id));
drop policy if exists trusted_devices_select_own_or_admin on public.trusted_devices;
create policy trusted_devices_select_scoped on public.trusted_devices for select to authenticated
using (user_id=(select auth.uid()) or private.can_access_customer(user_id));
drop policy if exists login_history_select_own_or_admin on public.login_history;
create policy login_history_select_scoped on public.login_history for select to authenticated
using (user_id=(select auth.uid()) or private.can_access_customer(user_id));
drop policy if exists admin_audit_logs_admin_only on public.admin_audit_logs;
create policy admin_audit_logs_super_admin_and_own on public.admin_audit_logs for select to authenticated
using (private.is_super_admin() or admin_user_id=(select auth.uid()));
drop policy if exists bank_settings_admin_only on public.bank_settings;
create policy bank_settings_super_admin_only on public.bank_settings for all to authenticated
using (private.is_super_admin()) with check (private.is_super_admin());

create or replace function private.super_admin_set_staff_role(p_user_id uuid,p_make_admin boolean)
returns void language plpgsql security definer set search_path='pg_catalog','public','auth'
as $$
declare v_actor uuid:=auth.uid(); v_target auth.users%rowtype; v_role text;
begin
 if v_actor is null or not private.is_super_admin() then raise exception 'Super Admin access required.'; end if;
 if p_user_id is null or p_user_id=v_actor then raise exception 'Choose another customer account.'; end if;
 select * into v_target from auth.users where id=p_user_id for update;
 if not found then raise exception 'User account not found.'; end if;
 v_role:=coalesce(v_target.raw_app_meta_data->>'role','customer');
 if v_role='super_admin' then raise exception 'A Super Admin role cannot be changed here.'; end if;
 if p_make_admin then
  if v_role='admin' then raise exception 'This account is already a staff administrator.'; end if;
  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('role','admin'),updated_at=now() where id=p_user_id;
 else
  if v_role<>'admin' then raise exception 'This account is not a staff administrator.'; end if;
  delete from public.admin_customer_assignments where admin_user_id=p_user_id;
  update auth.users set raw_app_meta_data=(coalesce(raw_app_meta_data,'{}'::jsonb)-'role')||jsonb_build_object('role','customer'),updated_at=now() where id=p_user_id;
 end if;
 insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,reason,before_state,after_state)
 values(v_actor,case when p_make_admin then 'promote_staff_admin' else 'demote_staff_admin' end,'user',p_user_id::text,
 case when p_make_admin then 'Promoted customer to staff administrator.' else 'Demoted staff administrator and removed assignments.' end,
 jsonb_build_object('role',v_role),jsonb_build_object('role',case when p_make_admin then 'admin' else 'customer' end));
end; $$;

create or replace function private.super_admin_set_customer_assignment(p_admin_user_id uuid,p_customer_user_id uuid,p_assign boolean)
returns void language plpgsql security definer set search_path='pg_catalog','public','auth'
as $$
declare v_actor uuid:=auth.uid(); v_admin_role text; v_customer_role text;
begin
 if v_actor is null or not private.is_super_admin() then raise exception 'Super Admin access required.'; end if;
 if p_admin_user_id is null or p_customer_user_id is null or p_admin_user_id=p_customer_user_id then raise exception 'Select a valid staff admin and customer.'; end if;
 select raw_app_meta_data->>'role' into v_admin_role from auth.users where id=p_admin_user_id;
 select raw_app_meta_data->>'role' into v_customer_role from auth.users where id=p_customer_user_id;
 if v_admin_role is distinct from 'admin' then raise exception 'The selected account is not a staff administrator.'; end if;
 if coalesce(v_customer_role,'customer') in ('admin','super_admin') then raise exception 'Administrator accounts cannot be assigned as customers.'; end if;
 if p_assign then
  insert into public.admin_customer_assignments(admin_user_id,customer_user_id,assigned_by) values(p_admin_user_id,p_customer_user_id,v_actor)
  on conflict(admin_user_id,customer_user_id) do nothing;
 else
  delete from public.admin_customer_assignments where admin_user_id=p_admin_user_id and customer_user_id=p_customer_user_id;
 end if;
 insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,reason,before_state,after_state)
 values(v_actor,case when p_assign then 'assign_customer_to_staff_admin' else 'remove_customer_from_staff_admin' end,
 'admin_customer_assignment',p_admin_user_id||':'||p_customer_user_id,
 case when p_assign then 'Assigned customer to staff administrator.' else 'Removed customer assignment.' end,
 jsonb_build_object('assigned',not p_assign),jsonb_build_object('assigned',p_assign,'customer_user_id',p_customer_user_id));
end; $$;

create or replace function public.super_admin_set_staff_role(p_user_id uuid,p_make_admin boolean)
returns void language sql security invoker set search_path=''
as $$ select private.super_admin_set_staff_role(p_user_id,p_make_admin); $$;
create or replace function public.super_admin_set_customer_assignment(p_admin_user_id uuid,p_customer_user_id uuid,p_assign boolean)
returns void language sql security invoker set search_path=''
as $$ select private.super_admin_set_customer_assignment(p_admin_user_id,p_customer_user_id,p_assign); $$;
revoke all on function private.super_admin_set_staff_role(uuid,boolean) from public,anon;
revoke all on function private.super_admin_set_customer_assignment(uuid,uuid,boolean) from public,anon;
revoke all on function public.super_admin_set_staff_role(uuid,boolean) from public,anon;
revoke all on function public.super_admin_set_customer_assignment(uuid,uuid,boolean) from public,anon;
grant execute on function public.super_admin_set_staff_role(uuid,boolean) to authenticated;
grant execute on function public.super_admin_set_customer_assignment(uuid,uuid,boolean) to authenticated;

update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('role','super_admin'),updated_at=now()
where lower(email)='wiskwww@gmail.com' and raw_app_meta_data->>'role'='admin';
do $$ begin
 if not exists(select 1 from auth.users where lower(email)='wiskwww@gmail.com' and raw_app_meta_data->>'role'='super_admin') then
 raise exception 'Expected existing administrator account was not upgraded. Migration rolled back.'; end if;
end $$;
