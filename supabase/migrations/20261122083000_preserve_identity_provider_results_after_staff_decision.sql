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
        result_summary=left(concat_ws(' | ',nullif(result_summary,''),case when new.review_status='verified' then 'Final staff decision: approved' else 'Final staff decision: rejected. '||coalesce(new.rejection_reason,'') end),500),
        updated_at=now()
    where id=(select id from public.identity_verification_attempts where identity_document_id=new.id and status in ('pending','needs_review') order by created_at desc limit 1);
  end if;
  return new;
end;
$$;
