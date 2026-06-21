@echo off
chcp 65001 >nul
title 美容院护理排程系统

cd /d "%~dp0"

if not exist "node_modules" (
    echo 首次运行，正在安装依赖...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo 依赖安装失败，请检查网络连接后重试。
        pause
        exit /b 1
    )
    echo.
    echo 依赖安装完成！
    echo.
)

echo 正在启动美容院护理排程系统...
npm start

if errorlevel 1 (
    echo.
    echo 启动失败，请确认已安装 Node.js。
    echo 下载地址: https://nodejs.org/
    pause
)
