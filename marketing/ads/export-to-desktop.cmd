@echo off
rem Double-click to copy the ads to Desktop\ads, one folder per ad.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0export-to-desktop.ps1"
pause
