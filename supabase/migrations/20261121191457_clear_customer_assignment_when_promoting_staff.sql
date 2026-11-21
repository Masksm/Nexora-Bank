create or replace function private.super_admin_set_staff_role(p_user_id uuid, p_make_admin boolean)
returns void language plpgsql security definer set search_path='pg_catalog','public','auth'
as $$
declare v_actor uuid := auth.uid(); v_target auth.users%rowtype; v_role text;
begin
 if v_actor is null or not private.is_super_admin() then raise exception 'Super Admin access required.'; end if;
 if p_user_id is null or p_user_id=v_actor then raise exception 'Choose another customer account.'; end if;
 select * into v_target from auth.users where id=p_user_id for update;
 if not found then raise exception 'User account not found.'; end if;
 v_role := coalesce(v_target.raw_app_meta_data->>'role','customer');
 if v_role='super_admin' then raise exception 'A Super Admin role cannot be changed here.'; end if;
 if p_make_admin then
   if v_role='admin' then raise exception 'This account is already a staff administrator.'; end if;
   delete from public.admin_customer_assignments where customer_user_id=p_user_id;
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
end;
$$;