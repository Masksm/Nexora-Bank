-- Raise the synthetic account-history generator ceiling to 400 transactions.
CREATE OR REPLACE FUNCTION private.admin_generate_demo_history(p_account_id uuid, p_target_balance_minor bigint, p_start_year integer DEFAULT 2019, p_pairs integer DEFAULT 24)
 RETURNS TABLE(generated_transactions integer, final_balance_minor bigint, opening_reference text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'extensions'
AS $function$
DECLARE
  v_admin_id uuid := auth.uid();
  v_account public.bank_accounts%rowtype;
  v_treasury public.bank_accounts%rowtype;
  v_treasury_id uuid;
  v_reference text;
  v_tx_id uuid;
  v_at timestamptz;
  v_start timestamptz;
  v_amount bigint;
  v_i integer;
  v_credit_count integer;
  v_debit_count integer;
  v_pool bigint;
  v_total integer := 0;
  v_opening_reference text;
  v_old_balance bigint;
  v_credit_amounts bigint[];
  v_debit_amounts bigint[];
  v_credit_descriptions text[] := array[
    'Salary payment','Monthly payroll','Business revenue','Client invoice settlement',
    'Freelance project payment','Consulting fee received','Contract milestone payment',
    'Rental income','Investment distribution','Dividend payment','Interest credit',
    'Online store payout','Marketplace settlement','Commission received',
    'Professional services income','Retainer payment','Customer payment',
    'Service invoice paid','Product sales proceeds','Project completion payment',
    'Insurance reimbursement','Expense refund','Travel refund','Subscription refund',
    'Cash deposit','Transfer received','Vendor rebate','Affiliate earnings',
    'Licensing income','Partnership distribution','Bonus payment','Performance incentive',
    'Event revenue','Digital services payout','Property lease payment','Wholesale payment'
  ];
  v_debit_descriptions text[] := array[
    'Grocery shopping','Supermarket purchase','Electricity bill','Internet subscription',
    'Mobile airtime and data','Office rent','Residential rent','Fuel purchase',
    'Transportation fare','Ride-hailing payment','Restaurant payment','Food delivery',
    'Medical expenses','Pharmacy purchase','School fees','Tuition payment',
    'Online shopping','Electronics purchase','Clothing purchase','Insurance premium',
    'Flight booking','Hotel accommodation','Travel expenses','Vehicle maintenance',
    'Home repairs','Office supplies','Software subscription','Cloud services renewal',
    'Marketing campaign','Professional services','Equipment purchase','Utility payment',
    'Water bill','Waste collection','Gym membership','Streaming subscription',
    'Bank service charge','Card payment','Supplier invoice','Inventory purchase',
    'Courier and delivery','Security services','Cleaning services','Entertainment expense',
    'Event booking','Property maintenance','Tax payment','Charitable donation',
    'Business lunch','Parking fee','Toll payment','Furniture purchase'
  ];
BEGIN
  IF v_admin_id IS NULL OR NOT private.is_staff_admin() THEN
    RAISE EXCEPTION 'Administrator access required.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bank_accounts a
    WHERE a.id = p_account_id
      AND a.is_internal = false
      AND private.can_access_customer(a.user_id)
  ) THEN
    RAISE EXCEPTION 'This customer account is not assigned to your administrator account.';
  END IF;

  IF p_target_balance_minor IS NULL OR p_target_balance_minor <= 0
     OR p_target_balance_minor > 9000000000000000 THEN
    RAISE EXCEPTION 'Target balance must be a positive supported amount.';
  END IF;
  IF p_start_year IS NULL OR p_start_year < 2019
     OR p_start_year > extract(year from now())::integer THEN
    RAISE EXCEPTION 'Start year must be between 2019 and the current year.';
  END IF;
  IF p_pairs IS NULL OR p_pairs < 3 OR p_pairs > 400 THEN
    RAISE EXCEPTION 'Choose between 3 and 400 total transactions.';
  END IF;

  SELECT * INTO v_account
  FROM public.bank_accounts
  WHERE id = p_account_id AND is_internal = false
  FOR UPDATE;

  IF NOT FOUND OR v_account.status <> 'active' THEN
    RAISE EXCEPTION 'Active customer account not found.';
  END IF;

  -- Each generated transaction must balance against a treasury account
  -- denominated in the customer's actual account currency.
  v_treasury_id := private.ensure_fx_clearing_account(v_account.currency);
  SELECT * INTO v_treasury
  FROM public.bank_accounts
  WHERE id = v_treasury_id AND is_internal = true
    AND currency = v_account.currency AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A matching currency treasury account is not configured.';
  END IF;

  SELECT coalesce(sum(e.amount_minor), 0) INTO v_old_balance
  FROM public.ledger_entries e
  JOIN public.ledger_transactions t ON t.id = e.transaction_id
  WHERE e.account_id = v_account.id AND t.status = 'posted';

  IF v_old_balance <> 0 THEN
    RAISE EXCEPTION 'Balance history generator requires an empty account to avoid overwriting existing activity.';
  END IF;

  v_credit_count := ceil((p_pairs - 1)::numeric / 2)::integer;
  v_debit_count := floor((p_pairs - 1)::numeric / 2)::integer;

  IF p_target_balance_minor < ceil(greatest(v_credit_count, v_debit_count)::numeric / 0.45)::bigint THEN
    RAISE EXCEPTION 'The target balance is too small for this transaction count. Increase the target balance or choose fewer transactions.';
  END IF;

  v_pool := greatest(
    greatest(v_credit_count, v_debit_count)::bigint,
    floor(p_target_balance_minor * (0.25 + random() * 0.20))::bigint
  );

  v_start := make_timestamptz(p_start_year, 1, 1, 9, 0, 0, 'UTC');
  IF v_start >= now() - interval '2 days' THEN
    RAISE EXCEPTION 'Choose a start date at least two days in the past.';
  END IF;

  WITH weights AS (
    SELECT i, -ln(greatest(random(), 0.000001)) AS w
    FROM generate_series(1, v_credit_count) AS g(i)
  ), parts AS (
    SELECT i, floor((v_pool-v_credit_count)::numeric*w/sum(w) over())::bigint AS extra
    FROM weights
  ), totals AS (
    SELECT i, extra, sum(extra) over() AS allocated FROM parts
  )
  SELECT array_agg((1 + extra + CASE WHEN i=1 THEN v_pool-v_credit_count-allocated ELSE 0 END)::bigint ORDER BY i)
  INTO v_credit_amounts FROM totals;

  WITH weights AS (
    SELECT i, -ln(greatest(random(), 0.000001)) AS w
    FROM generate_series(1, v_debit_count) AS g(i)
  ), parts AS (
    SELECT i, floor((v_pool-v_debit_count)::numeric*w/sum(w) over())::bigint AS extra
    FROM weights
  ), totals AS (
    SELECT i, extra, sum(extra) over() AS allocated FROM parts
  )
  SELECT array_agg((1 + extra + CASE WHEN i=1 THEN v_pool-v_debit_count-allocated ELSE 0 END)::bigint ORDER BY i)
  INTO v_debit_amounts FROM totals;

  v_reference := 'NX'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  INSERT INTO public.ledger_transactions(reference,transaction_type,status,description,initiated_by,metadata,created_at)
  VALUES (
    v_reference,'deposit','pending','Synthetic demo opening balance',v_admin_id,
    jsonb_build_object('synthetic_demo',true,'event','opening_balance',
      'target_balance_minor',p_target_balance_minor,'requested_transaction_count',p_pairs,
      'currency',v_account.currency),v_start
  ) RETURNING id INTO v_tx_id;

  INSERT INTO public.ledger_entries(transaction_id,account_id,amount_minor,currency,created_at)
  VALUES
    (v_tx_id,v_account.id,p_target_balance_minor,v_account.currency,v_start),
    (v_tx_id,v_treasury.id,-p_target_balance_minor,v_account.currency,v_start);

  IF (SELECT count(*) FROM public.ledger_entries WHERE transaction_id=v_tx_id) <> 2
     OR EXISTS (
       SELECT 1 FROM public.ledger_entries
       WHERE transaction_id=v_tx_id
       GROUP BY currency HAVING sum(amount_minor) <> 0
     ) THEN
    RAISE EXCEPTION 'Generated transaction % failed per-currency ledger validation; nothing was posted.', v_tx_id;
  END IF;

  UPDATE public.ledger_transactions SET status='posted',posted_at=v_start WHERE id=v_tx_id;
  v_opening_reference := v_reference;
  v_total := 1;

  FOR v_i IN 1..v_credit_count LOOP
    v_amount := v_credit_amounts[v_i];
    v_at := v_start + random()*(now()-v_start-interval '2 days');
    v_reference := 'NX'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));

    INSERT INTO public.ledger_transactions(reference,transaction_type,status,description,initiated_by,metadata,created_at)
    VALUES (
      v_reference,'deposit','pending',
      v_credit_descriptions[1+floor(random()*array_length(v_credit_descriptions,1))::integer],
      v_admin_id,
      jsonb_build_object('synthetic_demo',true,'direction','credit','sequence',v_i,
        'amount_minor',v_amount,'requested_transaction_count',p_pairs,'currency',v_account.currency),
      v_at
    ) RETURNING id INTO v_tx_id;

    INSERT INTO public.ledger_entries(transaction_id,account_id,amount_minor,currency,created_at)
    VALUES
      (v_tx_id,v_account.id,v_amount,v_account.currency,v_at),
      (v_tx_id,v_treasury.id,-v_amount,v_account.currency,v_at);

    IF (SELECT count(*) FROM public.ledger_entries WHERE transaction_id=v_tx_id) <> 2
     OR EXISTS (
       SELECT 1 FROM public.ledger_entries
       WHERE transaction_id=v_tx_id
       GROUP BY currency HAVING sum(amount_minor) <> 0
     ) THEN
    RAISE EXCEPTION 'Generated transaction % failed per-currency ledger validation; nothing was posted.', v_tx_id;
  END IF;

  UPDATE public.ledger_transactions SET status='posted',posted_at=v_at WHERE id=v_tx_id;
    v_total := v_total + 1;
  END LOOP;

  FOR v_i IN 1..v_debit_count LOOP
    v_amount := v_debit_amounts[v_i];
    v_at := v_start + random()*(now()-v_start-interval '2 days');
    v_reference := 'NX'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));

    INSERT INTO public.ledger_transactions(reference,transaction_type,status,description,initiated_by,metadata,created_at)
    VALUES (
      v_reference,'withdrawal','pending',
      v_debit_descriptions[1+floor(random()*array_length(v_debit_descriptions,1))::integer],
      v_admin_id,
      jsonb_build_object('synthetic_demo',true,'direction','debit','sequence',v_i,
        'amount_minor',v_amount,'requested_transaction_count',p_pairs,'currency',v_account.currency),
      v_at
    ) RETURNING id INTO v_tx_id;

    INSERT INTO public.ledger_entries(transaction_id,account_id,amount_minor,currency,created_at)
    VALUES
      (v_tx_id,v_account.id,-v_amount,v_account.currency,v_at),
      (v_tx_id,v_treasury.id,v_amount,v_account.currency,v_at);

    IF (SELECT count(*) FROM public.ledger_entries WHERE transaction_id=v_tx_id) <> 2
     OR EXISTS (
       SELECT 1 FROM public.ledger_entries
       WHERE transaction_id=v_tx_id
       GROUP BY currency HAVING sum(amount_minor) <> 0
     ) THEN
    RAISE EXCEPTION 'Generated transaction % failed per-currency ledger validation; nothing was posted.', v_tx_id;
  END IF;

  UPDATE public.ledger_transactions SET status='posted',posted_at=v_at WHERE id=v_tx_id;
    v_total := v_total + 1;
  END LOOP;

  INSERT INTO public.admin_audit_logs(
    admin_user_id,action,entity_type,entity_id,reason,before_state,after_state
  ) VALUES (
    v_admin_id,'generate_demo_history','bank_account',v_account.id::text,
    'Generated clearly labelled synthetic historical ledger activity in the account currency.',
    jsonb_build_object('balance_minor',v_old_balance),
    jsonb_build_object('balance_minor',p_target_balance_minor,'transactions_created',v_total,
      'start_year',p_start_year,'synthetic_demo',true,'opening_reference',v_opening_reference,
      'credit_total_minor',v_pool,'debit_total_minor',v_pool,'currency',v_account.currency)
  );

  RETURN QUERY SELECT v_total,p_target_balance_minor,v_opening_reference;
END;
$function$
;
