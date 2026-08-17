<#
.SYNOPSIS
    Build (and optionally install) a debug APK of the Kegelee React Native app.

.DESCRIPTION
    Fast local build. Patches dead jcenter() references, then runs assembleDebug
    with the shared Gradle home. Debug builds are NOT obfuscated and are signed
    with the standard Android debug key.

.PARAMETER Clean
    Run 'gradlew clean' before assembling.

.PARAMETER Install
    adb install -r the debug APK onto the connected device after building.

.PARAMETER GradleHome
    Gradle user home (cache). Defaults to E:\.gradle_home to match the repo.

.EXAMPLE
    .\scripts\build-debug.ps1
    .\scripts\build-debug.ps1 -Install
#>
[CmdletBinding()]
param(
    [switch]$Clean,
    [switch]$Install,
    [string]$GradleHome = 'E:\.gradle_home'
)

$ErrorActionPreference = 'Stop'

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir    = Split-Path -Parent $ScriptDir
$AndroidDir = Join-Path $RootDir 'android'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    $candidate = 'D:\Android\Android Studio\jbr'
    if (Test-Path (Join-Path $candidate 'bin\java.exe')) {
        $env:JAVA_HOME = $candidate
        Write-Host "Using Android Studio JBR: $candidate" -ForegroundColor DarkGray
    } else {
        Write-Warning "JAVA_HOME is not set and the Android Studio JBR was not found. Gradle may fail."
    }
}

Write-Step "Patching jcenter() -> mavenCentral() in node_modules"
node (Join-Path $ScriptDir 'patch-jcenter.js')
Write-Step "Bundling offline JS bundle into APK assets"
$assetsDir = Join-Path $RootDir 'android\app\src\main\assets'
if (-not (Test-Path $assetsDir)) { New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null }
$resDir = Join-Path $RootDir 'android\app\src\main\res'
$bundleOut = Join-Path $assetsDir 'index.android.bundle'

npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output $bundleOut --assets-dest $resDir
if ($LASTEXITCODE -ne 0) { throw "JS bundle generation failed" }

$gradleArgs = @()
if (Test-Path $GradleHome) {
    $gradleArgs += @('-g', $GradleHome)
} else {
    Write-Warning "Gradle home '$GradleHome' not found; using the default (~/.gradle)."
}
if ($Clean) { $gradleArgs += 'clean' }
$gradleArgs += 'assembleDebug'

Write-Step "Running: gradlew $($gradleArgs -join ' ')"
Push-Location $AndroidDir
try {
    & .\gradlew.bat @gradleArgs
    if ($LASTEXITCODE -ne 0) { throw "Gradle build failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

$apk = Join-Path $AndroidDir 'app\build\outputs\apk\debug\app-debug.apk'
Write-Step "Build succeeded"
if (Test-Path $apk) {
    $sizeMb = [math]::Round((Get-Item $apk).Length / 1MB, 1)
    Write-Host "APK: $apk  ($sizeMb MB)" -ForegroundColor Green
}

if ($Install -and (Test-Path $apk)) {
    Write-Step "Installing to connected device (adb install -r)"
    adb install -r $apk
}
