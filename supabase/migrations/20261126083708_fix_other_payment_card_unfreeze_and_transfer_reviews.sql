-- Fix manual Other payment instructions, transfer review reasons and
-- require administrator approval before a frozen virtual card is reactivated.

create or replace function private.validate_supported_crypto_payment_address()
returns trigger language plpgsql set search_path = ''
as $$
declare v_asset text := upper(trim(new.cryptocurrency)); v_network text := upper(trim(new.network)); v_address text := trim(new.wallet_address);
begin
  if v_asset='OTHER' and v_network='MANUAL' then
    if new.platform_name is null or length(trim(new.platform_name)) not between 2 and 80 then
      raise exception 'For Other payment methods, enter a platform or exchange name between 2 and 80 characters.';
    end if;
    if length(v_address) not between 1 and 256 then raise exception 'Enter valid payment destination details for the selected platform.'; end if;
  elsif v_asset='USDT' and v_network='TRON (TRC20)' then
    if v_address !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$' then raise exception 'For USDT on TRON (TRC20), enter a valid-format TRON address beginning with T (34 Base58 characters).'; end if;
  elsif v_asset='BTC' and v_network='BITCOIN' then
    if v_address !~ '^(bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$' then raise exception 'For BTC on Bitcoin, enter a mainnet legacy, P2SH or bech32 address (1..., 3... or bc1...).'; end if;
  else raise exception 'Unsupported payment method/network. Use USDT on TRON, BTC on Bitcoin, or Other with a named platform and manual destination.';
  end if;
  return new;
end; $$;

