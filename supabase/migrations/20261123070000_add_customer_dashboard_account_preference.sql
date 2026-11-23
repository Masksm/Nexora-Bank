-- Persist each customer's preferred active account for the dashboard overview.
alter table public.profiles
  add column if not exists dashboard_account_id uuid null
  references public.bank_accounts(id) on delete set null;

create index if not exists profiles_dashboard_account_id_idx
  on public.profiles(dashboard_account_id)
  where dashboard_account_id is not null;
