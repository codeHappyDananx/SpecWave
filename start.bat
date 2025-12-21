@echo off
echo OpenSpec Visualizer - Desktop Application
echo ==========================================
echo.

:: 设置 Electron 镜像
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

:: 检查 node_modules 是否存在
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install --registry https://registry.npmmirror.com
    if errorlevel 1 (
        echo.
        echo Installation failed. Please try again.
        pause
        exit /b 1
    )
)

:: 检查 Electron 是否正确安装
if not exist "node_modules\electron\dist" (
    echo Reinstalling Electron...
    rmdir /s /q node_modules\electron 2>nul
    call npm install electron --registry https://registry.npmmirror.com
)

echo.
echo Starting application...
echo.

:: 启动开发服务器和 Electron
call npm run electron:dev

pause
