@echo off
setlocal

cd /d "%~dp0"
title SpecWave - dev

chcp 65001 >nul

set "PNPM=pnpm"
where pnpm >nul 2>nul
if errorlevel 1 (
  where corepack >nul 2>nul
  if errorlevel 1 (
    echo [SpecWave] pnpm not found.
    echo [SpecWave] Install pnpm or enable corepack first.
    echo [SpecWave] Tip: corepack enable
    pause
    exit /b 1
  )
  set "PNPM=corepack pnpm"
)

call %PNPM% dev
pause
