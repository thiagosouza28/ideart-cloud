param(
  [string]$DatabaseUrl,
  [string]$SchemaPath = (Join-Path $PSScriptRoot "..\\supabase\\sql\\full_schema.sql"),
  [switch]$UseMigrations
)

$errors = @()

if (-not $DatabaseUrl) {
  $DatabaseUrl = $env:SUPABASE_DB_URL
}
if (-not $DatabaseUrl) {
  $DatabaseUrl = $env:DATABASE_URL
}
if (-not $DatabaseUrl) {
  $errors += "DatabaseUrl not provided. Set SUPABASE_DB_URL/DATABASE_URL or pass -DatabaseUrl."
}

$psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlCmd) {
  $errors += "psql not found. Install the PostgreSQL client and ensure it is on PATH."
}

if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Error $_ }
  exit 1
}

if ($UseMigrations) {
  $migrationsDir = Join-Path $PSScriptRoot "..\\supabase\\migrations"
  $files = Get-ChildItem -Path $migrationsDir -Filter *.sql | Sort-Object Name
  if (-not $files -or $files.Count -eq 0) {
    Write-Error "No migration files found in $migrationsDir."
    exit 1
  }

  foreach ($file in $files) {
    Write-Host "Applying migration $($file.Name)..."
    & $psqlCmd.Source $DatabaseUrl -v ON_ERROR_STOP=1 -f $file.FullName
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
} else {
  $schemaPathResolved = Resolve-Path -Path $SchemaPath -ErrorAction SilentlyContinue
  if (-not $schemaPathResolved) {
    Write-Error "Schema file not found: $SchemaPath"
    exit 1
  }

  Write-Host "Applying schema $($schemaPathResolved.Path)..."
  & $psqlCmd.Source $DatabaseUrl -v ON_ERROR_STOP=1 -f $schemaPathResolved.Path
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Done."
