create unique index if not exists identity_verification_one_pending_per_document_idx
  on public.identity_verification_attempts(identity_document_id)
  where status = 'pending';

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
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_provider not in ('nexora_sandbox','persona_sandbox') then raise exception 'Unsupported verification provider'; end if;
  if p_provider_launch_url is not null and p_provider_launch_url !~ '^https://(withpersona\.com|go\.perso\.na)/' then raise exception 'Invalid provider launch URL'; end if;

  select * into v_document from public.identity_documents
  where id = p_document_id and user_id = v_user_id for update;
  if not found then raise exception 'Identity document not found'; end if;
  if v_document.review_status = 'verified' then raise exception 'This identity document is already verified'; end if;

  select * into v_attempt from public.identity_verification_attempts
  where identity_document_id = p_document_id and user_id = v_user_id and status = 'pending'
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('id',v_attempt.id,'status',v_attempt.status,'provider',v_attempt.provider,'launch_url',v_attempt.provider_launch_url,'result_summary',v_attempt.result_summary);
  end if;

  insert into public.identity_verification_attempts (
    user_id, identity_document_id, provider, provider_reference, provider_launch_url,
    verification_mode, status, document_integrity_status, document_authenticity_status,
    liveness_status, decision_source, result_summary
  ) values (
    v_user_id, p_document_id, p_provider, p_provider_reference, p_provider_launch_url,
    'sandbox', 'pending', 'needs_review', 'manual_review', 'not_started', 'pending',
    left(coalesce(p_result_summary, 'Verification submitted for review'), 500)
  ) returning * into v_attempt;

  update public.identity_documents set review_status = 'under_review' where id = p_document_id;
  return jsonb_build_object('id',v_attempt.id,'status',v_attempt.status,'provider',v_attempt.provider,'launch_url',v_attempt.provider_launch_url,'result_summary',v_attempt.result_summary);
end;
$$;
