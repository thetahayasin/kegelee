<#
.SYNOPSIS
    Build Kegelee on EAS and ship it to the Play Store production track.

.DESCRIPTION
    The whole release in one command. Runs the cheap quality gates first
    (typecheck, lint errors, tests, locale parity), verifies every credential
    EAS will need, then kicks off a cloud build with the `production` profile
    and auto-submits the resulting .aab to the production track.

    Preflight is the point of this script. An EAS build takes 20-40 minutes and
    a submission that fails on a missing service-account file has already cost
    you that time, so everything that can be checked locally is checked before
    the build is queued.

    Version numbers are NOT bumped here. eas.json sets appVersionSource=remote
    with autoIncrement on the production profile, so EAS owns versionCode and
    increments it server-side. Bumping locally as well would skip numbers and
    desync the two counters.

.PARAMETER SkipChecks
    Skip typecheck / lint / tests / locale parity. Use only when re-running a
    release whose checks already passed - not to push past a failure.

.PARAMETER NoSubmit
    Build only. Produces the .aab on EAS without sending it to Google. Submit
    it later with -SubmitOnly.

.PARAMETER SubmitOnly
    Skip the build and submit the latest finished production build. Use when a
    build succeeded but the submission failed (expired service account, Play
    Console rejection you have since fixed).

.PARAMETER NoWait
    Return as soon as the build is queued instead of waiting for it. The build
    and the auto-submit still run on EAS; you just will not see the outcome
    here. Check status at https://expo.dev.

.PARAMETER AllowDirty
    Proceed with uncommitted changes. EAS uploads from git, so by default a
    dirty tree is refused: the build would silently NOT contain your edits,
    which is a genuinely nasty way to lose an afternoon.

.PARAMETER DryRun
    Run every preflight check and quality gate, print the exact eas command
    that would run, and stop. Nothing is built, nothing is submitted, no
    credits are spent. Worth doing once before the real thing.

.PARAMETER Track
    Play track to submit to. Defaults to `production` (the submit profile of
    the same name in eas.json). `internal` is the other configured profile.

.EXAMPLE
    .\scripts\release-playstore.ps1
    .\scripts\release-playstore.ps1 -DryRun
    .\scripts\release-playstore.ps1 -SkipChecks
    .\scripts\release-playstore.ps1 -NoSubmit
    .\scripts\release-playstore.ps1 -SubmitOnly
    .\scripts\release-playstore.ps1 -Track internal
