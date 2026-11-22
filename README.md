# Nexora Bank

A full-stack banking application portfolio project built with Next.js, TypeScript, Supabase and Vercel.

## Product scope

- Customer banking portal: account overview, balances, internal transfers, saved beneficiaries, transaction history, virtual card previews, notifications, profile/security settings and customer support conversations.
- Separate administrator portal: customer/account search, manual ledger adjustments, synthetic history generation, account restrictions, pending-transfer reviews, device trust controls, session revocation, support inbox and audit history.
- Premium modern banking interface with USD as the initial display and ledger currency.

## Important operating boundary

Nexora Bank is a software portfolio project. Transfers and balance adjustments are internal ledger simulations only. The application is not connected to a licensed bank, card network or payment processor, and it does not move or settle real-world money. Do not enter real financial credentials or sensitive personal data.

## Implemented routes

- Customer: `/dashboard`, `/dashboard/accounts`, `/dashboard/transfers`, `/dashboard/beneficiaries`, `/dashboard/transactions`, `/dashboard/cards`, `/dashboard/notifications`, `/dashboard/settings`, `/dashboard/security`, `/dashboard/help`.
- Administration: `/admin`, `/admin/reviews`, `/admin/support`, `/admin/audit`.

The support intake currently uses guided category/urgency routing and fixed safety guidance. It does not call a generative-AI model or paid AI API.

## Technology

- Next.js App Router + TypeScript
- Supabase Auth + PostgreSQL + Row Level Security
- Vercel deployment

## Development

Requirements: Node.js LTS and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set the Supabase project URL and publishable key in `.env.local`. Never put a Supabase service-role/secret key in browser-exposed variables.

## Database

The active Supabase project is managed separately from this repository. Its current database already contains the initial banking schema and transaction functions. Migration source must be reviewed against the live catalog before replaying it into another database; do not blindly run a baseline snapshot against the existing project.

## Security principles

- Enforce authorization in PostgreSQL/RPC/server code, not only in the UI.
- Keep customer data scoped by authenticated user and RLS.
- Treat posted ledger entries as immutable.
- Represent every financial operation with balanced ledger entries.
- Require server-side admin authorization and record sensitive admin actions.
- Keep secrets out of Git.

## Sandbox verification integrations

Nexora's external verification features are intentionally configured for sandbox/testing only. Do not configure production banking, payment, identity or account-verification credentials until a licensed financial institution has formally partnered with the product and approved the production design.

- **Persona Identity Sandbox**: set `PERSONA_API_KEY` and `PERSONA_INQUIRY_TEMPLATE_ID`. Configure the Persona inquiry template to collect an identity document and a selfie/liveness check. The app creates an inquiry and returns the hosted one-time verification URL. Staff review the provider reference and record the document-authenticity and liveness outcomes in the KYC workspace before making the final internal review decision.
- **Plaid Sandbox (US account-name comparison)**: set `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENV=sandbox`. The app links a test institution, exchanges the public token server-side, compares the selected test account number, and checks the owner name returned by the Sandbox Identity API. Access tokens are not stored. The result is a Sandbox result, not a real bank confirmation.
- **IBAN.com BAV Sandbox**: the app uses the provider's fixed-response Sandbox endpoint for supported UK and SEPA IBANs. It does not contact the recipient's bank. Sandbox responses are used to exercise exact, partial, no-match and unavailable name-check states where the provider's fixtures allow them.
- **IBAN bank directory**: the European bank-identification route sends an IBAN to the directory provider only after the customer explicitly consents. The returned bank/BIC data identifies the institution, not the account owner.
- **German bank directory**: the lookup uses the Bundesbank's public, non-binding bank-sort-code file. It is a reference lookup, not a payment-settlement feed. The UK sort-code route uses the public HSBC UK branch directory; broader UK lookup is available through a customer-provided IBAN and explicit directory consent.

All provider keys belong in server-only environment variables. Never prefix them with `NEXT_PUBLIC_`, commit real keys, or return provider access tokens to the browser.
