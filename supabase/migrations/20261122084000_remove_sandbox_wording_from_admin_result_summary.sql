create or replace function private.admin_record_identity_verification_result(
  p_attempt_id uuid,
  p_document_integrity_status text,
  p_document_authenticity_status text,
  p_liveness_status text,
  p_result_summary text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_attempt public.identity_verification_attempts%rowtype;
begin
  if not (private.is_staff_admin() or private.is_super_admin()) then raise exception 'Administrator access required'; end if;
  if p_document_integrity_status is null or p_document_integrity_status not in ('not_checked','valid_format','invalid_format','needs_review') then raise exception 'Invalid file integrity result'; end if;
  if p_document_authenticity_status is null or p_document_authenticity_status not in ('not_checked','provider_passed','provider_failed','manual_review') then raise exception 'Invalid document verification result'; end if;
  if p_liveness_status is null or p_liveness_status not in ('not_started','passed','failed','manual_review','unavailable') then raise exception 'Invalid liveness result'; end if;

  select * into v_attempt from public.identity_verification_attempts where id=p_attempt_id for update;
  if not found then raise exception 'Verification attempt not found'; end if;
  if not private.can_access_customer(v_attempt.user_id) then raise exception 'Customer is outside your assigned scope'; end if;
  if v_attempt.status not in ('pending','needs_review') then raise exception 'This verification attempt is already closed'; end if;

  update public.identity_verification_attempts
  set document_integrity_status=p_document_integrity_status,
      document_authenticity_status=p_document_authenticity_status,
      liveness_status=p_liveness_status,
      decision_source='provider_sandbox',
      result_summary=left(coalesce(nullif(trim(p_result_summary),''),'Provider result recorded by administrator'),500),
      updated_at=now()
  where id=p_attempt_id;

  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,reason,before_state,after_state)
  values (
    auth.uid(),'record_identity_verification_sandbox_result','identity_verification_attempt',p_attempt_id::text,
    'Provider verification results recorded',
    jsonb_build_object('document_integrity_status',v_attempt.document_integrity_status,'document_authenticity_status',v_attempt.document_authenticity_status,'liveness_status',v_attempt.liveness_status),
    jsonb_build_object('document_integrity_status',p_document_integrity_status,'document_authenticity_status',p_document_authenticity_status,'liveness_status',p_liveness_status,'result_summary',left(coalesce(p_result_summary,''),500))
  );
  return jsonb_build_object('success',true,'attempt_id',p_attempt_id);
end;
$$;