#>
[CmdletBinding()]
param(
    [switch]$SkipChecks,
    [switch]$NoSubmit,
    [switch]$SubmitOnly,
    [switch]$NoWait,
    [switch]$AllowDirty,
    [switch]$DryRun,
    [ValidateSet('production', 'internal')]
    [string]$Track = 'production'
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent $ScriptDir          # react-native-app/
Set-Location $RootDir

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    OK  $msg" -ForegroundColor DarkGreen }
function Fail($msg)       { Write-Host "`nFAILED: $msg" -ForegroundColor Red; exit 1 }

# Prefer the globally installed eas-cli; fall back to npx so the script still
# works on a machine that has not got one. npx re-resolves the package on every
# call, which is slow enough to notice, so it is the fallback and not the default.
$EasExe  = $null
$EasArgs = @()
$globalEas = Get-Command eas -ErrorAction SilentlyContinue
if ($globalEas) {
    $EasExe = $globalEas.Source
} else {
    $EasExe  = 'npx'
    $EasArgs = @('--yes', 'eas-cli@latest')
}

function Invoke-Eas {
    param([string[]]$Arguments)
    & $EasExe @EasArgs @Arguments
}

Write-Host "Kegelee -> Play Store ($Track)" -ForegroundColor White
Write-Host "Project: $RootDir" -ForegroundColor DarkGray

# ---------------------------------------------------------------------------
# 1. Credentials and tooling
# ---------------------------------------------------------------------------
Write-Step "Checking credentials"

$serviceAccount = Join-Path $RootDir 'play-service-account.json'
if (-not (Test-Path $serviceAccount)) {
    Fail @"
play-service-account.json is missing.

eas.json points the submit profile at ./play-service-account.json. Download the
JSON key for the Play publisher service account (Play Console -> Setup -> API
access) and save it there. It is gitignored, so it never leaves this machine.
"@
}
Write-Ok "play-service-account.json"

# credentialsSource is 'local' on the production profile, so EAS signs with the
# keystore named in credentials.json rather than one it holds for you. If that
# file or the keystore it points at is missing, the build fails AFTER the
# 30-minute compile - so it is worth 3 lines to catch here.
$credentialsFile = Join-Path $RootDir 'credentials.json'
if (-not (Test-Path $credentialsFile)) {
    Fail @"
credentials.json is missing.

The production profile uses credentialsSource: local, so EAS needs this file to
find the upload keystore. It must name keystorePath, keyAlias, keystorePassword
and keyPassword.
"@
}

try {
    $creds = Get-Content $credentialsFile -Raw | ConvertFrom-Json
} catch {
    Fail "credentials.json is not valid JSON: $($_.Exception.Message)"
}

$keystorePath = $null
if ($creds.android -and $creds.android.keystore) {
    $keystorePath = $creds.android.keystore.keystorePath
}
if (-not $keystorePath) {
    Fail "credentials.json has no android.keystore.keystorePath."
}
if (-not (Test-Path (Join-Path $RootDir $keystorePath))) {
    Fail "The keystore named in credentials.json does not exist: $keystorePath"
}
Write-Ok "credentials.json -> $keystorePath"

Write-Step "Checking EAS CLI and account"
Invoke-Eas @('whoami')
if ($LASTEXITCODE -ne 0) {
    Fail @"
Not logged in to EAS (or eas-cli could not run).

Run this once, then re-run the script:
    npx eas-cli@latest login
"@
}

# ---------------------------------------------------------------------------
# 2. Version code collision
# ---------------------------------------------------------------------------
# eas.json sets appVersionSource=remote, so EAS keeps its own versionCode
# counter - and it only knows about builds EAS made. A versionCode uploaded to
# Play by a local Gradle build is invisible to it. That is not hypothetical:
# 1.0.58 built for 30 minutes and then died on "Version code 69 has already
# been used", because a local build had put 69 on Play while EAS still thought
# it was at 68.
#
# Non-fatal: a Play API hiccup should not block a release. It warns and moves on.
if (-not $SubmitOnly) {
    Write-Step "Checking the next version code against Play"

    # eas-cli prints an upgrade banner on stderr, and under
    # ErrorActionPreference=Stop PowerShell 5.1 turns any native stderr line
    # into a terminating error. Redirecting with 2>$null makes it worse - it
    # wraps each line in a NativeCommandError. Drop to Continue instead, and
    # treat "no answer" as "cannot check" rather than as failure.
    $playHighest = $null
    $easCurrent = $null
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $playJson = (node (Join-Path $ScriptDir 'play-version-check.js') |
            Where-Object { $_ -match '^\s*\{' } | Select-Object -Last 1)
        if ($playJson) {
            try { $playHighest = (ConvertFrom-Json $playJson).highest } catch {}
        }

        $easOut = (Invoke-Eas @('build:version:get', '--platform', 'android', '--non-interactive') | Out-String)
        if ($easOut -match 'versionCode\s*-\s*(\d+)') { $easCurrent = [int]$Matches[1] }
    } catch {
        # Leave both null; the caller reports "could not compare" below.
    } finally {
        $ErrorActionPreference = $prevEap
    }

    if ($null -eq $playHighest -or $null -eq $easCurrent) {
        Write-Warning "Could not compare version codes (Play or EAS did not answer). Continuing."
    } else {
        # autoIncrement is on, so the build will use EAS's current value plus one.
        $next = $easCurrent + 1
        Write-Host "    Play highest: $playHighest   EAS next: $next" -ForegroundColor DarkGray

        if ($next -le $playHighest) {
            $fix = $playHighest
            Fail @"
Version code $next is already on Play (highest there is $playHighest).

EAS would hand this build a version code Google will reject, and you would not
find out until after the build. Point EAS's counter past Play, then re-run:

    eas build:version:set --platform android --version $fix

(autoIncrement adds one, so setting $fix makes the next build $($fix + 1).)
"@
        }
        Write-Ok "next version code $next is free"
    }
}

# ---------------------------------------------------------------------------
# 3. Working tree
# ---------------------------------------------------------------------------
if (-not $SubmitOnly) {
    Write-Step "Checking the working tree"
    # Scoped to react-native-app: the Laravel side lives in the same repo
    # and its state cannot affect what EAS compiles.
    $dirty = git status --porcelain -- .
    if ($dirty) {
        if ($AllowDirty) {
            Write-Warning "Uncommitted changes present. EAS builds from git, so these will NOT be in the build."
            $dirty | Select-Object -First 10 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkYellow }
        } else {
            Write-Host ""
            $dirty | Select-Object -First 20 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkYellow }
            Fail @"
The working tree has uncommitted changes.

EAS uploads your project from git, so anything not committed would be missing
from the build - and you would not find out until you tested the release.

Commit them, or pass -AllowDirty if you genuinely want to ship HEAD as-is.
"@
        }
    } else {
        Write-Ok "clean"
    }
}

