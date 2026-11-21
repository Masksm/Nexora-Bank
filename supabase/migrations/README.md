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

- `20261121074916_add_customer_kyc_review_workflow`: adds customer verification status and rejection reasons, administrator-only document metadata review, administrator-only reads of private identity files through short-lived signed URLs, a submission trigger, an atomic administrator review function, and audit-log entries. Customers can read their own verification outcome but cannot change it. Rejected documents remain in the record; a newly uploaded replacement becomes the latest document for that document type.

- `20261121075125_notify_customers_of_kyc_review_outcomes`: sends an in-app security notification when a customer's latest identity submission is fully verified or requires correction. The aggregate customer status is calculated from the latest document for each document type.

- `20261121075151_optimize_kyc_review_policies_and_indexes`: consolidates customer/admin read access into one ownership-or-admin policy per table and indexes reviewer foreign keys.

- `20261121075206_allow_admin_customer_profile_kyc_review`: extends profile read access to authenticated administrators so the KYC workspace can calculate completion and compare submitted identity documents with customer-provided details. Customers retain access only to their own profile.

- `20261121075219_restrict_kyc_review_rpc_entrypoint`: removes direct authenticated execution of the private review implementation and keeps only the authenticated public wrapper, which still enforces the administrator role check internally.

- `20261121075245_keep_customer_kyc_status_in_sync`: recalculates aggregate verification status from the latest document of each type whenever a customer uploads or removes a pending document, preventing stale submitted/rejected states.

- `20261121075307_use_invoker_for_public_kyc_review_rpc`: restores invoker rights on the exposed RPC wrapper; the internal private implementation retains its explicit administrator-claim check.


Additional migrations applied and source-controlled on 2026-11-21:

- `20261121080755_add_savings_goals_and_ledger_operations`: creates customer-owned savings goals and a savings contribution sub-ledger, provisions a dedicated internal custody account, and adds ownership-checked private functions with authenticated invoker RPC wrappers. Contributions and withdrawals are balanced posted ledger transactions with request idempotency. Customers can read their own goals and activity but cannot write directly to the financial tables.
- `20261121081003_harden_savings_goal_operations_and_indexes`: indexes savings entry foreign keys and hardens the movement RPC against null operation types.

- `20261121081154_require_trusted_device_for_savings_movements`: applies the existing trusted-device session check to savings contributions and withdrawals so the new savings workflow cannot bypass Nexora's device security controls.


Additional migrations applied and source-controlled on 2026-11-21:

- `20261121190451_create_super_admin_and_scoped_staff_access`: introduces separate `super_admin` and `admin` roles, customer-to-staff assignment records, scoped row-level access policies, Super Admin role/assignment RPCs, and upgrades the existing `wiskwww@gmail.com` administrator to `super_admin`.
- `20261121190541_enforce_staff_customer_scope_and_super_admin_directory`: adds guarded customer-scope checks to legacy privileged admin operations and the Super Admin directory RPC.
- `20261121190711_complete_super_admin_rpc_authorization_and_staff_read_scope`: extends legacy admin RPC authorization to Super Admin, makes the account-balance view use invoker RLS, and grants assigned staff read access to customer banking features.
- `20261121190737_scope_kyc_storage_and_remaining_admin_rpc_checks`: scopes private identity-document storage reads and remaining KYC/session/device admin operations.
- `20261121190757_finish_scoping_kyc_transfer_review_and_savings_visibility`: completes KYC and transfer-review customer scope checks and allows assigned staff to inspect savings goal records.
- `20261121190853_enforce_exclusive_staff_customer_ownership`: enforces one staff administrator per customer assignment.
- `20261121190916_grant_authenticated_super_admin_rpc_entrypoints`: grants authenticated access to the guarded Super Admin RPC wrappers and assignment reads.
- `20261121190929_enforce_transfer_review_assignment_guard`: adds the final source-and-recipient assignment check to privileged transfer review.

Staff administrators can read and manage only customers assigned to them. Super Admin retains global oversight and access to the existing administrator tools. Role and assignment changes are audit logged. The existing customer accounts, balances, transactions, support messages and identity records are preserved.

- `20261121191151_fix_super_admin_directory_return_types`: explicitly casts Auth email and directory fields to the public RPC's declared return types.

- `20261121191342_scope_transfer_review_to_assigned_source_customer`: limits staff transfer-review authority to the assigned sender's customer account, without granting visibility into an unassigned recipient.

- `20261121191457_clear_customer_assignment_when_promoting_staff`: removes any former customer assignment before promoting that account to staff administrator, preventing stale access links from surviving a role change.
