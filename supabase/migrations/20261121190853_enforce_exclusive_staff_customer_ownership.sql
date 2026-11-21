
create unique index if not exists admin_customer_assignments_one_staff_per_customer on public.admin_customer_assignments(customer_user_id);
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
  if exists(select 1 from public.admin_customer_assignments where customer_user_id=p_customer_user_id and admin_user_id<>p_admin_user_id) then
   raise exception 'This customer is already assigned to another staff administrator. Remove the existing assignment first.';
  end if;
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