create or replace function private.create_virtual_card(p_account_id uuid)
returns uuid language plpgsql security definer set search_path='pg_catalog','public','extensions'
as $$
declare v_user uuid:=auth.uid(); v_account public.bank_accounts%rowtype; v_card_id uuid; v_name text;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select * into v_account from public.bank_accounts where id=p_account_id and user_id=v_user and is_internal=false;
  if not found or v_account.status<>'active' then raise exception 'An active customer account is required.'; end if;
  if exists(select 1 from public.virtual_cards where user_id=v_user) then raise exception 'You can have only one virtual card.'; end if;
  select coalesce(nullif(trim(p.display_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'NEXORA CUSTOMER')
  into v_name from public.profiles p where p.user_id=v_user;
  insert into public.virtual_cards(user_id,account_id,cardholder_name,network,last4,expiry_month,expiry_year,status)
  values(v_user,p_account_id,upper(v_name),'visa',lpad((floor(random()*10000))::integer::text,4,'0'),extract(month from now())::integer,extract(year from now())::integer+4,'frozen')
  returning id into v_card_id;
  return v_card_id;
end; $$;

create table if not exists public.virtual_card_unfreeze_requests (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.virtual_cards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_reason text,
  constraint virtual_card_unfreeze_review_reason_length check(review_reason is null or length(trim(review_reason)) between 8 and 500)
);
create unique index if not exists virtual_card_one_pending_unfreeze_idx on public.virtual_card_unfreeze_requests(card_id) where status='pending';
create index if not exists virtual_card_unfreeze_requests_user_idx on public.virtual_card_unfreeze_requests(user_id,requested_at desc);
alter table public.virtual_card_unfreeze_requests enable row level security;
drop policy if exists virtual_card_unfreeze_customer_read on public.virtual_card_unfreeze_requests;
create policy virtual_card_unfreeze_customer_read on public.virtual_card_unfreeze_requests for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists virtual_card_unfreeze_staff_read on public.virtual_card_unfreeze_requests;
create policy virtual_card_unfreeze_staff_read on public.virtual_card_unfreeze_requests for select to authenticated using(private.is_staff_admin() and private.can_access_customer(user_id));
revoke all on public.virtual_card_unfreeze_requests from anon,authenticated;
grant select on public.virtual_card_unfreeze_requests to authenticated;

create or replace function private.set_virtual_card_status(p_card_id uuid,p_status text)
returns void language plpgsql security definer set search_path='pg_catalog','public'
as $$
declare v_card public.virtual_cards%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if p_status not in ('active','frozen') then raise exception 'Card status must be active or frozen.'; end if;
  select * into v_card from public.virtual_cards where id=p_card_id and user_id=auth.uid() for update;
  if not found then raise exception 'Card not found.'; end if;
  if p_status='active' then raise exception 'Unfreezing requires administrator approval. Submit an unfreeze request instead.'; end if;
  if v_card.status in ('cancelled','expired') then raise exception 'This card cannot be changed.'; end if;
  update public.virtual_cards set status='frozen' where id=p_card_id and user_id=auth.uid();
end; $$;

create or replace function private.request_virtual_card_unfreeze(p_card_id uuid)
returns uuid language plpgsql security definer set search_path='pg_catalog','public'
as $$
declare v_card public.virtual_cards%rowtype; v_request uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_card from public.virtual_cards where id=p_card_id and user_id=auth.uid() for update;
  if not found then raise exception 'Card not found.'; end if;
  if v_card.status<>'frozen' then raise exception 'Only a frozen card can be submitted for unfreeze review.'; end if;
  if exists(select 1 from public.virtual_card_unfreeze_requests r where r.card_id=p_card_id and r.status='pending') then raise exception 'An unfreeze request is already awaiting administrator review.'; end if;
  insert into public.virtual_card_unfreeze_requests(card_id,user_id) values(p_card_id,auth.uid()) returning id into v_request;
  insert into public.notifications(user_id,title,body,category) values(auth.uid(),'Card unfreeze request submitted','Your virtual card will remain frozen until an administrator reviews your request.','security');
  return v_request;
end; $$;

create or replace function public.request_virtual_card_unfreeze(p_card_id uuid)
returns uuid language sql set search_path=''
as $$ select private.request_virtual_card_unfreeze(p_card_id); $$;
revoke all on function public.request_virtual_card_unfreeze(uuid) from public,anon;
grant execute on function public.request_virtual_card_unfreeze(uuid) to authenticated;

create or replace function public.admin_review_virtual_card_unfreeze(p_request_id uuid,p_decision text,p_reason text)
returns text language plpgsql security definer set search_path='pg_catalog','public','private'
as $$
declare v_admin uuid:=auth.uid(); v_request public.virtual_card_unfreeze_requests%rowtype; v_card public.virtual_cards%rowtype; v_new_status text;
begin
  if v_admin is null or not private.is_staff_admin() then raise exception 'Administrator access required.'; end if;
  if p_decision not in ('approve','reject') then raise exception 'Choose approve or reject.'; end if;
  if length(trim(coalesce(p_reason,'')))<8 or length(trim(p_reason))>500 then raise exception 'A review reason of at least 8 characters is required.'; end if;
  select * into v_request from public.virtual_card_unfreeze_requests where id=p_request_id for update;
  if not found or v_request.status<>'pending' then raise exception 'This card request is no longer awaiting review.'; end if;
  if not private.can_access_customer(v_request.user_id) then raise exception 'This customer is outside your assigned accounts.'; end if;
  select * into v_card from public.virtual_cards where id=v_request.card_id and user_id=v_request.user_id for update;
  if not found or v_card.status<>'frozen' then raise exception 'The card is no longer eligible for unfreeze approval.'; end if;
  v_new_status:=case when p_decision='approve' then 'active' else 'frozen' end;
  update public.virtual_card_unfreeze_requests set status=case when p_decision='approve' then 'approved' else 'rejected' end,reviewed_at=now(),reviewed_by=v_admin,review_reason=trim(p_reason) where id=p_request_id;
  if p_decision='approve' then update public.virtual_cards set status='active' where id=v_card.id; end if;
  insert into public.notifications(user_id,title,body,category) values(v_request.user_id,
    case when p_decision='approve' then 'Virtual card unfrozen' else 'Card unfreeze request declined' end,
    case when p_decision='approve' then 'Your card has been approved and is now active.' else 'Your card remains frozen. Review the administrator reason in your card settings.' end,'security');
  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,reason,before_state,after_state)
  values(v_admin,'virtual_card_unfreeze_'||p_decision,'virtual_card',v_card.id::text,trim(p_reason),
    jsonb_build_object('card_status','frozen','request_status','pending'),
    jsonb_build_object('card_status',v_new_status,'request_status',case when p_decision='approve' then 'approved' else 'rejected' end));
  return v_new_status;
end; $$;
revoke all on function public.admin_review_virtual_card_unfreeze(uuid,text,text) from public,anon;
grant execute on function public.admin_review_virtual_card_unfreeze(uuid,text,text) to authenticated;

create or replace function public.admin_review_external_transfer(p_request_id uuid,p_decision text,p_reason text)
returns table(reference text,status text,ledger_transaction_id uuid)
language plpgsql security definer set search_path='pg_catalog','public','private'
as $$
#variable_conflict use_column
declare
  v_admin uuid:=auth.uid(); v_request public.external_transfer_requests%rowtype; v_source public.bank_accounts%rowtype;
  v_treasury public.bank_accounts%rowtype; v_balance bigint; v_tx_id uuid; v_tx_reference text; v_new_status text;
begin
  if v_admin is null or not private.is_staff_admin() then raise exception 'Administrator access required.'; end if;
  if p_decision not in ('approve','reject') then raise exception 'Decision must be approve or reject.'; end if;
  if length(trim(coalesce(p_reason,'')))<8 or length(trim(p_reason))>240 then raise exception 'A review reason of at least 8 characters is required (maximum 240).'; end if;
  select * into v_request from public.external_transfer_requests etr where etr.id=p_request_id for update;
  if not found then raise exception 'International transfer request not found.'; end if;
  if v_request.status<>'pending' then raise exception 'This international transfer has already been reviewed.'; end if;
  if not private.can_access_customer(v_request.user_id) then raise exception 'This customer is outside your assigned accounts.'; end if;
  if p_decision='approve' then
    select * into v_source from public.bank_accounts ba where ba.id=v_request.source_account_id and ba.user_id=v_request.user_id for update;
    if not found or v_source.status<>'active' or v_source.is_internal then raise exception 'The source account is no longer available.'; end if;
    if v_source.currency<>v_request.currency or v_source.currency<>'USD' then raise exception 'The source account currency does not match this transfer.'; end if;
    select * into v_treasury from public.bank_accounts treasury where treasury.is_internal=true and treasury.status='active' and treasury.currency=v_request.currency and treasury.account_name='Nexora Treasury' limit 1 for update;
    if not found then raise exception 'The USD treasury account is not configured.'; end if;
    select coalesce(sum(e.amount_minor),0)::bigint into v_balance from public.ledger_entries e join public.ledger_transactions lt on lt.id=e.transaction_id where e.account_id=v_source.id and lt.status='posted';
    if v_balance<v_request.amount_minor then raise exception 'Available balance is no longer sufficient. Transfer cannot be approved.'; end if;
    v_tx_reference:=v_request.reference;
    insert into public.ledger_transactions(reference,transaction_type,status,description,initiated_by,metadata)
    values(v_tx_reference,'transfer','pending','International transfer to '||v_request.beneficiary_name,v_request.user_id,
      jsonb_build_object('external_transfer_request_id',v_request.id,'external_transfer_reference',v_request.reference,
      'source_account_id',v_source.id,'source_account',v_source.account_number,'destination_country',v_request.destination_country,
      'beneficiary_name',v_request.beneficiary_name,'bank_name',v_request.bank_name,'destination_account_number',v_request.account_number,
      'routing_number',v_request.routing_number,'sort_code',v_request.sort_code,'iban',v_request.iban,'bic',v_request.bic,
      'amount_minor',v_request.amount_minor,'currency',v_request.currency,'external_execution','not_connected',
      'review_required',false,'review_decision','approve','review_reason',trim(p_reason),'reviewed_by',v_admin,'reviewed_at',now()))
    returning id into v_tx_id;
    insert into public.ledger_entries(transaction_id,account_id,amount_minor,currency)
    values(v_tx_id,v_source.id,-v_request.amount_minor,v_request.currency),(v_tx_id,v_treasury.id,v_request.amount_minor,v_request.currency);
    update public.ledger_transactions tx set status='posted',posted_at=now() where tx.id=v_tx_id;
    v_new_status:='approved';
    update public.external_transfer_requests etr set status=v_new_status,admin_reason=trim(p_reason),reviewed_by=v_admin,reviewed_at=now(),ledger_transaction_id=v_tx_id where etr.id=v_request.id;
    insert into public.notifications(user_id,title,body,category) values(v_request.user_id,'International transfer approved','Your international transfer request has been approved and the amount has been debited from your account.','transactions');
  else
    v_new_status:='rejected';
    update public.external_transfer_requests etr set status=v_new_status,admin_reason=trim(p_reason),reviewed_by=v_admin,reviewed_at=now() where etr.id=v_request.id;
    insert into public.notifications(user_id,title,body,category) values(v_request.user_id,'International transfer declined','Your international transfer request was declined after administrator review. No amount was debited from your account.','transactions');
  end if;
  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,reason,before_state,after_state)
  values(v_admin,'external_transfer_'||p_decision,'external_transfer_request',v_request.id::text,trim(p_reason),
    jsonb_build_object('status',v_request.status,'reference',v_request.reference),
    jsonb_build_object('status',v_new_status,'ledger_transaction_id',v_tx_id,'ledger_posted',p_decision='approve'));
  return query select v_request.reference,v_new_status,v_tx_id;
end; $$;
revoke all on function public.admin_review_external_transfer(uuid,text,text) from public,anon;
grant execute on function public.admin_review_external_transfer(uuid,text,text) to authenticated;
