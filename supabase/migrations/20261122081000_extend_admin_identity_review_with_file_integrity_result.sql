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
      result_summary=left(coalesce(nullif(trim(p_result_summary),''),'Sandbox provider result recorded by administrator'),500),
      updated_at=now()
  where id=p_attempt_id;
  return jsonb_build_object('success',true,'attempt_id',p_attempt_id);
end;
$$;

create or replace function public.admin_record_identity_verification_result(
  p_attempt_id uuid,
  p_document_integrity_status text,
  p_document_authenticity_status text,
  p_liveness_status text,
  p_result_summary text
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.admin_record_identity_verification_result(p_attempt_id,p_document_integrity_status,p_document_authenticity_status,p_liveness_status,p_result_summary);
$$;

revoke all on function private.admin_record_identity_verification_result(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.admin_record_identity_verification_result(uuid,text,text,text) from public,anon,authenticated;
revoke all on function private.admin_record_identity_verification_result(uuid,text,text,text,text) from public,anon;
revoke all on function public.admin_record_identity_verification_result(uuid,text,text,text,text) from public,anon;
grant execute on function private.admin_record_identity_verification_result(uuid,text,text,text,text) to authenticated;
grant execute on function public.admin_record_identity_verification_result(uuid,text,text,text,text) to authenticated;
