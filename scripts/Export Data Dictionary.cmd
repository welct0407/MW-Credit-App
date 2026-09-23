@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dictionary\Export-DataDictionary.ps1"
set "exportExit=%ERRORLEVEL%"
echo.
if not "%~1"=="--no-pause" pause
exit /b %exportExit%
