@echo off
setlocal

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\bootstrap-win.ps1" %*
exit /b %errorlevel%
