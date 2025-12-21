@echo off
echo OpenSpec Visualizer - Installation
echo ===================================
echo.

:: 设置镜像
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set npm_config_registry=https://registry.npmmirror.com

:: 清理旧的 node_modules
if exist "node_modules" (
    echo Cleaning old node_modules...
    rmdir /s /q node_modules
)

:: 安装依赖
echo Installing dependencies...
call npm install

if errorlevel 1 (
    echo.
    echo Installation failed!
    echo Please check your network connection and try again.
    pause
    exit /b 1
)

echo.
echo Installation complete!
echo.
echo To start the application, run: npm run electron:dev
echo Or double-click start.bat
echo.
pause
