# Provision Azure resources for Job Offer Compare.
# Free-tier focused: Static Web Apps (Free), Postgres Flexible Server (Burstable B1ms within free credits).
#
# Usage:
#   .\provision.ps1 -ResourceGroup rg-joboffer-compare -Location eastus -DbAdminPassword <strong-password>
#
# Prereqs: Azure CLI logged in (az login). PostgreSQL extension auto-installs on first use.

param(
  [Parameter(Mandatory = $true)] [string] $ResourceGroup,
  [Parameter(Mandatory = $true)] [string] $Location,
  [Parameter(Mandatory = $true)] [string] $DbAdminPassword,
  [string] $DbServerName = "joboffer-pg-$([guid]::NewGuid().ToString().Substring(0,6))",
  [string] $DbName = "joboffer",
  [string] $DbAdminUser = "joboffer_admin",
  [string] $StaticWebAppName = "joboffer-compare-swa",
  [string] $GitHubRepoUrl = "",
  [string] $GitHubBranch = "main"
)

$ErrorActionPreference = "Stop"

Write-Host "==> Creating resource group $ResourceGroup in $Location"
az group create --name $ResourceGroup --location $Location | Out-Null

Write-Host "==> Creating PostgreSQL Flexible Server $DbServerName (Burstable B1ms)"
az postgres flexible-server create `
  --resource-group $ResourceGroup `
  --name $DbServerName `
  --location $Location `
  --admin-user $DbAdminUser `
  --admin-password $DbAdminPassword `
  --tier Burstable `
  --sku-name Standard_B1ms `
  --version 16 `
  --storage-size 32 `
  --public-access 0.0.0.0 `
  --yes | Out-Null

Write-Host "==> Creating database $DbName"
az postgres flexible-server db create `
  --resource-group $ResourceGroup `
  --server-name $DbServerName `
  --database-name $DbName | Out-Null

$connectionString = "postgresql://${DbAdminUser}:${DbAdminPassword}@${DbServerName}.postgres.database.azure.com:5432/${DbName}?sslmode=require"

Write-Host ""
Write-Host "==> Creating Static Web App (Free tier)"
if ([string]::IsNullOrWhiteSpace($GitHubRepoUrl)) {
  Write-Warning "No -GitHubRepoUrl provided. Creating an empty SWA (you can link a repo later in the portal)."
  az staticwebapp create `
    --name $StaticWebAppName `
    --resource-group $ResourceGroup `
    --location $Location `
    --sku Free | Out-Null
} else {
  az staticwebapp create `
    --name $StaticWebAppName `
    --resource-group $ResourceGroup `
    --location $Location `
    --source $GitHubRepoUrl `
    --branch $GitHubBranch `
    --app-location "/" `
    --api-location "" `
    --output-location ".next" `
    --sku Free `
    --login-with-github | Out-Null
}

Write-Host ""
Write-Host "==> Done."
Write-Host ""
Write-Host "Set these in your Static Web App > Configuration > Application settings (and in your local .env):"
Write-Host ""
Write-Host "  DATABASE_URL=$connectionString"
Write-Host "  AUTH_SECRET=<run: openssl rand -base64 32>"
Write-Host "  AUTH_URL=https://<your-swa-hostname>"
Write-Host "  AI_ENABLED=true"
Write-Host "  AI_PROVIDER=github-models"
Write-Host "  AI_MODEL=gpt-4o-mini"
Write-Host "  GITHUB_TOKEN=<a fine-grained PAT with models:read scope>"
Write-Host "  REDDIT_CLIENT_ID=..."
Write-Host "  REDDIT_CLIENT_SECRET=..."
Write-Host "  REDDIT_USER_AGENT=job-offer-compare/0.1"
Write-Host ""
Write-Host "After the SWA's first deploy completes, run migrations against Azure:"
Write-Host "  `$env:DATABASE_URL = '$connectionString'"
Write-Host "  npx prisma db push"
