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

# Put the JDK's bin (keytool, jarsigner) on PATH so NativePHP's signing
# pre-flight can validate the keystore. Without it keytool isn't found and you
# get the harmless "Could not validate keystore/alias combination" warning
# (Gradle still signs with the same JDK). Resolved from NATIVEPHP_GRADLE_PATH,
# then JAVA_HOME, then the Android Studio default.
$JdkHome = Get-DotEnvValue 'NATIVEPHP_GRADLE_PATH'
if (-not $JdkHome) { $JdkHome = $env:JAVA_HOME }
if (-not $JdkHome) { $JdkHome = 'C:\Program Files\Android\Android Studio\jbr' }
$JdkBin = Join-Path $JdkHome 'bin'
if ((Test-Path (Join-Path $JdkBin 'keytool.exe')) -and ($env:PATH -notlike "*$JdkBin*")) {
    $env:PATH = "$JdkBin;$env:PATH"
    Write-Host "Using JDK for signing tools: $JdkBin" -ForegroundColor DarkGray
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

# 4b. Warm every boot cache the device reads instead of recompiling on the
# first cold request. config:cache is included: this app never calls Laravel's
# env() at runtime (verified - it uses getenv()/$_SERVER), and NativePHP reads
# its own settings via config(), so freezing the config is safe and collapses
# ~30 config files into one.
Write-Step "Warming production caches (config/route/view/event) for faster cold start"
Invoke-Checked 'php' @('artisan', 'config:cache')
Invoke-Checked 'php' @('artisan', 'route:cache')
Invoke-Checked 'php' @('artisan', 'view:cache')
Invoke-Checked 'php' @('artisan', 'event:cache')

# 4c. Authoritative optimized class map: the on-device autoloader resolves every
# class from a single precomputed map with no per-class filesystem stat()
# fallback, trimming syscalls on each cold boot. Skipped (non-fatal) if composer
# is not on PATH.
if (Get-Command composer -ErrorAction SilentlyContinue) {
    Write-Step "Dumping an authoritative optimized autoloader"
    Invoke-Checked 'composer' @('dump-autoload', '--optimize', '--classmap-authoritative')
} else {
    Write-Host "==> Skipping authoritative autoloader (composer not on PATH)" -ForegroundColor Yellow
}

# 4d. Persist the on-device OPcache in files/ instead of cache/. NativePHP's
# php_bridge.c points opcache.file_cache at the app's cache/ dir, which Android
# evicts under storage pressure and after the app sits idle - wiping the compiled
# bytecode so the next launch recompiles all of Laravel ("slow after some time").
# files/ is never auto-cleared. Idempotent, and survives a native:install that
# regenerates php_bridge.c from the vendor stub.
Write-Step "Pinning OPcache file cache to files/ (persistent cold-start cache)"
$phpBridge = Join-Path $ProjectRoot 'nativephp\android\app\src\main\cpp\php_bridge.c'
if (Test-Path $phpBridge) {
    $src = [System.IO.File]::ReadAllText($phpBridge)
    $patched = $src -replace '(opcache\.file_cache=/data/data/[^/]+/)cache/opcache', '${1}files/opcache'
    if ($patched -ne $src) {
        [System.IO.File]::WriteAllText($phpBridge, $patched)
        Write-Host "    Patched opcache.file_cache -> files/ (was cache/)" -ForegroundColor DarkGray
    } else {
        Write-Host "    opcache.file_cache already pinned to files/" -ForegroundColor DarkGray
    }
} else {
    Write-Host "    php_bridge.c not found (run native:install first) - skipping" -ForegroundColor Yellow
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

# Report the packaged Laravel bundle size too. If this is large (100s of MB),
# something non-app (dist/, node_modules, media) is being swept in - check
# cleanup_exclude_files in config/nativephp.php.
$bundle = Join-Path $ProjectRoot 'nativephp\android\app\src\main\assets\laravel_bundle.zip'
if (Test-Path $bundle) {
    $bundleMb = (Get-Item $bundle).Length / 1MB
    $color = if ($bundleMb -gt 120) { 'Yellow' } else { 'Gray' }
    Write-Host ("  laravel_bundle.zip  ({0:N1} MB)" -f $bundleMb) -ForegroundColor $color
    if ($bundleMb -gt 120) {
        Write-Host "  ^ bundle looks heavy - verify cleanup_exclude_files excludes dist/, node_modules, media." -ForegroundColor Yellow
    }
}
if ($UploadToPlayStore) {
    Write-Host "Uploaded AAB to Play Store track: $PlayStoreTrack"
}
