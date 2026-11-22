create or replace function private.admin_record_identity_verification_result(
  p_attempt_id uuid,
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
  if p_document_authenticity_status not in ('provider_passed','provider_failed','manual_review') then raise exception 'Invalid document verification result'; end if;
  if p_liveness_status not in ('passed','failed','manual_review','unavailable') then raise exception 'Invalid liveness result'; end if;

  select * into v_attempt from public.identity_verification_attempts where id=p_attempt_id for update;
  if not found then raise exception 'Verification attempt not found'; end if;
  if not private.can_access_customer(v_attempt.user_id) then raise exception 'Customer is outside your assigned scope'; end if;
  if v_attempt.status not in ('pending','needs_review') then raise exception 'This verification attempt is already closed'; end if;

  update public.identity_verification_attempts
  set document_authenticity_status=p_document_authenticity_status,
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
  p_document_authenticity_status text,
  p_liveness_status text,
  p_result_summary text
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.admin_record_identity_verification_result(p_attempt_id,p_document_authenticity_status,p_liveness_status,p_result_summary);
$$;

revoke all on function private.admin_record_identity_verification_result(uuid,text,text,text) from public,anon;
revoke all on function public.admin_record_identity_verification_result(uuid,text,text,text) from public,anon;
grant execute on function private.admin_record_identity_verification_result(uuid,text,text,text) to authenticated;
grant execute on function public.admin_record_identity_verification_result(uuid,text,text,text) to authenticated;

create or replace function private.sync_identity_verification_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.review_status is distinct from old.review_status and new.review_status in ('verified','rejected') then
    update public.identity_verification_attempts
    set status=case when new.review_status='verified' then 'approved' else 'declined' end,
        document_authenticity_status=case when document_authenticity_status in ('provider_passed','provider_failed') then document_authenticity_status else 'manual_review' end,
        decision_source='staff_review',
        reviewed_at=now(),
        reviewed_by=new.reviewed_by,
        result_summary=case when new.review_status='verified' then 'Approved after staff identity review' else coalesce(new.rejection_reason,'Declined after staff identity review') end,
        updated_at=now()
    where id=(select id from public.identity_verification_attempts where identity_document_id=new.id and status in ('pending','needs_review') order by created_at desc limit 1);
  end if;
  return new;
end;
$$;
