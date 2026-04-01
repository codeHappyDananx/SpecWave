@echo off
setlocal

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0pack-win.ps1" %*
exit /b %errorlevel%

