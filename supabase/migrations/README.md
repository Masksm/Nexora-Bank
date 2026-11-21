# Database migration baseline

The connected Nexora Supabase project already has five applied migrations:

- `20261120070537_initial_banking_schema`
- `20261120070554_tighten_rls_and_foreign_key_indexes`
- `20261120071402_customer_onboarding_and_transaction_engine`
- `20261120071440_harden_transfer_idempotency_and_admin_authorization`
- `20261120071515_lock_down_internal_function_and_complete_admin_audit`

These versions were verified against the live project's migration history on 2026-11-20.

Additional database changes applied through the Supabase management connection on 2026-11-20:

- `admin_demo_history_generator`
- `admin_account_status_controls`
- `support_device_security_and_transfer_review`
- `support_activity_and_virtual_cards`
- `bound_synthetic_history_dates`
- `session_revocation_and_location_context`
- `protect_device_fingerprints`
- `optimize_support_message_policies`
- `isolate_privileged_rpc_implementations`
- `notify_customers_on_support_replies`
- `recheck_account_status_on_transfer_approval`

These add admin balance/history operations, account restrictions, transfer review, support conversations, device/session tracking, and simulated virtual-card controls. The demo-history generator was corrected to keep generated activity between its configured start date and the current time.

**Important:** the remote migration history currently exists, but the original SQL bodies are not retrievable from the migration-history listing. Do not fabricate migration files with those version numbers and do not run a guessed baseline against the live project. The next database-source-control task is to reconstruct and review a clean, replayable baseline from the live catalog, then validate it on a separate local database before using it elsewhere.

The live project must remain untouched during that reconstruction.


Additional migration applied and source-controlled on 2026-11-21:

- `20261121062755_expand_customer_profile_and_private_identity_documents`: adds customer address and time-zone fields, plus a private identity-document bucket and owner-scoped metadata/storage policies. Identity uploads are limited to PDF/JPEG/PNG and 10 MB. Customers can remove only documents that have not entered review.


Additional migration applied and source-controlled on 2026-11-21:

- `20261121073100_add_customer_language_preference`: adds a constrained customer language preference (`auto`, English, Spanish, French, Portuguese or German). Automatic mode resolves from the browser's accepted languages, then the saved country, with English as the fallback.


Additional migration applied and source-controlled on 2026-11-21:

- `20261121090000_financial_experience_and_scheduled_transfers`: adds customer-editable account nicknames, a private-owner-scoped scheduled transfer table, and a pg_cron worker that submits due transfers into the existing administrator security-review queue. Scheduled transfers do not post balances until an administrator approves the resulting ledger transaction. Recurring weekly/monthly schedules pause while the latest execution is awaiting review. The admin approval RPC rechecks the source account's available posted balance before posting, and a daily cron task retains only seven days of scheduler run history.

 
Additional migration applied and source-controlled on 2026-11-21:

- `20261121100000_add_customer_kyc_review_workflow`: adds customer verification status and rejection reasons, administrator-only document metadata review, administrator-only reads of private identity files through short-lived signed URLs, a submission trigger, an atomic administrator review function, and audit-log entries. Customers can read their own verification outcome but cannot change it. Rejected documents remain in the record; a newly uploaded replacement becomes the latest document for that document type.

- `20261121103000_notify_customers_of_kyc_review_outcomes`: sends an in-app security notification when a customer's latest identity submission is fully verified or requires correction. The aggregate customer status is calculated from the latest document for each document type.

- `20261121104500_optimize_kyc_review_policies_and_indexes`: consolidates customer/admin read access into one ownership-or-admin policy per table and indexes reviewer foreign keys.
