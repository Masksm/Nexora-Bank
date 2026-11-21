
DROP POLICY IF EXISTS customer_verifications_select_own ON public.customer_verifications;
DROP POLICY IF EXISTS customer_verifications_select_admin ON public.customer_verifications;
CREATE POLICY customer_verifications_select_own_or_admin
ON public.customer_verifications FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  OR (((SELECT auth.jwt())->'app_metadata'->>'role') = 'admin')
);

DROP POLICY IF EXISTS identity_documents_select_own ON public.identity_documents;
DROP POLICY IF EXISTS identity_documents_select_admin ON public.identity_documents;
CREATE POLICY identity_documents_select_own_or_admin
ON public.identity_documents FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  OR (((SELECT auth.jwt())->'app_metadata'->>'role') = 'admin')
);

CREATE INDEX IF NOT EXISTS customer_verifications_reviewed_by_idx
ON public.customer_verifications(reviewed_by)
WHERE reviewed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS identity_documents_reviewed_by_idx
ON public.identity_documents(reviewed_by)
WHERE reviewed_by IS NOT NULL;
