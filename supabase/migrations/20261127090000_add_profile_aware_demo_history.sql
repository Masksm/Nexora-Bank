-- Add a profile-aware overload for synthetic customer transaction history.
-- The original four-argument generator remains responsible for access checks,
-- ledger balancing, date distribution, and final balance calculations.
CREATE OR REPLACE FUNCTION private.admin_generate_demo_history(
  p_account_id uuid,
  p_target_balance_minor bigint,
  p_start_year integer DEFAULT 2019,
  p_pairs integer DEFAULT 24,
  p_gender text DEFAULT 'unspecified',
  p_age_group text DEFAULT '25_34',
  p_lifestyle text DEFAULT 'balanced'
)
RETURNS TABLE(generated_transactions integer, final_balance_minor bigint, opening_reference text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private', 'extensions'
AS $function$
DECLARE
  v_result record;
  v_credit_descriptions text[];
  v_debit_descriptions text[];
BEGIN
  IF p_gender NOT IN ('male', 'female', 'unspecified') THEN
    RAISE EXCEPTION 'Choose a valid customer gender profile.';
  END IF;
  IF p_age_group NOT IN ('18_24', '25_34', '35_44', '45_54', '55_plus') THEN
    RAISE EXCEPTION 'Choose a valid customer age range.';
  END IF;
  IF p_lifestyle NOT IN ('student', 'early_career', 'professional', 'business_owner', 'family', 'retired', 'balanced') THEN
    RAISE EXCEPTION 'Choose a valid lifestyle profile.';
  END IF;

  SELECT * INTO v_result
  FROM private.admin_generate_demo_history(
    p_account_id, p_target_balance_minor, p_start_year, p_pairs
  );

  CASE p_lifestyle
    WHEN 'student' THEN
      v_credit_descriptions := ARRAY['Student allowance','Scholarship payment','Part-time wages','Freelance project payment','Family support transfer','Internship stipend','Tutoring income','Education grant'];
      v_debit_descriptions := ARRAY['Tuition payment','Textbooks and study materials','Campus accommodation','Mobile data bundle','Public transportation','Groceries and meals','Printing and stationery','Streaming subscription','Study software subscription','Coffee shop purchase'];
    WHEN 'early_career' THEN
      v_credit_descriptions := ARRAY['Monthly salary','Payroll payment','Performance bonus','Freelance project payment','Expense reimbursement','Consulting fee received','Commission received','Savings interest'];
      v_debit_descriptions := ARRAY['Residential rent','Public transportation','Ride-hailing payment','Grocery shopping','Restaurant payment','Mobile airtime and data','Gym membership','Streaming subscription','Clothing purchase','Professional course fee'];
    WHEN 'professional' THEN
      v_credit_descriptions := ARRAY['Monthly salary','Executive bonus','Consulting fee received','Dividend payment','Investment distribution','Professional services income','Expense reimbursement','Interest credit'];
      v_debit_descriptions := ARRAY['Residential rent','Mortgage payment','Insurance premium','Restaurant payment','Flight booking','Hotel accommodation','Vehicle maintenance','Investment contribution','Professional membership','Utility payment'];
    WHEN 'business_owner' THEN
      v_credit_descriptions := ARRAY['Business revenue','Client invoice settlement','Point of sale settlement','Marketplace payout','Contract milestone payment','Wholesale payment','Service invoice paid','Commercial rent received'];
      v_debit_descriptions := ARRAY['Supplier invoice','Inventory purchase','Staff payroll','Commercial rent','Business utilities','Marketing campaign','Courier and delivery','Tax payment','Equipment purchase','Business insurance premium'];
    WHEN 'family' THEN
      v_credit_descriptions := ARRAY['Monthly salary','Second household income','Business revenue','Family benefit payment','Rental income','Investment distribution','Expense reimbursement','Bonus payment'];
      v_debit_descriptions := ARRAY['Grocery shopping','School fees','Residential rent','Electricity bill','Water bill','Healthcare expenses','Pharmacy purchase','Family transportation','Insurance premium','Home repairs','Internet subscription'];
    WHEN 'retired' THEN
      v_credit_descriptions := ARRAY['Pension payment','Retirement benefit','Dividend payment','Investment distribution','Rental income','Interest credit','Insurance reimbursement','Family support transfer'];
      v_debit_descriptions := ARRAY['Medical expenses','Pharmacy purchase','Grocery shopping','Utility payment','Residential maintenance','Insurance premium','Transportation fare','Restaurant payment','Travel expenses','Home repairs'];
    ELSE
      v_credit_descriptions := ARRAY['Salary payment','Monthly payroll','Business revenue','Client invoice settlement','Freelance project payment','Consulting fee received','Rental income','Investment distribution','Dividend payment','Interest credit','Online store payout','Commission received','Customer payment','Cash deposit','Transfer received','Bonus payment'];
      v_debit_descriptions := ARRAY['Grocery shopping','Supermarket purchase','Electricity bill','Internet subscription','Mobile airtime and data','Residential rent','Fuel purchase','Transportation fare','Ride-hailing payment','Restaurant payment','Food delivery','Medical expenses','Pharmacy purchase','School fees','Online shopping','Clothing purchase','Insurance premium','Flight booking','Hotel accommodation','Vehicle maintenance','Software subscription','Gym membership','Streaming subscription','Card payment','Supplier invoice','Entertainment expense','Tax payment','Charitable donation'];
  END CASE;

  UPDATE public.ledger_transactions t
  SET
    description = CASE
      WHEN t.metadata->>'event' = 'opening_balance' THEN t.description
      WHEN t.metadata->>'direction' = 'credit' THEN v_credit_descriptions[1 + floor(random() * array_length(v_credit_descriptions, 1))::integer]
      WHEN t.metadata->>'direction' = 'debit' THEN v_debit_descriptions[1 + floor(random() * array_length(v_debit_descriptions, 1))::integer]
      ELSE t.description
    END,
    metadata = t.metadata || jsonb_build_object('customer_profile', jsonb_build_object(
      'gender', p_gender, 'age_group', p_age_group, 'lifestyle', p_lifestyle
    ))
  FROM (
    SELECT DISTINCT le.transaction_id FROM public.ledger_entries le
    WHERE le.account_id = p_account_id
  ) generated
  WHERE t.id = generated.transaction_id
    AND coalesce((t.metadata->>'synthetic_demo')::boolean, false) = true;

  INSERT INTO public.admin_audit_logs(
    admin_user_id, action, entity_type, entity_id, reason, before_state, after_state
  ) VALUES (
    auth.uid(), 'configure_demo_history_profile', 'bank_account', p_account_id::text,
    'Applied a selected synthetic customer profile to generated account history.',
    '{}'::jsonb,
    jsonb_build_object('gender', p_gender, 'age_group', p_age_group, 'lifestyle', p_lifestyle, 'synthetic_demo', true)
  );

  RETURN QUERY SELECT v_result.generated_transactions, v_result.final_balance_minor, v_result.opening_reference;
END;
$function$;

REVOKE ALL ON FUNCTION private.admin_generate_demo_history(uuid, bigint, integer, integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.admin_generate_demo_history(uuid, bigint, integer, integer, text, text, text) TO authenticated;
