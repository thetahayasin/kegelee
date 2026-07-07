# Builds an upload-ready package for the kegelee.com shared host (no SSH).
#
#   powershell -ExecutionPolicy Bypass -File scripts\package-live.ps1
#
# Produces dist\kegelee-live.zip containing:
#   kegelee/       the Laravel app (vendor included, production .env,
#                  pre-migrated SQLite database, no dev packages)
#   public_html/   the webroot (built assets + index.php wired to ../kegelee)
#
# Upload both folders into the hosting account's home directory (so they sit
# side by side), then open  https://kegelee.com/deploy?key=DEPLOY_KEY  once
# to build the production caches. Admin credentials are written to
# dist\ADMIN-CREDENTIALS.txt on first package.

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$dist = Join-Path $repo 'dist'
$stage = Join-Path $dist 'stage'
$upload = Join-Path $dist 'upload'
$appDir = Join-Path $upload 'kegelee'
$webDir = Join-Path $upload 'public_html'

Write-Host '==> Cleaning dist/' -ForegroundColor Cyan
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Force $stage, $upload | Out-Null

Write-Host '==> Building frontend assets' -ForegroundColor Cyan
npm run build | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'npm run build failed' }

Write-Host '==> Exporting committed files (git archive HEAD)' -ForegroundColor Cyan
$archive = Join-Path $dist 'src.zip'
git archive --format=zip -o $archive HEAD
if ($LASTEXITCODE -ne 0) { throw 'git archive failed' }
Expand-Archive $archive -DestinationPath $stage
Remove-Item $archive

# The server does not need the Android project or the test suite.
foreach ($dir in @('nativephp', 'tests')) {
    $p = Join-Path $stage $dir
    if (Test-Path $p) { Remove-Item $p -Recurse -Force }
}

Write-Host '==> Copying built assets' -ForegroundColor Cyan
Copy-Item (Join-Path $repo 'public\build') (Join-Path $stage 'public\build') -Recurse

Write-Host '==> Writing production .env' -ForegroundColor Cyan
$env = Get-Content (Join-Path $repo '.env')
$drop = '^(NATIVEPHP_ANDROID_SDK_LOCATION|NATIVEPHP_GRADLE_PATH|ANDROID_KEYSTORE_FILE|ANDROID_KEYSTORE_PASSWORD|ANDROID_KEY_ALIAS|ANDROID_KEY_PASSWORD|UNLOCK_ALL_EXERCISES)='
$env = $env | Where-Object { $_ -notmatch $drop }
$env = $env -replace '^APP_ENV=.*', 'APP_ENV=production'
$env = $env -replace '^APP_DEBUG=.*', 'APP_DEBUG=false'
$env = $env -replace '^LOG_LEVEL=.*', 'LOG_LEVEL=error'
$env = $env -replace '^APP_KEY=.*', 'APP_KEY='
[IO.File]::WriteAllLines((Join-Path $stage '.env'), $env)

Write-Host '==> composer install --no-dev (this takes a minute)' -ForegroundColor Cyan
Push-Location $stage
# Copy the local path packages (taha/*) into vendor instead of symlinking -
# symlinks break the moment the folder moves or gets zipped.
$env:COMPOSER_MIRROR_PATH_REPOS = '1'
composer install --no-dev --optimize-autoloader --no-interaction --quiet
$composerExit = $LASTEXITCODE
Remove-Item Env:\COMPOSER_MIRROR_PATH_REPOS
if ($composerExit -ne 0) { Pop-Location; throw 'composer install failed' }

Write-Host '==> Generating APP_KEY' -ForegroundColor Cyan
php artisan key:generate --force | Out-Null

Write-Host '==> Building the production database (migrate + settings + admin)' -ForegroundColor Cyan
New-Item -ItemType File -Force (Join-Path $stage 'database\database.sqlite') | Out-Null
php artisan migrate --force | Out-Null
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'migrate failed' }
php artisan db:seed --class=SettingSeeder --force | Out-Null
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'settings seed failed' }

# One real admin account with a strong generated password (no demo users).
$chars = ([char[]]'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789')
$adminPassword = -join (1..20 | ForEach-Object { $chars | Get-Random })
$env:PACKAGE_ADMIN_PW = $adminPassword
$tinker = '\App\Models\User::updateOrCreate([''email'' => ''admin@kegelee.com''], [''name'' => ''Admin'', ''password'' => bcrypt(getenv(''PACKAGE_ADMIN_PW'')), ''is_admin'' => true, ''email_verified_at'' => now(), ''onboarded_at'' => now(), ''level_id'' => \App\Models\Level::orderBy(''number'')->value(''id'')]);'
php artisan tinker --execute=$tinker | Out-Null
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'admin user creation failed' }
Remove-Item Env:\PACKAGE_ADMIN_PW
Pop-Location

Write-Host '==> Splitting webroot (public_html) from the app' -ForegroundColor Cyan
Move-Item (Join-Path $stage 'public') $webDir
Move-Item $stage $appDir

# Public uploads folder (the public disk writes here; no symlink needed).
New-Item -ItemType Directory -Force (Join-Path $webDir 'storage') | Out-Null

# index.php wired to the app folder next to public_html, with the public
# path bound to the webroot so storage links and Vite resolve correctly.
@'
<?php

use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// The application lives OUTSIDE the webroot, next to public_html.
$appPath = dirname(__DIR__).'/kegelee';

if (file_exists($maintenance = $appPath.'/storage/framework/maintenance.php')) {
    require $maintenance;
}

require $appPath.'/vendor/autoload.php';

$app = require_once $appPath.'/bootstrap/app.php';
$app->usePublicPath(__DIR__);

$app->handleRequest(Request::capture());
'@ | Set-Content (Join-Path $webDir 'index.php') -Encoding ascii

Write-Host '==> Zipping' -ForegroundColor Cyan
$zip = Join-Path $dist 'kegelee-live.zip'
Compress-Archive -Path $appDir, $webDir -DestinationPath $zip -Force

$syncKey = (Select-String -Path (Join-Path $appDir '.env') -Pattern '^DEPLOY_KEY=(.+)$').Matches[0].Groups[1].Value

@"
Kegelee live package
====================
Zip:            dist\kegelee-live.zip
Admin login:    admin@kegelee.com
Admin password: $adminPassword
Deploy URL:     https://kegelee.com/deploy?key=$syncKey

Upload steps
------------
1. In cPanel File Manager, upload kegelee-live.zip to the account HOME
   directory (the folder that contains public_html) and extract it there.
   You get: ~/kegelee and ~/public_html (replace the existing public_html
   contents with the extracted one).
2. Make sure the domain uses PHP 8.3.
3. Open the Deploy URL above once - it runs migrations and builds the
   production caches.
4. Log into https://kegelee.com/admin/login and change the admin password.

Future updates: re-run this script, upload the changed files (or the whole
zip again, keeping the server's database/database.sqlite and storage/ if you
want to preserve data), then open the Deploy URL again.
"@ | Tee-Object -FilePath (Join-Path $dist 'ADMIN-CREDENTIALS.txt')
