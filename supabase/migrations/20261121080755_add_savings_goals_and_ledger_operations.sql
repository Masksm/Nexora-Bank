-- Savings goals backed by balanced ledger movements.
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  name text not null,
  target_minor bigint not null check (target_minor between 100 and 100000000000),
  target_date date,
  status text not null default 'active' check (status in ('active','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint savings_goals_name_length check (char_length(name) between 2 and 60),
  constraint savings_goals_target_date_check check (target_date is null or target_date >= created_at::date)
);
create index if not exists savings_goals_user_created_idx on public.savings_goals(user_id,created_at desc);

create table if not exists public.savings_goal_entries (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.savings_goals(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  transaction_id uuid not null references public.ledger_transactions(id) on delete restrict,
  account_id uuid not null references public.bank_accounts(id) on delete restrict,
  amount_minor bigint not null check (amount_minor <> 0),
  created_at timestamptz not null default now()
);
create index if not exists savings_goal_entries_goal_created_idx on public.savings_goal_entries(goal_id,created_at desc);
create index if not exists savings_goal_entries_user_created_idx on public.savings_goal_entries(user_id,created_at desc);

alter table public.savings_goals enable row level security;
alter table public.savings_goal_entries enable row level security;
drop policy if exists savings_goals_select_own on public.savings_goals;
create policy savings_goals_select_own on public.savings_goals for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists savings_goal_entries_select_own on public.savings_goal_entries;
create policy savings_goal_entries_select_own on public.savings_goal_entries for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.savings_goals from anon,authenticated;
revoke all on public.savings_goal_entries from anon,authenticated;
grant select on public.savings_goals,public.savings_goal_entries to authenticated;

do $$
declare v_number text;
begin
  if not exists(select 1 from public.bank_accounts where is_internal and account_name='Nexora Savings Custody') then
    loop
      v_number:=lpad((floor(random()*10000000000))::bigint::text,10,'0');
      exit when not exists(select 1 from public.bank_accounts where account_number=v_number);
    end loop;
    insert into public.bank_accounts(user_id,account_number,account_name,account_type,currency,status,is_internal)
    values(null,v_number,'Nexora Savings Custody','internal','USD','active',true);
  end if;
end $$;

alter table public.ledger_transactions drop constraint if exists ledger_transactions_transaction_type_check;
alter table public.ledger_transactions add constraint ledger_transactions_transaction_type_check
check(transaction_type in ('transfer','deposit','withdrawal','fee','adjustment','reversal','savings_contribution','savings_withdrawal'));

create or replace function private.create_savings_goal(p_name text,p_target_minor bigint,p_target_date date default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,private as $function$
declare v_user_id uuid:=auth.uid(); v_goal_id uuid; v_name text:=nullif(trim(p_name),'');
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  if v_name is null or char_length(v_name) not between 2 and 60 then raise exception 'Goal name must be between 2 and 60 characters.'; end if;
  if p_target_minor is null or p_target_minor<100 or p_target_minor>100000000000 then raise exception 'Enter a target of at least $1.00 and no more than $1 billion.'; end if;
  if p_target_date is not null and (p_target_date<current_date or p_target_date>current_date+3650) then raise exception 'Choose a target date within the next ten years.'; end if;
  insert into public.savings_goals(user_id,name,target_minor,target_date) values(v_user_id,v_name,p_target_minor,p_target_date) returning id into v_goal_id;
  return v_goal_id;
end;
$function$;

create or replace function private.move_savings_goal_funds(p_goal_id uuid,p_account_id uuid,p_amount_minor bigint,p_direction text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,private as $function$
declare
  v_user_id uuid:=auth.uid(); v_goal public.savings_goals%rowtype; v_account public.bank_accounts%rowtype;
  v_custody public.bank_accounts%rowtype; v_balance bigint; v_goal_balance bigint; v_tx_id uuid;
  v_reference text; v_existing public.ledger_transactions%rowtype; v_tx_type text;
  v_source uuid; v_destination uuid; v_entry_amount bigint;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  if p_amount_minor is null or p_amount_minor<=0 or p_amount_minor>100000000000 then raise exception 'Enter a valid amount.'; end if;
  if coalesce(p_direction,'') not in ('contribution','withdrawal') then raise exception 'Invalid savings operation.'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 120 then raise exception 'A valid request key is required.'; end if;

  select * into v_existing from public.ledger_transactions where initiated_by=v_user_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.metadata->>'savings_goal_id'<>p_goal_id::text or v_existing.metadata->>'account_id'<>p_account_id::text
      or v_existing.metadata->>'amount_minor'<>p_amount_minor::text or v_existing.metadata->>'direction'<>p_direction then
      raise exception 'This request key was already used for a different savings operation.';
    end if;
    return v_existing.id;
  end if;

  select * into v_goal from public.savings_goals where id=p_goal_id and user_id=v_user_id for update;
  if not found then raise exception 'Savings goal not found.'; end if;
  select * into v_account from public.bank_accounts where id=p_account_id and user_id=v_user_id and is_internal=false for update;
  if not found or v_account.status<>'active' then raise exception 'Choose one of your active accounts.'; end if;
  select * into v_custody from public.bank_accounts where is_internal=true and account_name='Nexora Savings Custody' and status='active' for update;
  if not found then raise exception 'Savings service is temporarily unavailable.'; end if;

  select coalesce(sum(amount_minor),0)::bigint into v_goal_balance from public.savings_goal_entries where goal_id=p_goal_id and user_id=v_user_id;
  select coalesce(sum(e.amount_minor),0)::bigint into v_balance
  from public.ledger_entries e join public.ledger_transactions t on t.id=e.transaction_id
  where e.account_id=case when p_direction='contribution' then v_account.id else v_custody.id end and t.status='posted';

  if p_direction='contribution' then
    if v_goal.status<>'active' then raise exception 'This savings goal is already complete.'; end if;
    if v_balance<p_amount_minor then raise exception 'Insufficient available balance.'; end if;
    v_source:=v_account.id; v_destination:=v_custody.id; v_entry_amount:=p_amount_minor; v_tx_type:='savings_contribution';
  else
    if p_amount_minor>v_goal_balance then raise exception 'Withdrawal exceeds this goal''s available savings.'; end if;
    if v_balance<p_amount_minor then raise exception 'Savings funds are temporarily unavailable.'; end if;
    v_source:=v_custody.id; v_destination:=v_account.id; v_entry_amount:=-p_amount_minor; v_tx_type:='savings_withdrawal';
  end if;

  v_reference:='NXSG'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  insert into public.ledger_transactions(reference,transaction_type,status,description,initiated_by,idempotency_key,metadata)
  values(v_reference,v_tx_type,'pending',case when p_direction='contribution' then 'Savings goal contribution' else 'Savings goal withdrawal' end,
    v_user_id,p_idempotency_key,jsonb_build_object('savings_goal_id',p_goal_id,'account_id',p_account_id,'amount_minor',p_amount_minor,'direction',p_direction))
  returning id into v_tx_id;

  insert into public.ledger_entries(transaction_id,account_id,amount_minor,currency)
  values(v_tx_id,v_source,-p_amount_minor,v_account.currency),(v_tx_id,v_destination,p_amount_minor,v_account.currency);
  update public.ledger_transactions set status='posted',posted_at=now() where id=v_tx_id;
  insert into public.savings_goal_entries(goal_id,user_id,transaction_id,account_id,amount_minor)
  values(p_goal_id,v_user_id,v_tx_id,p_account_id,v_entry_amount);
  select coalesce(sum(amount_minor),0)::bigint into v_goal_balance from public.savings_goal_entries where goal_id=p_goal_id and user_id=v_user_id;
  update public.savings_goals set status=case when v_goal_balance>=target_minor then 'completed' else 'active' end,updated_at=now() where id=p_goal_id;
  return v_tx_id;
exception when unique_violation then
  if p_idempotency_key is not null then
    select * into v_existing from public.ledger_transactions where initiated_by=v_user_id and idempotency_key=p_idempotency_key;
    if found and v_existing.metadata->>'savings_goal_id'=p_goal_id::text and v_existing.metadata->>'account_id'=p_account_id::text
      and v_existing.metadata->>'amount_minor'=p_amount_minor::text and v_existing.metadata->>'direction'=p_direction then return v_existing.id; end if;
  end if;
  raise;
end;
$function$;

create or replace function public.create_savings_goal(p_name text,p_target_minor bigint,p_target_date date default null)
returns uuid language sql security invoker set search_path=pg_catalog,public,private as $function$
  select private.create_savings_goal($1,$2,$3);
$function$;
create or replace function public.move_savings_goal_funds(p_goal_id uuid,p_account_id uuid,p_amount_minor bigint,p_direction text,p_idempotency_key text)
returns uuid language sql security invoker set search_path=pg_catalog,public,private as $function$
  select private.move_savings_goal_funds($1,$2,$3,$4,$5);
$function$;

revoke all on function private.create_savings_goal(text,bigint,date) from public,anon;
revoke all on function private.move_savings_goal_funds(uuid,uuid,bigint,text,text) from public,anon;
grant execute on function private.create_savings_goal(text,bigint,date) to authenticated;
grant execute on function private.move_savings_goal_funds(uuid,uuid,bigint,text,text) to authenticated;
revoke all on function public.create_savings_goal(text,bigint,date) from public,anon;
revoke all on function public.move_savings_goal_funds(uuid,uuid,bigint,text,text) from public,anon;
grant execute on function public.create_savings_goal(text,bigint,date) to authenticated;
grant execute on function public.move_savings_goal_funds(uuid,uuid,bigint,text,text) to authenticated;
