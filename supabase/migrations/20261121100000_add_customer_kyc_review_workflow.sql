
ALTER TABLE public.identity_documents
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.identity_documents
  ADD CONSTRAINT identity_documents_rejection_reason_length
  CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 500);

CREATE TABLE IF NOT EXISTS public.customer_verifications (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','submitted','under_review','verified','rejected')),
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_verifications_rejection_reason_length
    CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 500)
);

ALTER TABLE public.customer_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_verifications FROM PUBLIC, anon;
GRANT SELECT ON public.customer_verifications TO authenticated;

CREATE POLICY customer_verifications_select_own
ON public.customer_verifications FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY customer_verifications_select_admin
ON public.customer_verifications FOR SELECT TO authenticated
USING (((SELECT auth.jwt())->'app_metadata'->>'role') = 'admin');

CREATE POLICY identity_documents_select_admin
ON public.identity_documents FOR SELECT TO authenticated
USING (((SELECT auth.jwt())->'app_metadata'->>'role') = 'admin');

CREATE POLICY identity_docs_read_admin
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'identity-documents'
  AND (((SELECT auth.jwt())->'app_metadata'->>'role') = 'admin')
);

CREATE INDEX IF NOT EXISTS identity_documents_user_type_uploaded_idx
ON public.identity_documents(user_id, document_type, uploaded_at DESC);

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.sync_customer_verification_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.customer_verifications(user_id,status,submitted_at,updated_at)
  VALUES (NEW.user_id,'submitted',now(),now())
  ON CONFLICT (user_id) DO UPDATE
    SET status='submitted',
        rejection_reason=NULL,
        submitted_at=now(),
        reviewed_at=NULL,
        reviewed_by=NULL,
        updated_at=now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.sync_customer_verification_submission() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER identity_document_submission_status
AFTER INSERT ON public.identity_documents
FOR EACH ROW EXECUTE FUNCTION private.sync_customer_verification_submission();

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
  v_pending integer;
  v_rejected integer;
  v_before jsonb;
BEGIN
  IF v_admin IS NULL OR ((SELECT auth.jwt())->'app_metadata'->>'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Administrator access required.';
  END IF;
  IF p_decision NOT IN ('under_review','verified','rejected') THEN
    RAISE EXCEPTION 'Choose a valid document review decision.';
  END IF;
  v_reason := NULLIF(trim(p_rejection_reason),'');
  IF p_decision='rejected' AND (v_reason IS NULL OR char_length(v_reason)<8 OR char_length(v_reason)>500) THEN
    RAISE EXCEPTION 'A rejection reason between 8 and 500 characters is required.';
  END IF;

  SELECT * INTO v_doc
  FROM public.identity_documents
  WHERE id=p_document_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Identity document was not found.'; END IF;
  IF v_doc.review_status NOT IN ('submitted','under_review') THEN
    RAISE EXCEPTION 'This document has already been reviewed. Ask the customer to submit a new document if another review is needed.';
  END IF;

  v_before := jsonb_build_object('review_status',v_doc.review_status,'rejection_reason',v_doc.rejection_reason);
  UPDATE public.identity_documents
  SET review_status=p_decision,
      rejection_reason=CASE WHEN p_decision='rejected' THEN v_reason ELSE NULL END,
      reviewed_at=now(),
      reviewed_by=v_admin
  WHERE id=v_doc.id;

  WITH latest AS (
    SELECT DISTINCT ON (document_type)
      document_type, review_status, rejection_reason
    FROM public.identity_documents
    WHERE user_id=v_doc.user_id
    ORDER BY document_type, uploaded_at DESC, id DESC
  )
  SELECT
    count(*) FILTER (WHERE review_status IN ('submitted','under_review'))::integer,
    count(*) FILTER (WHERE review_status='rejected')::integer
  INTO v_pending,v_rejected
  FROM latest;

  IF v_rejected>0 THEN
    v_status := 'rejected';
    SELECT rejection_reason INTO v_reason
    FROM (
      SELECT DISTINCT ON (document_type) document_type,review_status,rejection_reason,uploaded_at
      FROM public.identity_documents
      WHERE user_id=v_doc.user_id
      ORDER BY document_type,uploaded_at DESC,id DESC
    ) latest
    WHERE review_status='rejected'
    ORDER BY uploaded_at DESC
    LIMIT 1;
  ELSIF v_pending>0 THEN
    v_status := CASE WHEN p_decision='under_review' THEN 'under_review' ELSE 'submitted' END;
    v_reason := NULL;
  ELSE
    v_status := 'verified';
    v_reason := NULL;
  END IF;

  INSERT INTO public.customer_verifications(user_id,status,rejection_reason,submitted_at,reviewed_at,reviewed_by,updated_at)
  VALUES(v_doc.user_id,v_status,v_reason,COALESCE((SELECT submitted_at FROM public.customer_verifications WHERE user_id=v_doc.user_id),v_doc.uploaded_at),
    CASE WHEN v_status IN ('verified','rejected') THEN now() ELSE NULL END,
    CASE WHEN v_status IN ('verified','rejected') THEN v_admin ELSE NULL END,now())
  ON CONFLICT(user_id) DO UPDATE SET
    status=EXCLUDED.status,
    rejection_reason=EXCLUDED.rejection_reason,
    reviewed_at=EXCLUDED.reviewed_at,
    reviewed_by=EXCLUDED.reviewed_by,
    updated_at=now();

  INSERT INTO public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,reason,before_state,after_state)
  VALUES(v_admin,'identity_document_'||p_decision,'identity_document',v_doc.id::text,
    CASE WHEN p_decision='rejected' THEN v_reason ELSE 'Identity document review decision: '||p_decision END,
    v_before,
    jsonb_build_object('review_status',p_decision,'customer_kyc_status',v_status,'customer_user_id',v_doc.user_id));

  RETURN v_status;
END;
$$;
REVOKE ALL ON FUNCTION private.admin_review_identity_document(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.admin_review_identity_document(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_identity_document(
  p_document_id uuid,
  p_decision text,
  p_rejection_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.admin_review_identity_document(p_document_id,p_decision,p_rejection_reason);
$$;
REVOKE ALL ON FUNCTION public.admin_review_identity_document(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_identity_document(uuid,text,text) TO authenticated;
