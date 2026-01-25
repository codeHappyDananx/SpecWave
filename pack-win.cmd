@echo off
setlocal

REM 一键打包：Windows exe（调用 pack-win.ps1）
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0pack-win.ps1" %*
exit /b %errorlevel%

