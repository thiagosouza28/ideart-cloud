CAKTO Webhook Proxy (Cloudflare Worker)

This proxy receives CAKTO webhooks and forwards them to the Supabase Edge Function
with the required Authorization/apikey headers.

Setup (Cloudflare Workers)
1) Install Wrangler (once):
   npm i -g wrangler

2) Create a new Worker:
   wrangler init cakto-webhook-proxy --no-bundler

3) Replace the generated worker code with:
   proxy/cakto-webhook-proxy.js

4) Configure secrets:
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_ANON_KEY

5) Deploy:
   wrangler deploy

6) Update CAKTO webhook URL to your Worker URL, for example:
   https://cakto-webhook-proxy.<your-subdomain>.workers.dev

Notes
- Keep the proxy URL public. It only forwards requests to Supabase.
- CAKTO signature validation is still done inside `cakto-webhook`.
