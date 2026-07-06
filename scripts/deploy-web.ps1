#Requires -Version 5.1
<#
.SYNOPSIS
    Production bring-up for the Kegelee web backend (admin panel + sync API).
    Windows / local use. To deploy on the Linux server over SSH, run the bash
    twin instead:  bash scripts/deploy-web.sh --seed

.DESCRIPTION
    Takes a checkout to a production-ready, running state in one command:
      1. Ensures .env exists and APP_KEY is set.
      2. Installs PHP deps (composer install --no-dev --optimize-autoloader).
      3. Builds front-end assets (npm ci + npm run build).
      4. Runs database migrations (or a full rebuild with -Fresh).
      5. Seeds production content + ensures an admin (-Seed / -Fresh) via
         Database\Seeders\ProductionSeeder - no demo user, no fake data.
      6. Links storage, warms the production caches (config/route/view/event),
         and restarts the queue.
      7. Optionally health-checks the deployed URL.

    Safe to re-run: without -Fresh it never drops data, and the admin account is
    only created when one does not already exist.

.PARAMETER Fresh
    Rebuild the database from scratch (migrate:fresh). DESTROYS ALL DATA.
    Requires -Force (or an interactive confirmation) to proceed. Implies -Seed.

.PARAMETER Seed
    Seed production content and ensure the admin account exists.

.PARAMETER AdminEmail
    Admin login email for the initial account (ProductionSeeder). Defaults to
    ADMIN_EMAIL in .env, else admin@kegelee.com. Ignored if an admin exists.

.PARAMETER AdminPassword
    Admin password for the initial account. If omitted (and none in .env), a
    strong random password is generated and printed once.

.PARAMETER SkipComposer
    Skip 'composer install' (use the vendor/ already present).

.PARAMETER SkipNpm
    Skip the front-end asset build (use the public/build already present).

.PARAMETER Url
    Base URL to health-check after deploy, e.g. https://kegelee.com. When set,
    the script GETs <Url>/up and <Url>/admin/login and reports the result.

.PARAMETER Force
    Skip the interactive confirmation for destructive actions (-Fresh).

.EXAMPLE
    .\scripts\deploy-web.ps1
    Install deps, build assets, migrate, cache. No data touched.

.EXAMPLE
    .\scripts\deploy-web.ps1 -Seed -AdminEmail admin@kegelee.com -Url https://kegelee.com
    Full deploy: migrate, seed content, ensure the admin, then health-check.

.EXAMPLE
    .\scripts\deploy-web.ps1 -Fresh -Force
    Wipe and rebuild the database from scratch, then seed (no prompt).
#>
[CmdletBinding()]
param(
    [switch]$Fresh,
    [switch]$Seed,
    [string]$AdminEmail,
    [string]$AdminPassword,
    [switch]$SkipComposer,
    [switch]$SkipNpm,
    [string]$Url,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# Always operate from the project root (parent of this script's folder).
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Invoke-Checked([string]$Exe, [string[]]$Arguments) {
    Write-Host "    $Exe $($Arguments -join ' ')" -ForegroundColor DarkGray
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed ($LASTEXITCODE): $Exe $($Arguments -join ' ')"
    }
}

# Runs a command whose non-zero exit is non-fatal (e.g. storage:link when the
# link already exists). Reports but does not throw.
function Invoke-Soft([string]$Exe, [string[]]$Arguments) {
    Write-Host "    $Exe $($Arguments -join ' ')" -ForegroundColor DarkGray
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    (non-fatal exit $LASTEXITCODE - continuing)" -ForegroundColor Yellow
    }
}

function Get-DotEnvValue([string]$Key) {
    $envFile = Join-Path $ProjectRoot '.env'
    if (-not (Test-Path $envFile)) { return $null }
    $line = Select-String -Path $envFile -Pattern "^\s*$Key\s*=" | Select-Object -First 1
    if (-not $line) { return $null }
    $val = ($line.Line -split '=', 2)[1].Trim()
    if ($val.Length -ge 2 -and (($val[0] -eq '"' -and $val[-1] -eq '"') -or ($val[0] -eq "'" -and $val[-1] -eq "'"))) {
        $val = $val.Substring(1, $val.Length - 2)
    }
    return $val
}

Write-Host "Kegelee - Production web deploy" -ForegroundColor Green
Write-Host "Project: $ProjectRoot"

