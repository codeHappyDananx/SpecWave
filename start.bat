@echo off
setlocal

cd /d "%~dp0"
title SpecWave - dev

if not exist "package.json" (
  echo [SpecWave] package.json not found: %CD%
  echo [SpecWave] Run start.bat from repo root.
  pause
  exit /b 1
)

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

set "SW_MODE="
set "SW_CLEAN=1"
set "SW_DEVTOOLS=0"
set "SW_VERBOSE=0"

:parse_args
if "%~1"=="" goto parsed_args
if /i "%~1"=="--clean" (set "SW_CLEAN=1" & shift & goto parse_args)
if /i "%~1"=="--no-clean" (set "SW_CLEAN=0" & shift & goto parse_args)
if /i "%~1"=="--devtools" (set "SW_DEVTOOLS=1" & shift & goto parse_args)
if /i "%~1"=="--verbose" (set "SW_VERBOSE=1" & shift & goto parse_args)
if /i "%~1"=="--help" goto help
if /i "%~1"=="-h" goto help
if "%SW_MODE%"=="" (set "SW_MODE=%~1" & shift & goto parse_args)
echo [SpecWave] Unknown arg: %~1
shift
goto parse_args

:help
echo.
echo SpecWave dev launcher (Windows)
echo.
echo Usage:
echo   start.bat [mode] [--no-clean] [--devtools]
echo.
echo modes:
echo   d3d11       - ANGLE d3d11, default, hardware + WebGL2
echo   d3d9        - ANGLE d3d9, more compatible, often WebGL1
echo   warp        - ANGLE WARP, software D3D11
echo   swiftshader - use-gl=swiftshader-webgl, software WebGL
echo   nogpu       - disable-gpu, last resort
echo.
echo flags:
echo   --no-clean  - do not kill leftover processes
echo   --devtools  - open DevTools automatically, slower WebGL
echo   --verbose   - print debug logs
echo.
pause
exit /b 0

:parsed_args

set "SPECWAVE_DISABLE_GPU=0"
set "SPECWAVE_ANGLE=d3d11"
set "SPECWAVE_USE_GL="
set "SPECWAVE_DISABLE_GPU_SANDBOX=0"
set "SPECWAVE_OPEN_DEVTOOLS=0"
if "%SW_DEVTOOLS%"=="1" set "SPECWAVE_OPEN_DEVTOOLS=1"

set "SPECWAVE_USER_DATA_DIR=%~dp0.tmp-specwave-userdata"
if not exist "%SPECWAVE_USER_DATA_DIR%" mkdir "%SPECWAVE_USER_DATA_DIR%" >nul 2>nul

if /i "%SW_MODE%"=="d3d11" set "SPECWAVE_ANGLE=d3d11"
if /i "%SW_MODE%"=="d3d9" set "SPECWAVE_ANGLE=d3d9"
if /i "%SW_MODE%"=="warp" set "SPECWAVE_ANGLE=warp"
if /i "%SW_MODE%"=="swiftshader" set "SPECWAVE_USE_GL=swiftshader-webgl"
if /i "%SW_MODE%"=="nogpu" set "SPECWAVE_DISABLE_GPU=1"

if "%SW_CLEAN%"=="1" call :clean_processes

if "%SW_VERBOSE%"=="1" echo [SpecWave] Launch: ANGLE=%SPECWAVE_ANGLE% USE_GL=%SPECWAVE_USE_GL% DISABLE_GPU=%SPECWAVE_DISABLE_GPU%
if "%SW_VERBOSE%"=="1" echo [SpecWave] userData: %SPECWAVE_USER_DATA_DIR%
call %PNPM% dev
set "SW_EXIT=%ERRORLEVEL%"
if not "%SW_EXIT%"=="0" (
  echo [SpecWave] pnpm dev failed (exit=%SW_EXIT%). Try: start.bat --verbose
  pause
)
exit /b %SW_EXIT%

:clean_processes
if "%SW_VERBOSE%"=="1" echo [SpecWave] Killing leftover processes (repo path match)...
set "SW_ROOT=%CD%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$root=$env:SW_ROOT; $rx=[regex]::Escape($root); $names=@('electron.exe','node.exe','esbuild.exe'); $ps=Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.Name -in $names) -and ($_.CommandLine -match $rx) }; if ($ps) { $ps | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} } }"
exit /b 0
