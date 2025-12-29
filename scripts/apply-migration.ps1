param(
  [string]$DatabaseUrl
)

if (-not $DatabaseUrl) {
  $DatabaseUrl = $env:DATABASE_URL
}

if (-not $DatabaseUrl) {
  Write-Error "No DATABASE_URL provided. Set DATABASE_URL env var or pass as parameter."
  exit 1
}

$migrationFile = "supabase/migrations/20251228120000_add_cakto_plans_subscriptions.sql"
if (-not (Test-Path $migrationFile)) {
  Write-Error "Migration file not found: $migrationFile"
  exit 1
}

Write-Host "Applying migration $migrationFile to database..."

& psql $DatabaseUrl -f $migrationFile
if ($LASTEXITCODE -ne 0) {
  Write-Error "psql exited with code $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Host "Migration applied successfully."
