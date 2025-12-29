# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

**CAKTO Deployment**

- **Set environment secrets (Supabase Project & Functions) — do NOT expose in frontend:**
	- `CAKTO_CLIENT_ID` — your CAKTO client id
	- `CAKTO_CLIENT_SECRET` — your CAKTO client secret
	- `CAKTO_API_BASE` — e.g. `https://api.cakto.com.br`
	- `CAKTO_WEBHOOK_SECRET` — optional, for webhook HMAC verification

- **Apply DB migration (creates `plans` and `subscriptions` tables):**

	Using `psql` (replace `<DATABASE_URL>`):

	```bash
	psql "<DATABASE_URL>" -f supabase/migrations/20251228120000_add_cakto_plans_subscriptions.sql
	```

	Or using Supabase CLI (when using migrations folder):

	```bash
	supabase db push # or supabase migrations apply depending on your CLI version
	```

- **Deploy Edge Functions:**

	```bash
	supabase functions deploy create-plan
	supabase functions deploy create-subscription
	supabase functions deploy cakto-webhook
	```

- **Set function/project secrets (example using Supabase CLI):**

	```bash
	supabase secrets set CAKTO_CLIENT_ID="..." CAKTO_CLIENT_SECRET="..." CAKTO_API_BASE="https://api.cakto.com.br" CAKTO_WEBHOOK_SECRET="..."
	```

- **Configure CAKTO webhook:** set the webhook URL to your deployed `cakto-webhook` function and configure the `CAKTO_WEBHOOK_SECRET` if using HMAC verification.

- **Run tests locally:**

	```bash
	npm install
	npm run test
	```

Notes:
- Edge Functions are the only components that should use `CAKTO_*` secrets — never include them in the frontend bundle.
- The repository includes example edge functions and a shared helper at `supabase/functions/_shared/cakto.ts`.
