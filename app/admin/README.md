# Nexora admin portal

The administrator portal is protected by Supabase Auth app_metadata.role = admin and the matching server-side checks. Financial changes must use the SECURITY DEFINER RPC functions; never update balances or ledger rows directly from the client.

The demo history generator only operates on an empty customer account. It creates one synthetic opening funding transaction plus matched incoming/outgoing activity pairs, with historical timestamps and explicit synthetic_demo metadata. Every transaction has balanced customer and treasury entries and is written to the admin audit log.

All amounts are USD minor units (cents) in the database. The UI accepts decimal USD values and converts them to cents.
