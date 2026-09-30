<#
  Stock AI — one-shot GitHub + Vercel deploy (Windows PowerShell)
  Prereqs (already logged in):  git, gh (gh auth login), vercel (npm i -g vercel; vercel login)
  Usage:   powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 [-RepoName stockai] [-Public]
#>
param([string]$RepoName = "stockai", [switch]$Public)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Need($cmd) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Missing '$cmd'. Install it and log in first." } }
Need git; Need gh; Need vercel

# ---- env ----
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
$envs = @{}
Get-Content .env.local | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') { $envs[$matches[1]] = $matches[2].Trim('"') }
}
if (-not $envs["OPENAI_API_KEY"]) { throw "Put your OPENAI_API_KEY in .env.local first." }
if (-not $envs["NEXTAUTH_SECRET"]) {
  $bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $envs["NEXTAUTH_SECRET"] = [Convert]::ToBase64String($bytes)
  (Get-Content .env.local) -replace '^NEXTAUTH_SECRET=.*$', "NEXTAUTH_SECRET=$($envs['NEXTAUTH_SECRET'])" | Set-Content .env.local
  Write-Host "Generated NEXTAUTH_SECRET"
}

if (-not $envs["CRON_SECRET"]) {
  $b2 = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b2)
  $envs["CRON_SECRET"] = -join ($b2 | ForEach-Object { $_.ToString("x2") })
  Add-Content .env.local "CRON_SECRET=$($envs['CRON_SECRET'])"
  Write-Host "Generated CRON_SECRET"
}

if (-not $envs["INSIGHTS_KEY"]) {
  $b3 = New-Object byte[] 16; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b3)
  $envs["INSIGHTS_KEY"] = -join ($b3 | ForEach-Object { $_.ToString("x2") })
  Add-Content .env.local "INSIGHTS_KEY=$($envs['INSIGHTS_KEY'])"
  Write-Host "Generated INSIGHTS_KEY (open /insights?key=<it> in production)"
}

# ---- GitHub ----
if (-not (Test-Path .git)) { git init -b main | Out-Null }
git add -A
git diff --cached --quiet; if ($LASTEXITCODE -ne 0) { git commit -m "Stock AI: AI-powered equity research platform" | Out-Null }
$hasOrigin = (git remote) -contains "origin"
if (-not $hasOrigin) {
  $vis = if ($Public) { "--public" } else { "--private" }
  gh repo create $RepoName $vis --source . --remote origin --push
} else { git push -u origin HEAD }

# ---- Vercel ----
vercel link --yes --project $RepoName
foreach ($name in @("OPENAI_API_KEY", "NEXTAUTH_SECRET", "DATABASE_URL", "CRON_SECRET", "INSIGHTS_KEY", "NEXTAUTH_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_ID", "GITHUB_SECRET", "ALLOWED_MODELS", "RATE_LIMIT_PER_MINUTE", "RATE_LIMIT_PER_DAY", "RATE_LIMIT_PER_DAY_IP", "USER_DAILY_BUDGET_USD", "GLOBAL_DAILY_BUDGET_USD", "GUARD_MODEL")) {
  $val = $envs[$name]; if (-not $val) { continue }
  foreach ($target in @("production", "development")) {
    cmd /c "vercel env rm $name $target --yes >nul 2>nul"
    $tmp = [IO.Path]::GetTempFileName(); [IO.File]::WriteAllText($tmp, $val)
    cmd /c "vercel env add $name $target < `"$tmp`"" | Out-Null
    Remove-Item $tmp
  }
  Write-Host "Set $name on Vercel"
}
if (-not $envs["DATABASE_URL"]) {
  Write-Warning "No DATABASE_URL: Vercel will use a temporary in-memory DB (history won't persist). Add Neon via Vercel dashboard > Storage, then redeploy."
}
try { vercel git connect --yes 2>$null } catch {}
vercel deploy --prod --yes
