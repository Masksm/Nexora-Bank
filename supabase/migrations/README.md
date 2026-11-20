# Database migration baseline

The connected Nexora Supabase project already has five applied migrations:

- `20261120070537_initial_banking_schema`
- `20261120070554_tighten_rls_and_foreign_key_indexes`
- `20261120071402_customer_onboarding_and_transaction_engine`
- `20261120071440_harden_transfer_idempotency_and_admin_authorization`
- `20261120071515_lock_down_internal_function_and_complete_admin_audit`

These versions were verified against the live project's migration history on 2026-11-20.

**Important:** the remote migration history currently exists, but the original SQL bodies are not retrievable from the migration-history listing. Do not fabricate migration files with those version numbers and do not run a guessed baseline against the live project. The next database-source-control task is to reconstruct and review a clean, replayable baseline from the live catalog, then validate it on a separate local database before using it elsewhere.

The live project must remain untouched during that reconstruction.
