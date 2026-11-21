-- Account nicknames and scheduled transfer processing.
-- Scheduled transfers are submitted into the existing security-review workflow when due.
-- They do not change balances until an administrator approves the pending ledger transaction.

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS nickname text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bank_accounts_nickname_length'
      AND conrelid = 'public.bank_accounts'::regclass
  ) THEN
    ALTER TABLE public.bank_accounts
      ADD CONSTRAINT bank_accounts_nickname_length
      CHECK (nickname IS NULL OR char_length(nickname) BETWEEN 2 AND 40);
  END IF;
END $$;

CREATE OR REPLACE VIEW public.account_balances
WITH (security_invoker = true)
AS
SELECT a.id AS account_id, a.user_id, a.account_number, a.account_name,
       a.account_type, a.currency, a.status,
       COALESCE(sum(e.amount_minor) FILTER (WHERE t.status = 'posted'), 0)::bigint AS balance_minor,
       a.nickname
FROM public.bank_accounts a
LEFT JOIN public.ledger_entries e ON e.account_id = a.id
LEFT JOIN public.ledger_transactions t ON t.id = e.transaction_id
GROUP BY a.id, a.user_id, a.account_number, a.account_name, a.account_type,
         a.currency, a.status, a.nickname;

GRANT UPDATE (nickname) ON public.bank_accounts TO authenticated;
DROP POLICY IF EXISTS bank_accounts_update_own_nickname ON public.bank_accounts;
CREATE POLICY bank_accounts_update_own_nickname ON public.bank_accounts
FOR UPDATE TO authenticated
USING ((select auth.uid()) = user_id AND is_internal = false)
WITH CHECK ((select auth.uid()) = user_id AND is_internal = false);

CREATE TABLE IF NOT EXISTS public.scheduled_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  from_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  recipient_account_number text NOT NULL CHECK (recipient_account_number ~ '^[0-9]{10}$'),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  description text,
  frequency text NOT NULL DEFAULT 'once' CHECK (frequency IN ('once','weekly','monthly')),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','submitted_for_review','cancelled','failed')),
  last_transaction_id uuid REFERENCES public.ledger_transactions(id) ON DELETE RESTRICT,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_transfers_description_length CHECK (description IS NULL OR char_length(description) <= 160)
);

CREATE INDEX IF NOT EXISTS scheduled_transfers_due_idx
  ON public.scheduled_transfers(status, scheduled_for)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS scheduled_transfers_user_idx
  ON public.scheduled_transfers(user_id, scheduled_for DESC);

ALTER TABLE public.scheduled_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduled_transfers FROM anon, public, authenticated;
GRANT SELECT ON public.scheduled_transfers TO authenticated;
GRANT INSERT (user_id,from_account_id,recipient_account_number,amount_minor,description,frequency,scheduled_for)
  ON public.scheduled_transfers TO authenticated;
GRANT UPDATE (status) ON public.scheduled_transfers TO authenticated;

DROP POLICY IF EXISTS scheduled_transfers_select_own ON public.scheduled_transfers;
CREATE POLICY scheduled_transfers_select_own ON public.scheduled_transfers
FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS scheduled_transfers_insert_own ON public.scheduled_transfers;
CREATE POLICY scheduled_transfers_insert_own ON public.scheduled_transfers
FOR INSERT TO authenticated
WITH CHECK (
  (select auth.uid()) = user_id
  AND EXISTS (
    SELECT 1 FROM public.bank_accounts a
    WHERE a.id = from_account_id AND a.user_id = (select auth.uid())
      AND a.status = 'active' AND a.is_internal = false
  )
);

DROP POLICY IF EXISTS scheduled_transfers_update_own ON public.scheduled_transfers;
CREATE POLICY scheduled_transfers_update_own ON public.scheduled_transfers
FOR UPDATE TO authenticated
USING ((select auth.uid()) = user_id AND status = 'scheduled')
WITH CHECK ((select auth.uid()) = user_id AND status IN ('scheduled','cancelled'));

CREATE OR REPLACE FUNCTION private.process_due_scheduled_transfers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private', 'extensions'
AS $function$
DECLARE
  v_schedule public.scheduled_transfers%rowtype;
  v_from public.bank_accounts%rowtype;
  v_to public.bank_accounts%rowtype;
  v_balance bigint;
  v_tx_id uuid;
  v_reference text;
  v_next timestamptz;
  v_processed integer := 0;
