@echo off
REM ---------------------------------------------------------------------------
REM  Drive the Wear OS emulator from the command line.
REM
REM  The emulator draws side buttons on its device frame and they frequently do
REM  nothing - a long-standing Wear emulator quirk, not something wrong with the
REM  app. Every one of them has a key event behind it that does work, so this
REM  wraps the ones worth having.
REM
REM    watch open      launch Kegelee
REM    watch login     launch it signed out, at the sign-in screen
REM    watch demo      launch it with the debug profile, no account needed
REM    watch apps      the app list (the side button people cannot press)
REM    watch back      go back one screen
REM    watch home      the watch face
REM    watch install   build the debug APK and install it
REM    watch shot      screenshot to the current folder
REM    watch compare   diff the watch's exercises against the phone's
REM    watch settings  open the emulator's Settings, e.g. to add a Google account
REM ---------------------------------------------------------------------------
setlocal
set PKG=com.kegelee.app
set ACT=%PKG%/.wear.MainActivity
REM -e targets the one running emulator; set ANDROID_SERIAL for a real watch.
if defined ANDROID_SERIAL (set DEV=-s %ANDROID_SERIAL%) else (set DEV=-e)

if "%1"=="" goto usage
if /i "%1"=="open"     goto open
if /i "%1"=="login"    goto login
if /i "%1"=="demo"     goto demo
if /i "%1"=="apps"     goto apps
if /i "%1"=="back"     goto back
if /i "%1"=="home"     goto home
if /i "%1"=="install"  goto install
if /i "%1"=="shot"     goto shot
if /i "%1"=="compare"  goto compare
if /i "%1"=="settings" goto settings
goto usage

:open
adb %DEV% shell am start -n %ACT% >NUL 2>&1
echo Kegelee opened.
goto :eof

:login
REM Clears the stored session so the sign-in screen comes back. Everything the
REM app knows is on the server, so this loses nothing but the login.
adb %DEV% shell pm clear %PKG% >NUL 2>&1
adb %DEV% shell am start -n %ACT% >NUL 2>&1
echo Signed out. The sign-in screen is up.
goto :eof

:demo
adb %DEV% shell am start -n %ACT% --ez demo true >NUL 2>&1
echo Opened with the debug profile.
goto :eof

:apps
REM KEYCODE_ALL_APPS. This is what the side button is supposed to do.
adb %DEV% shell input keyevent 284 >NUL 2>&1
echo App list opened.
goto :eof

:back
adb %DEV% shell input keyevent 4 >NUL 2>&1
goto :eof

:home
adb %DEV% shell input keyevent 3 >NUL 2>&1
goto :eof

:install
pushd "%~dp0.."
call gradlew.bat assembleDebug
if errorlevel 1 (popd & exit /b 1)
adb %DEV% install -r app\build\outputs\apk\debug\app-debug.apk
popd
goto :eof

:shot
adb %DEV% exec-out screencap -p > watch.png
echo Saved watch.png
goto :eof

:compare
pushd "%~dp0.."
node scripts\compare-exercises.cjs
popd
goto :eof

:settings
adb %DEV% shell am start -a android.settings.SETTINGS >NUL 2>&1
echo Settings opened. Accounts is in there, for adding a Google account.
goto :eof

:usage
echo.
echo   watch open^|login^|demo^|apps^|back^|home^|install^|shot^|compare^|settings
echo.
echo   The emulator's drawn side buttons often do nothing; these do the same
echo   jobs over adb. Set ANDROID_SERIAL to target a real watch instead.
echo.
goto :eof
