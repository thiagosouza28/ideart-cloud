CAKTO Integration
=================

Overview
--------
This repository includes server-side Edge Functions and a DB migration to integrate with CAKTO for plans and subscriptions.

Environment (set as Supabase Secrets, never expose in frontend)
- `CAKTO_CLIENT_ID`
- `CAKTO_CLIENT_SECRET`
- `CAKTO_API_BASE` (e.g. https://api.cakto.com.br)
- optionally `CAKTO_WEBHOOK_SECRET` for webhook signature verification

Key pieces
- Database migration: `supabase/migrations/20251228120000_add_cakto_plans_subscriptions.sql`
- Edge Functions:
  - `create-plan` — create plan locally and in CAKTO
  - `create-subscription` — create customer and subscription at CAKTO and save local subscription
  - `cakto-webhook` — webhook endpoint to update subscription status/periods
- Shared helper: `supabase/functions/_shared/cakto.ts` — token handling and API calls
- Frontend helpers: `src/services/cakto.ts` (uses existing `invokeEdgeFunction` helper)

Deployment
- Deploy SQL migration to your Supabase DB (apply migration file).
- Deploy Edge Functions using `supabase functions deploy <name>` for each function.
- Configure environment variables as Supabase function secrets and project secrets.

Notes
- The CAKTO endpoints used are generic and assume a standard OAuth client credentials flow and REST endpoints under `/v1/*`.
- Adjust endpoint paths in `supabase/functions/_shared/cakto.ts` if CAKTO uses different routes.
- Webhook verification uses HMAC-SHA256 if `CAKTO_WEBHOOK_SECRET` is configured.