BEGIN
  FOR v_schedule IN
    SELECT * FROM public.scheduled_transfers
    WHERE status = 'scheduled' AND scheduled_for <= now()
    ORDER BY scheduled_for
    FOR UPDATE SKIP LOCKED
    LIMIT 50
  LOOP
    BEGIN
      IF v_schedule.last_transaction_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.ledger_transactions
        WHERE id = v_schedule.last_transaction_id AND status = 'pending'
      ) THEN
        CONTINUE;
      END IF;

      PERFORM a.id FROM public.bank_accounts a
      WHERE a.id = v_schedule.from_account_id
         OR a.account_number = v_schedule.recipient_account_number
      ORDER BY a.id FOR UPDATE;

      SELECT * INTO v_from FROM public.bank_accounts
      WHERE id = v_schedule.from_account_id AND user_id = v_schedule.user_id;
      IF NOT FOUND OR v_from.status <> 'active' OR v_from.is_internal THEN
        RAISE EXCEPTION 'Source account is not active.';
      END IF;

      SELECT * INTO v_to FROM public.bank_accounts
      WHERE account_number = v_schedule.recipient_account_number;
      IF NOT FOUND OR v_to.status <> 'active' OR v_to.is_internal THEN
        RAISE EXCEPTION 'Recipient account is not active.';
      END IF;
      IF v_to.id = v_from.id THEN
        RAISE EXCEPTION 'Source and recipient accounts cannot be the same.';
      END IF;
      IF v_from.currency <> v_to.currency THEN
        RAISE EXCEPTION 'Source and recipient currencies do not match.';
      END IF;

      SELECT COALESCE(sum(e.amount_minor),0)::bigint INTO v_balance
      FROM public.ledger_entries e
      JOIN public.ledger_transactions t ON t.id = e.transaction_id
      WHERE e.account_id = v_from.id AND t.status = 'posted';
      IF v_balance < v_schedule.amount_minor THEN
        RAISE EXCEPTION 'Insufficient funds at scheduled execution time.';
      END IF;

      v_reference := 'NX' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
      INSERT INTO public.ledger_transactions(
        reference, transaction_type, status, description, initiated_by,
        idempotency_key, metadata
      ) VALUES (
        v_reference, 'transfer', 'pending',
        COALESCE(NULLIF(trim(v_schedule.description),''),'Scheduled Nexora transfer'),
        v_schedule.user_id,
        'scheduled:' || v_schedule.id::text || ':' || to_char(v_schedule.scheduled_for AT TIME ZONE 'UTC','YYYYMMDDHH24MISS'),
        jsonb_build_object(
          'source_account_id',v_from.id,
          'source_account',v_from.account_number,
          'destination_account_number',v_to.account_number,
          'amount_minor',v_schedule.amount_minor,
          'review_required',true,
          'scheduled_transfer_id',v_schedule.id,
          'scheduled_execution',true
        )
      ) RETURNING id INTO v_tx_id;

      INSERT INTO public.ledger_entries(transaction_id,account_id,amount_minor,currency)
      VALUES
        (v_tx_id,v_from.id,-v_schedule.amount_minor,v_from.currency),
        (v_tx_id,v_to.id,v_schedule.amount_minor,v_to.currency);

      INSERT INTO public.notifications(user_id,title,body,category)
      VALUES (
        v_schedule.user_id,
        'Scheduled transfer submitted for review',
        'Your scheduled transfer is due and has been submitted for security review. It will affect balances only after approval.',
        'security'
      );

      IF v_schedule.frequency = 'once' THEN
        UPDATE public.scheduled_transfers
        SET status='submitted_for_review', last_transaction_id=v_tx_id,
            last_error=NULL, updated_at=now()
        WHERE id=v_schedule.id;
      ELSE
        v_next := v_schedule.scheduled_for;
        LOOP
          v_next := v_next + CASE WHEN v_schedule.frequency='weekly'
            THEN interval '7 days' ELSE interval '1 month' END;
          EXIT WHEN v_next > now();
        END LOOP;
        UPDATE public.scheduled_transfers
        SET scheduled_for=v_next, last_transaction_id=v_tx_id,
            last_error=NULL, updated_at=now()
        WHERE id=v_schedule.id;
      END IF;
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.scheduled_transfers
      SET status='failed', last_error=left(SQLERRM,500), updated_at=now()
      WHERE id=v_schedule.id;
      INSERT INTO public.notifications(user_id,title,body,category)
      VALUES (
        v_schedule.user_id,
        'Scheduled transfer could not be submitted',
        'Your scheduled transfer could not be submitted. Review the schedule and account balance, then create a new schedule if needed.',
        'security'
      );
    END;
  END LOOP;
  RETURN v_processed;
