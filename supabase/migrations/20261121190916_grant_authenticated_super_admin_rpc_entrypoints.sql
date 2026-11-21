
grant usage on schema private to authenticated;
grant execute on function private.super_admin_set_staff_role(uuid,boolean) to authenticated;
grant execute on function private.super_admin_set_customer_assignment(uuid,uuid,boolean) to authenticated;
grant execute on function private.super_admin_directory() to authenticated;
grant select on public.admin_customer_assignments to authenticated;
