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
