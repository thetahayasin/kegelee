#Requires -Version 5.1
<#
.SYNOPSIS
    Build and run the app on a connected Android device / emulator for testing.

.DESCRIPTION
    Two testing modes:

      Default (debug build + install + run):
        Builds a debug APK, installs it on the connected device/emulator and
        launches it via native:run. Use -Watch for hot reloading while you edit.

      Jump mode (-Jump):
        Starts the NativePHP "jump" dev server (native:jump) and prints a QR
        code. Scan it from the NativePHP test app on your phone for instant
        hot-reload without rebuilding an APK each change. Fastest iteration loop.

    Make sure a device is attached (adb devices) or an emulator is running
    (php artisan native:emulator) before using the default mode.

.PARAMETER Jump
    Use the jump dev server (QR hot reload) instead of building/installing an APK.

.PARAMETER Watch
    Enable hot reloading for the debug build/run (default mode only).

.PARAMETER Build
    Build variant for the default run mode: debug (default) | release | bundle.

.PARAMETER StartUrl
    Initial URL/path the app loads on start. When omitted, the app uses the
    start URL configured in .env (NATIVEPHP_START_URL) so it boots straight into
    the app. Pass a path (e.g. /) only if you want to override it for this run.

.PARAMETER Browser
    Jump mode only: open the QR page in the default browser (handy when the
    terminal can't render the QR cleanly).

.EXAMPLE
    .\scripts\test-mobile.ps1
    Build a debug APK and run it on the connected device.

.EXAMPLE
    .\scripts\test-mobile.ps1 -Watch
    Same, with hot reloading enabled.

.EXAMPLE
    .\scripts\test-mobile.ps1 -Jump -Browser
    Start the jump dev server and open the QR code in the browser.
#>
[CmdletBinding()]
param(
    [switch]$Jump,
    [switch]$Watch,

    [ValidateSet('debug', 'release', 'bundle')]
    [string]$Build = 'debug',

    [string]$StartUrl,
    [switch]$Browser
)

$ErrorActionPreference = 'Stop'

# Always operate from the project root (parent of this script's folder).
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# NativePHP runs the Gradle wrapper as a bare 'gradlew.bat'. When
# NoDefaultCurrentDirectoryInExePath is set (common on hardened Windows),
# cmd.exe won't run a batch file from the current directory and the build fails.
# Clear it for this process only (does not change system settings).
if (Test-Path Env:\NoDefaultCurrentDirectoryInExePath) {
    Remove-Item Env:\NoDefaultCurrentDirectoryInExePath
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

Write-Host "Kegel Trainer - Mobile test build" -ForegroundColor Green
Write-Host "Project: $ProjectRoot"

# Sync the configured logo to public/icon.png so the launcher icon matches.
Write-Step "Syncing app launcher icon from the logo"
Invoke-Checked 'php' @('artisan', 'app:sync-icon')

# Build front-end assets so the webview has up-to-date CSS/JS.
Write-Step "Building front-end assets (npm run build)"
Invoke-Checked 'npm' @('run', 'build')

if ($Jump) {
    Write-Step "Starting NativePHP jump dev server (scan the QR with the test app)"
    $jumpArgs = @('artisan', 'native:jump')
    if ($Browser) { $jumpArgs += '--browser' }
    # native:jump is long-running (holds the terminal) - run in foreground.
    Invoke-Checked 'php' $jumpArgs
}
else {
    Write-Step "Building '$Build' and running on the connected device (native:run)"
    $runArgs = @('artisan', 'native:run', "--build=$Build")
    if ($Watch)    { $runArgs += '--watch' }
    if ($StartUrl) { $runArgs += "--start-url=$StartUrl" }
    # native:run is long-running while the app is attached - run in foreground.
    Invoke-Checked 'php' $runArgs
}

Write-Host "`nDone." -ForegroundColor Green
