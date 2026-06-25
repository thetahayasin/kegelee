#Requires -Version 5.1
<#
.SYNOPSIS
    Production Android build for the Play Store (signed AAB / APK).

.DESCRIPTION
    Produces a release-signed Android artifact via NativePHP Mobile:
      1. Clears Laravel caches and old compiled files.
      2. Builds the front-end assets (vite production build).
      3. Optionally bumps the app version code (-BumpVersion).
      4. Packages a signed Android bundle (AAB) or APK with native:package.
      5. Optionally uploads to the Play Store on a chosen track.

    Signing credentials are read from .env by default
    (NATIVEPHP_ANDROID_KEYSTORE*, see below) and can be overridden via params.

.PARAMETER BuildType
    'both'    builds BOTH a production-optimized release .apk and an .aab (default).
    'bundle'  produces only the .aab (required for the Play Store).
    'release' produces only the standalone signed, production-optimized .apk.

.PARAMETER BumpVersion
    Bump the version number/code in .env before building (native:release).

.PARAMETER UploadToPlayStore
    Upload the packaged AAB to the Play Store after a successful build.

.PARAMETER PlayStoreTrack
    Play Store track when uploading: internal | alpha | beta | production.

.PARAMETER Keystore / KeystorePassword / KeyAlias / KeyPassword
    Override signing credentials. If omitted, native:package uses the values
    configured in your NativePHP environment / .env.

.PARAMETER Output
    Directory to write the signed artifacts to. Defaults to <project>\dist\android
    so every production build lands in the same folder.

.EXAMPLE
    .\scripts\build-production.ps1
    Build both a release APK and an AAB into dist\android using configured credentials.

.EXAMPLE
    .\scripts\build-production.ps1 -BumpVersion -UploadToPlayStore -PlayStoreTrack internal
    Bump version, build, and push to the internal testing track.
#>
[CmdletBinding()]
param(
    [ValidateSet('bundle', 'release', 'both')]
    [string]$BuildType = 'both',

    [switch]$BumpVersion,
    [switch]$UploadToPlayStore,

    [ValidateSet('internal', 'alpha', 'beta', 'production')]
    [string]$PlayStoreTrack = 'internal',

    [string]$Keystore,
    [string]$KeystorePassword,
    [string]$KeyAlias,
    [string]$KeyPassword,

    [string]$Output
)

$ErrorActionPreference = 'Stop'

# Always operate from the project root (parent of this script's folder).
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# NativePHP runs the Gradle wrapper from the Android project dir as a bare
# 'gradlew.bat'. When NoDefaultCurrentDirectoryInExePath is set (common on
# hardened Windows), cmd.exe refuses to run a batch file from the current
# directory, so the Gradle build fails with "not recognized". Clear it for this
# process only (does not change system settings).
if (Test-Path Env:\NoDefaultCurrentDirectoryInExePath) {
    Remove-Item Env:\NoDefaultCurrentDirectoryInExePath
}

# Default every production build to the same output folder.
if (-not $Output) {
    $Output = Join-Path $ProjectRoot 'dist\android'
}
if (-not (Test-Path $Output)) {
    New-Item -ItemType Directory -Force -Path $Output | Out-Null
}

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

Write-Host "Kegel Trainer - Production Android build" -ForegroundColor Green
Write-Host "Project: $ProjectRoot"
Write-Host "Build type: $BuildType"

# 0. Signing pre-flight. native:package exits 0 even when signing config is
# missing (printing only a warning and producing NO artifact), so we must check
# up front and fail fast rather than wasting a full build on an unsigned no-op.
# Credentials are resolved in order: parameter > process env var > .env file.
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

function Resolve-Signing([string]$Param, [string]$EnvName) {
    if ($Param) { return $Param }
    $v = [Environment]::GetEnvironmentVariable($EnvName)
    if ($v) { return $v }
    return Get-DotEnvValue $EnvName
}

$SignKeystore = Resolve-Signing $Keystore         'ANDROID_KEYSTORE_FILE'
$SignStorePw  = Resolve-Signing $KeystorePassword 'ANDROID_KEYSTORE_PASSWORD'
$SignAlias    = Resolve-Signing $KeyAlias         'ANDROID_KEY_ALIAS'
$SignKeyPw    = Resolve-Signing $KeyPassword      'ANDROID_KEY_PASSWORD'

