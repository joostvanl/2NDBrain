@echo off
setlocal

set "ROOT=%~dp0"
set "SCRIPT=%ROOT%Start-iOMS.ps1"

if not exist "%SCRIPT%" (
  echo Start script not found: "%SCRIPT%"
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"

echo.
echo iOMS stopped. Press any key to close this window.
pause >nul