END;
$function$;

REVOKE ALL ON FUNCTION private.process_due_scheduled_transfers() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule(
  'nexora-process-due-scheduled-transfers',
  '* * * * *',
  'SELECT private.process_due_scheduled_transfers()'
);


-- Recheck available funds at approval time to prevent a pending transfer
-- from overdrawing an account after other transactions have posted.

CREATE OR REPLACE FUNCTION private.admin_review_transfer(p_transaction_id uuid, p_decision text, p_reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_tx public.ledger_transactions%rowtype;
  v_source_user uuid;
  v_destination_user uuid;
  v_source_status text;
  v_destination_status text;
  v_source_account_id uuid;
  v_amount_minor bigint;
  v_available_balance bigint;
  v_new_status text;
BEGIN
  IF v_admin IS NULL OR ((select auth.jwt())->'app_metadata'->>'role') IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  IF p_decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Decision must be approve or reject.'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 8 THEN RAISE EXCEPTION 'A reason of at least 8 characters is required.'; END IF;
  SELECT * INTO v_tx FROM public.ledger_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF NOT FOUND OR v_tx.transaction_type <> 'transfer' OR v_tx.status <> 'pending'
    OR coalesce((v_tx.metadata->>'review_required')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Transfer is not awaiting security review.'; END IF;
  SELECT a.id,a.user_id,a.status,abs(e.amount_minor) INTO v_source_account_id,v_source_user,v_source_status,v_amount_minor
  FROM public.ledger_entries e JOIN public.bank_accounts a ON a.id=e.account_id
  WHERE e.transaction_id=v_tx.id AND e.amount_minor < 0 LIMIT 1;
  SELECT a.user_id,a.status INTO v_destination_user,v_destination_status
  FROM public.ledger_entries e JOIN public.bank_accounts a ON a.id=e.account_id
  WHERE e.transaction_id=v_tx.id AND e.amount_minor > 0 LIMIT 1;
  IF p_decision='approve' AND (v_source_status IS DISTINCT FROM 'active' OR v_destination_status IS DISTINCT FROM 'active') THEN
    RAISE EXCEPTION 'Source or recipient account is no longer active. Transfer cannot be approved.';
  END IF;
  IF p_decision='approve' THEN
    PERFORM 1 FROM public.bank_accounts WHERE id=v_source_account_id FOR UPDATE;
    SELECT COALESCE(sum(e.amount_minor),0)::bigint INTO v_available_balance
    FROM public.ledger_entries e JOIN public.ledger_transactions t ON t.id=e.transaction_id
    WHERE e.account_id=v_source_account_id AND t.status='posted';
    IF v_available_balance < v_amount_minor THEN RAISE EXCEPTION 'Available balance is no longer sufficient. Transfer cannot be approved.'; END IF;
  END IF;
  v_new_status := CASE WHEN p_decision='approve' THEN 'posted' ELSE 'failed' END;
  UPDATE public.ledger_transactions SET status=v_new_status,
    posted_at=CASE WHEN p_decision='approve' THEN now() ELSE NULL END,
    metadata=metadata || jsonb_build_object('review_required',false,'review_decision',p_decision,
      'review_reason',trim(p_reason),'reviewed_by',v_admin,'reviewed_at',now())
  WHERE id=v_tx.id;
  INSERT INTO public.notifications(user_id,title,body,category)
  VALUES(v_source_user,CASE WHEN p_decision='approve' THEN 'Transfer approved' ELSE 'Transfer declined' END,
    CASE WHEN p_decision='approve' THEN 'Your transfer passed security review and was posted.'
      ELSE 'Your transfer was declined after security review. Contact customer care if you need help.' END,'security');
  IF p_decision='approve' AND v_destination_user IS NOT NULL THEN
    INSERT INTO public.notifications(user_id,title,body,category)
    VALUES(v_destination_user,'Incoming transfer','A transfer has been posted to your Nexora account.','transactions');
  END IF;
  INSERT INTO public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,reason,before_state,after_state)
  VALUES(v_admin,'transfer_'||p_decision,'ledger_transaction',v_tx.id::text,trim(p_reason),
    jsonb_build_object('status',v_tx.status,'reference',v_tx.reference),
    jsonb_build_object('status',v_new_status,'review_decision',p_decision));
  RETURN v_new_status;
END;
$function$;

 
-- Retain only seven days of scheduler execution logs to prevent unbounded growth.
SELECT cron.schedule(
  'nexora-cron-history-cleanup',
  '0 2 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);
