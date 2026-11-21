create or replace function private.super_admin_directory()
returns table(user_id uuid,email text,role text,display_name text,account_count bigint,assigned_customer_count bigint)
language plpgsql stable security definer set search_path='pg_catalog','public','auth'
as $$
begin
 if not private.is_super_admin() then raise exception 'Super Admin access required.'; end if;
 return query
 select u.id,u.email::text,coalesce(u.raw_app_meta_data->>'role','customer')::text,
        coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.display_name,'Name not provided')::text,
        (select count(*)::bigint from public.bank_accounts b where b.user_id=u.id and b.is_internal=false),
        (select count(*)::bigint from public.admin_customer_assignments a where a.admin_user_id=u.id)
 from auth.users u left join public.profiles p on p.user_id=u.id
 order by case coalesce(u.raw_app_meta_data->>'role','customer') when 'super_admin' then 0 when 'admin' then 1 else 2 end,u.created_at desc;
end;
$$;