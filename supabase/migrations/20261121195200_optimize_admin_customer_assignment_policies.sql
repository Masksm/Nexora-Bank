-- Keep assignment reads scoped while avoiding a broad FOR ALL policy on SELECT.
create index if not exists admin_customer_assignments_assigned_by_idx
  on public.admin_customer_assignments(assigned_by);

drop policy if exists admin_customer_assignments_super_admin_manage
  on public.admin_customer_assignments;

create policy admin_customer_assignments_super_admin_insert
  on public.admin_customer_assignments for insert to authenticated
  with check (private.is_super_admin());

create policy admin_customer_assignments_super_admin_update
  on public.admin_customer_assignments for update to authenticated
  using (private.is_super_admin())
  with check (private.is_super_admin());

create policy admin_customer_assignments_super_admin_delete
  on public.admin_customer_assignments for delete to authenticated
  using (private.is_super_admin());
