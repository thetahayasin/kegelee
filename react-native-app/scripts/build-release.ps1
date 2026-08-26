<#
.SYNOPSIS
    Build a signed, R8-obfuscated release of the Kegelee React Native app.

.DESCRIPTION
    One-command production build. Patches dead jcenter() references in
    node_modules, (optionally) bumps the version, then runs the Gradle release
    assembly with the shared Gradle home. Produces a release APK and, with -Aab,
    an Android App Bundle for the Play Store. Signing uses android/keystore.properties
    (the real kegelee release key); R8 minify + resource shrink + obfuscation are
    enabled in app/build.gradle.

.PARAMETER Aab
    Also build the Play Store App Bundle (.aab) via bundleRelease.

.PARAMETER Clean
    Run 'gradlew clean' before assembling.

.PARAMETER Install
    adb install -r the release APK onto the connected device after building.

.PARAMETER NoBump
    Skip the automatic versionCode / versionName bump.

.PARAMETER GradleHome
    Gradle user home (cache). Defaults to E:\.gradle_home to match the repo.

.EXAMPLE
    .\scripts\build-release.ps1
    .\scripts\build-release.ps1 -Aab -Clean
    .\scripts\build-release.ps1 -Install
#>
[CmdletBinding()]
param(
    [switch]$Aab,
    [switch]$Clean,
    [switch]$Install,
    [switch]$NoBump,
    [string]$GradleHome = 'E:\.gradle_home'
)

$ErrorActionPreference = 'Stop'

# --- Resolve project layout -------------------------------------------------
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir    = Split-Path -Parent $ScriptDir          # react-native-app/
$AndroidDir = Join-Path $RootDir 'android'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# --- Locate a JDK (Gradle needs JAVA_HOME) ----------------------------------
if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    $candidate = 'D:\Android\Android Studio\jbr'
    if (Test-Path (Join-Path $candidate 'bin\java.exe')) {
        $env:JAVA_HOME = $candidate
        Write-Host "Using Android Studio JBR: $candidate" -ForegroundColor DarkGray
    } else {
        Write-Warning "JAVA_HOME is not set and the Android Studio JBR was not found. Gradle may fail."
    }
}

# --- Warn if release signing is not configured ------------------------------
$keystoreProps = Join-Path $AndroidDir 'keystore.properties'
if (-not (Test-Path $keystoreProps)) {
    Write-Warning "android/keystore.properties not found - the release will fall back to DEBUG signing."
    Write-Warning "Create it with the kegelee-release.keystore credentials to produce an uploadable build."
}

# --- 1. Patch dead jcenter() repos in node_modules --------------------------
Write-Step "Patching jcenter() -> mavenCentral() in node_modules"
node (Join-Path $ScriptDir 'patch-jcenter.js')
if ($LASTEXITCODE -ne 0) { throw "patch-jcenter.js failed" }


# --- 2. Version bump (unless suppressed) ------------------------------------
if (-not $NoBump) {
    Write-Step "Bumping Android version"
    node (Join-Path $ScriptDir 'bump-version.js')
    if ($LASTEXITCODE -ne 0) { throw "bump-version.js failed" }
} else {
    Write-Host "Skipping version bump (-NoBump)." -ForegroundColor DarkGray
}

# --- 3. Assemble via Gradle -------------------------------------------------
$gradleArgs = @()
if (Test-Path $GradleHome) {
    $gradleArgs += @('-g', $GradleHome)
} else {
    Write-Warning "Gradle home '$GradleHome' not found; using the default (~/.gradle)."
}
if ($Clean) { $gradleArgs += 'clean' }
$gradleArgs += 'assembleRelease'
if ($Aab) { $gradleArgs += 'bundleRelease' }

Write-Step "Running: gradlew $($gradleArgs -join ' ')"
Push-Location $AndroidDir
try {
    & .\gradlew.bat @gradleArgs
    if ($LASTEXITCODE -ne 0) { throw "Gradle build failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

# --- 4. Report artifacts ----------------------------------------------------
# NOT $aab: PowerShell variable names are case-insensitive, so that assignment
# lands on the [switch]$Aab parameter declared above, and assigning a String to
# a switch-typed parameter throws ArgumentTransformationMetadataException. With
# $ErrorActionPreference = 'Stop' that killed the script right here, AFTER a
# fully successful Gradle build: no artifact report, no signature check, and an
# exit code of 1 on a release that had in fact been built and signed.
$apkPath = Join-Path $AndroidDir 'app\build\outputs\apk\release\app-release.apk'
$aabPath = Join-Path $AndroidDir 'app\build\outputs\bundle\release\app-release.aab'

Write-Step "Build succeeded"
if (Test-Path $apkPath) {
    $sizeMb = [math]::Round((Get-Item $apkPath).Length / 1MB, 1)
    Write-Host "APK: $apkPath  ($sizeMb MB)" -ForegroundColor Green
}
if ($Aab -and (Test-Path $aabPath)) {
    $sizeMb = [math]::Round((Get-Item $aabPath).Length / 1MB, 1)
    Write-Host "AAB: $aabPath  ($sizeMb MB)" -ForegroundColor Green
}

# --- 5. Best-effort signature verification ----------------------------------
$sdkDir = $null
$localProps = Join-Path $AndroidDir 'local.properties'
if (Test-Path $localProps) {
    $line = Select-String -Path $localProps -Pattern '^sdk\.dir=(.+)$' | Select-Object -First 1
    if ($line) { $sdkDir = $line.Matches[0].Groups[1].Value -replace '\\\\', '\' -replace '\\:', ':' }
}
if ($sdkDir -and (Test-Path $apkPath)) {
    $apksigner = Get-ChildItem -Path (Join-Path $sdkDir 'build-tools') -Recurse -Filter 'apksigner.bat' -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1
    if ($apksigner) {
        Write-Step "Verifying APK signature"
        & $apksigner.FullName verify --print-certs $apkPath
    }
}

# --- 6. Optional install ----------------------------------------------------
if ($Install -and (Test-Path $apkPath)) {
    Write-Step "Installing to connected device (adb install -r)"
    adb install -r $apkPath
}
