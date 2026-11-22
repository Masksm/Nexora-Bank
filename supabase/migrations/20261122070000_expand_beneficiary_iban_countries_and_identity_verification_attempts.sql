alter table public.beneficiaries
  drop constraint if exists beneficiaries_country_code_check,
  drop constraint if exists beneficiaries_account_details_check;

alter table public.beneficiaries
  add constraint beneficiaries_country_code_check
  check (country_code = any (array[
    'NX','US','GB','DE','FR','NL','ES','IE',
    'AT','BE','BG','CH','CY','CZ','DK','EE','FI','GR','HR','HU','IS','IT',
    'LI','LT','LU','LV','MC','MD','ME','MK','MT','NO','PL','PT','RO','RS',
    'SE','SI','SK','SM','TR','UA','VA'
  ])),
  add constraint beneficiaries_account_details_check
  check (
    (country_code = 'NX' and account_number ~ '^[0-9]{10}$') or
    (country_code = 'US' and routing_number ~ '^[0-9]{9}$' and account_number ~ '^[0-9]{4,17}$') or
    (country_code = 'GB' and sort_code ~ '^[0-9]{6}$' and account_number ~ '^[0-9]{8}$') or
    (country_code = any (array[
      'DE','FR','NL','ES','IE','AT','BE','BG','CH','CY','CZ','DK','EE','FI',
      'GR','HR','HU','IS','IT','LI','LT','LU','LV','MC','MD','ME','MK','MT',
      'NO','PL','PT','RO','RS','SE','SI','SK','SM','TR','UA','VA'
    ])) and iban ~ '^[A-Z]{2}[0-9A-Z]{13,32}$'
  );

create table if not exists public.identity_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_document_id uuid not null references public.identity_documents(id) on delete cascade,
  provider text not null check (provider in ('nexora_sandbox','persona_sandbox')),
  provider_reference text,
  provider_launch_url text,
  verification_mode text not null default 'sandbox' check (verification_mode = 'sandbox'),
  status text not null default 'pending' check (status in ('pending','approved','declined','needs_review','failed','expired')),
  document_integrity_status text not null default 'not_checked' check (document_integrity_status in ('not_checked','valid_format','invalid_format','needs_review')),
  document_authenticity_status text not null default 'not_checked' check (document_authenticity_status in ('not_checked','provider_passed','provider_failed','manual_review')),
  liveness_status text not null default 'not_started' check (liveness_status in ('not_started','passed','failed','manual_review','unavailable')),
  decision_source text not null default 'pending' check (decision_source in ('pending','provider_sandbox','staff_review')),
  result_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create index if not exists identity_verification_attempts_user_created_idx
  on public.identity_verification_attempts(user_id, created_at desc);
create index if not exists identity_verification_attempts_document_idx
  on public.identity_verification_attempts(identity_document_id, created_at desc);

alter table public.identity_verification_attempts enable row level security;

drop policy if exists identity_verification_attempts_scoped_read on public.identity_verification_attempts;
create policy identity_verification_attempts_scoped_read
  on public.identity_verification_attempts
  for select to authenticated
  using (private.can_access_customer(user_id));

revoke insert, update, delete on public.identity_verification_attempts from anon, authenticated;
grant select on public.identity_verification_attempts to authenticated;

create or replace function private.start_identity_verification(
  p_document_id uuid,
  p_provider text,
  p_provider_reference text default null,
  p_provider_launch_url text default null,
  p_result_summary text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_document public.identity_documents%rowtype;
  v_attempt public.identity_verification_attempts%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_provider not in ('nexora_sandbox','persona_sandbox') then
    raise exception 'Unsupported verification provider';
  end if;
  if p_provider_launch_url is not null and p_provider_launch_url !~ '^https://(withpersona\.com|go\.perso\.na)/' then
    raise exception 'Invalid provider launch URL';
  end if;

  select * into v_document
  from public.identity_documents
  where id = p_document_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Identity document not found';
  end if;
  if v_document.review_status = 'verified' then
    raise exception 'This identity document is already verified';
  end if;

  insert into public.identity_verification_attempts (
    user_id, identity_document_id, provider, provider_reference,
    provider_launch_url, verification_mode, status,
    document_integrity_status, document_authenticity_status,
    liveness_status, decision_source, result_summary
  ) values (
    v_user_id, p_document_id, p_provider, p_provider_reference,
    p_provider_launch_url, 'sandbox', 'pending',
    'needs_review', 'manual_review', 'not_started', 'pending',
    left(coalesce(p_result_summary, 'Verification submitted for review'), 500)
  ) returning * into v_attempt;

  update public.identity_documents
  set review_status = 'under_review'
  where id = p_document_id;

  return jsonb_build_object(
    'id', v_attempt.id,
    'status', v_attempt.status,
    'provider', v_attempt.provider,
    'launch_url', v_attempt.provider_launch_url,
    'result_summary', v_attempt.result_summary
  );
end;
$$;

create or replace function public.start_identity_verification(
  p_document_id uuid,
  p_provider text,
  p_provider_reference text default null,
  p_provider_launch_url text default null,
  p_result_summary text default null
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.start_identity_verification(
    p_document_id, p_provider, p_provider_reference,
    p_provider_launch_url, p_result_summary
  );
$$;

revoke all on function private.start_identity_verification(uuid,text,text,text,text) from public, anon;
revoke all on function public.start_identity_verification(uuid,text,text,text,text) from public, anon;
grant execute on function private.start_identity_verification(uuid,text,text,text,text) to authenticated;
grant execute on function public.start_identity_verification(uuid,text,text,text,text) to authenticated;

create or replace function private.sync_identity_verification_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.review_status is distinct from old.review_status
     and new.review_status in ('verified','rejected') then
    update public.identity_verification_attempts
    set status = case when new.review_status = 'verified' then 'approved' else 'declined' end,
        document_authenticity_status = 'manual_review',
        decision_source = 'staff_review',
        reviewed_at = now(),
        reviewed_by = new.reviewed_by,
        result_summary = case
          when new.review_status = 'verified' then 'Approved after staff identity review'
          else coalesce(new.rejection_reason, 'Declined after staff identity review')
        end,
        updated_at = now()
    where id = (
      select id from public.identity_verification_attempts
      where identity_document_id = new.id and status in ('pending','needs_review')
      order by created_at desc limit 1
    );
  end if;
  return new;
end;
$$;

drop trigger if exists sync_identity_verification_review on public.identity_documents;
create trigger sync_identity_verification_review
after update of review_status on public.identity_documents
for each row execute function private.sync_identity_verification_review();

revoke all on function private.sync_identity_verification_review() from public, anon, authenticated;
