param(
  [switch]$SkipSecrets
)

function Check-Exe($name) {
  $path = Get-Command $name -ErrorAction SilentlyContinue
  return $null -ne $path
}

if (-not (Check-Exe 'supabase')) {
  Write-Error "supabase CLI not found. Install from https://supabase.com/docs/guides/cli"
  exit 1
}

if (-not $SkipSecrets) {
  if (-not $env:CAKTO_CLIENT_ID -or -not $env:CAKTO_CLIENT_SECRET -or -not $env:CAKTO_API_BASE) {
    Write-Host "Please set CAKTO_CLIENT_ID, CAKTO_CLIENT_SECRET and CAKTO_API_BASE as environment variables, or run with -SkipSecrets to skip setting secrets."
    exit 1
  }

  Write-Host "Setting Supabase secrets for CAKTO..."
  supabase secrets set CAKTO_CLIENT_ID="$env:CAKTO_CLIENT_ID" CAKTO_CLIENT_SECRET="$env:CAKTO_CLIENT_SECRET" CAKTO_API_BASE="$env:CAKTO_API_BASE" CAKTO_WEBHOOK_SECRET="$env:CAKTO_WEBHOOK_SECRET"
}

Write-Host "Deploying Edge Functions: create-plan, create-subscription, cakto-checkout, cakto-success, cakto-webhook"
supabase functions deploy create-plan
supabase functions deploy create-subscription
supabase functions deploy cakto-checkout
supabase functions deploy cakto-success
supabase functions deploy cakto-webhook

Write-Host "(Optional) Applying DB migrations via supabase db push"
if (Check-Exe 'supabase') {
  & supabase db push
  if ($LASTEXITCODE -ne 0) {
    Write-Host "supabase db push failed or not configured; run scripts/apply-migration.ps1 with DATABASE_URL"
  }
}

Write-Host "Deploy script finished."