$missing = @()
if (-not $SignKeystore) { $missing += '-Keystore         (or env ANDROID_KEYSTORE_FILE)' }
if (-not $SignStorePw)  { $missing += '-KeystorePassword (or env ANDROID_KEYSTORE_PASSWORD)' }
if (-not $SignAlias)    { $missing += '-KeyAlias         (or env ANDROID_KEY_ALIAS)' }
if (-not $SignKeyPw)    { $missing += '-KeyPassword      (or env ANDROID_KEY_PASSWORD)' }

if ($missing.Count -gt 0) {
    Write-Host "`nERROR: a production build must be signed, but signing config is missing:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host "`nProvide them as parameters:" -ForegroundColor Yellow
    Write-Host '  .\scripts\build-production.ps1 -Keystore C:\path\to\app.keystore -KeystorePassword "***" -KeyAlias myalias -KeyPassword "***"'
    Write-Host "or set the matching ANDROID_KEYSTORE_FILE / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD environment variables."
    exit 1
}

# 1. Clean caches / temp build artifacts
Write-Step "Clearing Laravel caches"
Invoke-Checked 'php' @('artisan', 'optimize:clear')

# 2. Sync the configured logo to public/icon.png so the launcher icon matches.
Write-Step "Syncing app launcher icon from the logo"
Invoke-Checked 'php' @('artisan', 'app:sync-icon')

# 3. Front-end assets (production)
Write-Step "Building front-end assets (npm run build)"
Invoke-Checked 'npm' @('run', 'build')

# 4. Optional version bump
if ($BumpVersion) {
    Write-Step "Bumping app version (native:release)"
    Invoke-Checked 'php' @('artisan', 'native:release')
}

# 5. Package signed Android artifact(s). 'both' produces APK + AAB.
$types = if ($BuildType -eq 'both') { @('release', 'bundle') } else { @($BuildType) }
$buildStart = Get-Date

foreach ($type in $types) {
    $ext   = if ($type -eq 'release') { '*.apk' } else { '*.aab' }
    $label = if ($type -eq 'release') { 'release APK' } else { 'AAB bundle' }
    Write-Step "Packaging production-signed Android $label"

    $pkgArgs = @('artisan', 'native:package', '--android', "--build-type=$type", '--no-interaction')

    $pkgArgs += "--keystore=$SignKeystore"
    $pkgArgs += "--keystore-password=$SignStorePw"
    $pkgArgs += "--key-alias=$SignAlias"
    $pkgArgs += "--key-password=$SignKeyPw"
    $pkgArgs += "--output=$Output"

    # Only an AAB can be uploaded to the Play Store - never the APK.
    if ($UploadToPlayStore -and $type -eq 'bundle') {
        $pkgArgs += '--upload-to-play-store'
        $pkgArgs += "--play-store-track=$PlayStoreTrack"
    }

    Invoke-Checked 'php' $pkgArgs

    # native:package can exit 0 without producing anything (e.g. a soft signing
    # failure), so verify a fresh artifact actually landed in the output folder.
    $produced = Get-ChildItem -Path $Output -Include $ext -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -ge $buildStart }
    if (-not $produced) {
        throw "native:package reported success but produced no $ext in $Output. Check the signing config and the build log (nativephp/android-build.log)."
    }
}

# Final verification: at least one artifact must exist from this run.
$artifacts = Get-ChildItem -Path $Output -Include *.apk, *.aab -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $buildStart } |
    Sort-Object LastWriteTime -Descending
if (-not $artifacts) {
    Write-Host "`nERROR: build finished but no APK/AAB was produced in $Output." -ForegroundColor Red
    exit 1
}

Write-Host "`nProduction build complete." -ForegroundColor Green
Write-Host "Artifacts written to: $Output"
$artifacts | ForEach-Object { Write-Host ("  {0}  ({1:N1} MB)" -f $_.Name, ($_.Length / 1MB)) }
if ($UploadToPlayStore) {
    Write-Host "Uploaded AAB to Play Store track: $PlayStoreTrack"
}