# ---------------------------------------------------------------------------
# 4. Quality gates
# ---------------------------------------------------------------------------
if ($SubmitOnly -or $SkipChecks) {
    Write-Step "Skipping quality gates"
} else {
    Write-Step "Typecheck (tsc)"
    npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) { Fail "TypeScript errors. Fix them before releasing." }
    Write-Ok "no type errors"

    # Warnings are tolerated (there is a standing backlog of inline-style ones);
    # errors are not.
    Write-Step "Lint (errors only)"
    npx eslint src App.tsx --ext .ts,.tsx --quiet
    if ($LASTEXITCODE -ne 0) { Fail "ESLint errors. Fix them before releasing." }
    Write-Ok "no lint errors"

    Write-Step "Tests"
    npx jest --silent --ci
    if ($LASTEXITCODE -ne 0) { Fail "Tests failed." }
    Write-Ok "tests pass"

    # A missing key ships as a raw dotted path on screen ("training.startWorkout"),
    # which is the kind of thing that only ever gets noticed in a store review.
    Write-Step "Locale parity"
    node (Join-Path $ScriptDir 'check-locales.js')
    if ($LASTEXITCODE -ne 0) { Fail "Locale files are out of sync with en.json." }
    Write-Ok "all locales complete"
}

# ---------------------------------------------------------------------------
# 5. Build (and auto-submit)
# ---------------------------------------------------------------------------
if ($SubmitOnly) {
    Write-Step "Submitting the latest production build to the $Track track"
    $submitArgs = @('submit', '--platform', 'android', '--profile', $Track, '--latest', '--non-interactive')
    if ($DryRun) {
        Write-Host "    [dry run] would run: eas $($submitArgs -join ' ')" -ForegroundColor Yellow
    } else {
        Invoke-Eas $submitArgs
        if ($LASTEXITCODE -ne 0) { Fail "eas submit failed." }
    }
} else {
    $buildArgs = @('build', '--platform', 'android', '--profile', 'production', '--non-interactive')

    if (-not $NoSubmit) {
        # --auto-submit hands the .aab straight to the submit profile of the
        # same name once the build finishes, so the release completes even if
        # this terminal is closed.
        $buildArgs += '--auto-submit-with-profile'
        $buildArgs += $Track
    }
    if (-not $NoWait) { $buildArgs += '--wait' }

    $what = "build"
    if (-not $NoSubmit) { $what = "build + submit to $Track" }
    Write-Step "Starting EAS $what"
    Write-Host "    eas $($buildArgs -join ' ')" -ForegroundColor DarkGray
    Write-Host "    A cloud build usually takes 20-40 minutes." -ForegroundColor DarkGray

    if ($DryRun) {
        Write-Host "    [dry run] would run: eas $($buildArgs -join ' ')" -ForegroundColor Yellow
        Write-Host "    [dry run] nothing built, nothing submitted, no credits spent." -ForegroundColor Yellow
    } else {
        Invoke-Eas $buildArgs
        if ($LASTEXITCODE -ne 0) { Fail "eas build failed. See the build page above for the log." }
    }
}

# ---------------------------------------------------------------------------
# 6. Done
# ---------------------------------------------------------------------------
Write-Host ""
if ($DryRun) {
    Write-Host "Dry run complete - everything the script can check locally is green." -ForegroundColor Green
    Write-Host "Re-run without -DryRun to build and ship." -ForegroundColor DarkGray
    exit 0
}
Write-Host "Done." -ForegroundColor Green
if ($NoWait) {
    Write-Host "The build is running on EAS. Watch it at https://expo.dev/accounts" -ForegroundColor DarkGray
} elseif (-not $NoSubmit) {
    Write-Host "Submitted to the $Track track." -ForegroundColor DarkGray
    Write-Host "Google reviews the release before it goes live - check Play Console:" -ForegroundColor DarkGray
    Write-Host "  https://play.google.com/console" -ForegroundColor DarkGray
} else {
    Write-Host "Build finished, not submitted. Send it with:" -ForegroundColor DarkGray
    Write-Host "  npm run release:play -- -SubmitOnly" -ForegroundColor DarkGray
}
