
CREATE OR REPLACE FUNCTION private.recompute_customer_verification(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total integer;
  v_pending integer;
  v_rejected integer;
  v_under_review integer;
  v_status text;
  v_reason text;
  v_submitted_at timestamptz;
  v_reviewed_at timestamptz;
  v_reviewed_by uuid;
BEGIN
  WITH latest AS (
    SELECT DISTINCT ON (document_type)
      document_type,review_status,rejection_reason,uploaded_at,reviewed_at,reviewed_by
    FROM public.identity_documents
    WHERE user_id=p_user_id
    ORDER BY document_type,uploaded_at DESC,id DESC
  )
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE review_status IN ('submitted','under_review'))::integer,
    count(*) FILTER (WHERE review_status='rejected')::integer,
    count(*) FILTER (WHERE review_status='under_review')::integer,
    min(uploaded_at)
  INTO v_total,v_pending,v_rejected,v_under_review,v_submitted_at
  FROM latest;

  IF v_total=0 THEN
    v_status:='not_started';
    v_reason:=NULL;
    v_reviewed_at:=NULL;
    v_reviewed_by:=NULL;
    v_submitted_at:=NULL;
  ELSIF v_rejected>0 THEN
    v_status:='rejected';
    SELECT rejection_reason,reviewed_at,reviewed_by
    INTO v_reason,v_reviewed_at,v_reviewed_by
    FROM (
      SELECT DISTINCT ON (document_type)
        document_type,review_status,rejection_reason,uploaded_at,reviewed_at,reviewed_by
      FROM public.identity_documents
      WHERE user_id=p_user_id
      ORDER BY document_type,uploaded_at DESC,id DESC
    ) latest
    WHERE review_status='rejected'
    ORDER BY uploaded_at DESC LIMIT 1;
  ELSIF v_pending>0 THEN
    v_status:=CASE WHEN v_under_review>0 THEN 'under_review' ELSE 'submitted' END;
    v_reason:=NULL;
    v_reviewed_at:=NULL;
    v_reviewed_by:=NULL;
  ELSE
    v_status:='verified';
    v_reason:=NULL;
    SELECT reviewed_at,reviewed_by INTO v_reviewed_at,v_reviewed_by
    FROM (
      SELECT DISTINCT ON (document_type)
        document_type,review_status,uploaded_at,reviewed_at,reviewed_by
      FROM public.identity_documents
      WHERE user_id=p_user_id
      ORDER BY document_type,uploaded_at DESC,id DESC
    ) latest
    ORDER BY reviewed_at DESC NULLS LAST LIMIT 1;
  END IF;

  INSERT INTO public.customer_verifications(user_id,status,rejection_reason,submitted_at,reviewed_at,reviewed_by,updated_at)
  VALUES(p_user_id,v_status,v_reason,v_submitted_at,v_reviewed_at,v_reviewed_by,now())
  ON CONFLICT(user_id) DO UPDATE SET
    status=EXCLUDED.status,
    rejection_reason=EXCLUDED.rejection_reason,
    submitted_at=EXCLUDED.submitted_at,
    reviewed_at=EXCLUDED.reviewed_at,
    reviewed_by=EXCLUDED.reviewed_by,
    updated_at=now();
  RETURN v_status;
END;
$$;
REVOKE ALL ON FUNCTION private.recompute_customer_verification(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.sync_customer_verification_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.recompute_customer_verification(NEW.user_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.sync_customer_verification_submission() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.sync_customer_verification_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.recompute_customer_verification(OLD.user_id);
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION private.sync_customer_verification_deletion() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS identity_document_submission_status ON public.identity_documents;
CREATE TRIGGER identity_document_submission_status
AFTER INSERT ON public.identity_documents
FOR EACH ROW EXECUTE FUNCTION private.sync_customer_verification_submission();

DROP TRIGGER IF EXISTS identity_document_deletion_status ON public.identity_documents;
CREATE TRIGGER identity_document_deletion_status
AFTER DELETE ON public.identity_documents
FOR EACH ROW EXECUTE FUNCTION private.sync_customer_verification_deletion();

CREATE OR REPLACE FUNCTION private.admin_review_identity_document(
  p_document_id uuid,
  p_decision text,
  p_rejection_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_doc public.identity_documents%ROWTYPE;
  v_status text;
  v_reason text;
  v_before jsonb;
BEGIN
  IF v_admin IS NULL OR ((SELECT auth.jwt())->'app_metadata'->>'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Administrator access required.';
  END IF;
  IF p_decision NOT IN ('under_review','verified','rejected') THEN
    RAISE EXCEPTION 'Choose a valid document review decision.';
  END IF;
  v_reason:=NULLIF(trim(p_rejection_reason),'');
  IF p_decision='rejected' AND (v_reason IS NULL OR char_length(v_reason)<8 OR char_length(v_reason)>500) THEN
    RAISE EXCEPTION 'A rejection reason between 8 and 500 characters is required.';
  END IF;
  SELECT * INTO v_doc FROM public.identity_documents WHERE id=p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Identity document was not found.'; END IF;
  IF v_doc.review_status NOT IN ('submitted','under_review') THEN
    RAISE EXCEPTION 'This document has already been reviewed. Ask the customer to submit a new document if another review is needed.';
  END IF;

  v_before:=jsonb_build_object('review_status',v_doc.review_status,'rejection_reason',v_doc.rejection_reason);
  UPDATE public.identity_documents
  SET review_status=p_decision,
      rejection_reason=CASE WHEN p_decision='rejected' THEN v_reason ELSE NULL END,
      reviewed_at=now(),reviewed_by=v_admin
  WHERE id=v_doc.id;

  v_status:=private.recompute_customer_verification(v_doc.user_id);
  SELECT rejection_reason INTO v_reason
  FROM public.customer_verifications WHERE user_id=v_doc.user_id;

  IF v_status='verified' THEN
    INSERT INTO public.notifications(user_id,title,body,category)
    VALUES(v_doc.user_id,'Identity review completed','Your submitted identity documents passed Nexora internal review.','security');
  ELSIF v_status='rejected' THEN
    INSERT INTO public.notifications(user_id,title,body,category)
    VALUES(v_doc.user_id,'Identity document action required',
      'Your identity submission needs attention: '||COALESCE(v_reason,'Please review the document feedback in account settings.'),
      'security');
  END IF;

  INSERT INTO public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,reason,before_state,after_state)
  VALUES(v_admin,'identity_document_'||p_decision,'identity_document',v_doc.id::text,
    CASE WHEN p_decision='rejected' THEN COALESCE(p_rejection_reason,'') ELSE 'Identity document review decision: '||p_decision END,
    v_before,jsonb_build_object('review_status',p_decision,'customer_kyc_status',v_status,'customer_user_id',v_doc.user_id));
  RETURN v_status;
END;
$$;
