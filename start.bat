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

rem 用法：
rem - 直接双击：默认启动（Windows 默认 ANGLE=d3d9）
rem - 指定模式：start.bat d3d11 ^| d3d9 ^| warp ^| swiftshader ^| nogpu
rem - 关闭清理：start.bat --no-clean
rem - 打开 DevTools：start.bat --devtools

set "SW_MODE="
set "SW_CLEAN=1"
set "SW_DEVTOOLS=0"

:parse_args
if "%~1"=="" goto parsed_args
if /i "%~1"=="--clean" (set "SW_CLEAN=1" & shift & goto parse_args)
if /i "%~1"=="--no-clean" (set "SW_CLEAN=0" & shift & goto parse_args)
if /i "%~1"=="--devtools" (set "SW_DEVTOOLS=1" & shift & goto parse_args)
if /i "%~1"=="--help" goto help
if /i "%~1"=="-h" goto help
if "%SW_MODE%"=="" (set "SW_MODE=%~1" & shift & goto parse_args)
echo [SpecWave] 未识别参数：%~1
shift
goto parse_args

:help
echo.
echo SpecWave dev 启动脚本（Windows）
echo.
echo 用法：
echo   start.bat [mode] [--no-clean] [--devtools]
echo.
echo mode：
echo   d3d9        - ANGLE d3d9（更稳，默认）
echo   d3d11       - ANGLE d3d11（默认显卡后端）
echo   warp        - ANGLE WARP（软件 D3D11）
echo   swiftshader - use-gl=swiftshader-webgl（软件 WebGL，最硬兜底）
echo   nogpu       - disable-gpu（只用于排查/兜底）
echo.
echo flags：
echo   --no-clean  - 不清理残留进程（不推荐，容易占端口/锁 cache）
echo   --devtools  - 启动后自动打开 DevTools（会拖慢 WebGL 帧率）
echo.
pause
exit /b 0

:parsed_args

rem === 开发启动默认参数（尽量做到“一键可跑”） ===
set "SPECWAVE_DISABLE_GPU=0"
set "SPECWAVE_ANGLE=d3d9"
set "SPECWAVE_USE_GL="
set "SPECWAVE_DISABLE_GPU_SANDBOX=0"
set "SPECWAVE_OPEN_DEVTOOLS=0"
if "%SW_DEVTOOLS%"=="1" set "SPECWAVE_OPEN_DEVTOOLS=1"

rem dev 专用 userData：避免多实例/锁文件导致 Chromium cache “拒绝访问”
set "SPECWAVE_USER_DATA_DIR=%~dp0.tmp-specwave-userdata"
if not exist "%SPECWAVE_USER_DATA_DIR%" mkdir "%SPECWAVE_USER_DATA_DIR%" >nul 2>nul

if /i "%SW_MODE%"=="d3d11" set "SPECWAVE_ANGLE=d3d11"
if /i "%SW_MODE%"=="d3d9" set "SPECWAVE_ANGLE=d3d9"
if /i "%SW_MODE%"=="warp" set "SPECWAVE_ANGLE=warp"
if /i "%SW_MODE%"=="swiftshader" set "SPECWAVE_USE_GL=swiftshader-webgl"
if /i "%SW_MODE%"=="nogpu" set "SPECWAVE_DISABLE_GPU=1"

if "%SW_CLEAN%"=="1" (
  echo [SpecWave] 清理残留进程（仅匹配当前仓库路径）...
  set "SW_ROOT=%CD%"
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$root=$env:SW_ROOT; $rx=[regex]::Escape($root); " ^
    "$names=@('electron.exe','node.exe','esbuild.exe'); " ^
    "$ps=Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.Name -in $names) -and ($_.CommandLine -match $rx) }; " ^
    "if ($ps) { $ps | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} } }"
)

echo [SpecWave] 启动：ANGLE=%SPECWAVE_ANGLE% USE_GL=%SPECWAVE_USE_GL% DISABLE_GPU=%SPECWAVE_DISABLE_GPU%
echo [SpecWave] userData：%SPECWAVE_USER_DATA_DIR%
call %PNPM% dev
pause