# Pre-flight: required tooling.
if (-not (Get-Command php -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: 'php' was not found on PATH." -ForegroundColor Red
    exit 1
}

# -Fresh is destructive: confirm before wiping.
if ($Fresh) {
    $Seed = $true
    if (-not $Force) {
        Write-Host "`n-Fresh will DROP ALL TABLES and rebuild the database." -ForegroundColor Yellow
        $answer = Read-Host "Type 'yes' to continue"
        if ($answer -ne 'yes') {
            Write-Host "Aborted." -ForegroundColor Red
            exit 1
        }
    }
}

# 0. .env + APP_KEY
Write-Step "Checking environment (.env / APP_KEY)"
if (-not (Test-Path (Join-Path $ProjectRoot '.env'))) {
    if (Test-Path (Join-Path $ProjectRoot '.env.example')) {
        Copy-Item '.env.example' '.env'
        Write-Host "    Created .env from .env.example - review it before going live." -ForegroundColor Yellow
    } else {
        throw "No .env and no .env.example to copy from."
    }
}
$appKey = Get-DotEnvValue 'APP_KEY'
if ([string]::IsNullOrWhiteSpace($appKey)) {
    Write-Host "    APP_KEY empty - generating." -ForegroundColor Yellow
    Invoke-Checked 'php' @('artisan', 'key:generate', '--force')
}

# 1. Clear any stale caches from a previous deploy before doing anything else.
Write-Step "Clearing stale caches"
Invoke-Checked 'php' @('artisan', 'optimize:clear')

# 2. PHP dependencies
if (-not $SkipComposer) {
    Write-Step "Installing PHP dependencies (composer)"
    if (-not (Get-Command composer -ErrorAction SilentlyContinue)) {
        throw "'composer' not found on PATH. Install Composer or pass -SkipComposer."
    }
    Invoke-Checked 'composer' @('install', '--no-dev', '--optimize-autoloader', '--no-interaction', '--prefer-dist')
} else {
    Write-Step "Skipping composer install (-SkipComposer)"
}

# 3. Front-end assets
if (-not $SkipNpm) {
    Write-Step "Building front-end assets (npm)"
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "'npm' not found on PATH. Install Node.js or pass -SkipNpm."
    }
    Invoke-Checked 'npm' @('ci')
    Invoke-Checked 'npm' @('run', 'build')
} else {
    Write-Step "Skipping asset build (-SkipNpm)"
}

# 4. Database schema
if ($Fresh) {
    Write-Step "Rebuilding database (migrate:fresh --force)"
    Invoke-Checked 'php' @('artisan', 'migrate:fresh', '--force')
} else {
    Write-Step "Running migrations (migrate --force)"
    Invoke-Checked 'php' @('artisan', 'migrate', '--force')
}

# 5. Production seed (content + admin)
if ($Seed) {
    Write-Step "Seeding production content + admin"

    $adminEmailValue = if ($AdminEmail) { $AdminEmail } else { Get-DotEnvValue 'ADMIN_EMAIL' }
    if ($adminEmailValue) { $env:ADMIN_EMAIL = $adminEmailValue }
    if ($AdminPassword)   { $env:ADMIN_PASSWORD = $AdminPassword }
    try {
        Invoke-Checked 'php' @('artisan', 'db:seed', '--class=ProductionSeeder', '--force')
    } finally {
        # Never leave the admin password lingering in the process environment.
        Remove-Item Env:\ADMIN_PASSWORD -ErrorAction SilentlyContinue
    }
} else {
    Write-Step "Skipping seed (pass -Seed to seed content + ensure admin)"
}

# 6. Storage + production caches
Write-Step "Linking public storage"
Invoke-Soft 'php' @('artisan', 'storage:link')
$publicStorage = Join-Path $ProjectRoot 'public\storage'
if (-not (Test-Path $publicStorage)) {
    New-Item -ItemType Directory -Force -Path $publicStorage | Out-Null
}

Write-Step "Warming production caches (config/route/view/event)"
Invoke-Checked 'php' @('artisan', 'optimize')

Write-Step "Restarting queue workers"
Invoke-Soft 'php' @('artisan', 'queue:restart')

# 7. Health check
if ($Url) {
    $base = $Url.TrimEnd('/')
    Write-Step "Health check: $base"
    foreach ($path in @('/up', '/admin/login')) {
        $target = "$base$path"
        try {
            $resp = Invoke-WebRequest -UseBasicParsing -Uri $target -TimeoutSec 20
            Write-Host "    $path -> HTTP $($resp.StatusCode)" -ForegroundColor Green
        } catch {
            $code = $_.Exception.Response.StatusCode.value__
            if ($code) {
                Write-Host "    $path -> HTTP $code" -ForegroundColor Yellow
            } else {
                Write-Host "    $path -> unreachable: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
}

Write-Host "`nDeploy complete." -ForegroundColor Green
