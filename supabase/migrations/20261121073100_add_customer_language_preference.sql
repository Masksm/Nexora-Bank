ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'auto';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_preferred_language_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_preferred_language_check
      CHECK (preferred_language IN ('auto', 'en', 'es', 'fr', 'pt', 'de'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.preferred_language IS
'Customer language preference. auto uses the browser language when supported, then country fallback.';
