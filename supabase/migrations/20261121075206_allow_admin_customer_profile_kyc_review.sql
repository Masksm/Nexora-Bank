
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
CREATE POLICY profiles_select_own_or_admin
ON public.profiles FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  OR (((SELECT auth.jwt())->'app_metadata'->>'role') = 'admin')
);
