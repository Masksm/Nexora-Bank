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
