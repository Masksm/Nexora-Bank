
REVOKE ALL ON FUNCTION private.admin_review_identity_document(uuid,text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_identity_document(
  p_document_id uuid,
  p_decision text,
  p_rejection_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.admin_review_identity_document(p_document_id,p_decision,p_rejection_reason);
$$;
REVOKE ALL ON FUNCTION public.admin_review_identity_document(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_identity_document(uuid,text,text) TO authenticated;
