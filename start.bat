@echo off
chcp 65001 >nul
title Yamaha STY 單軌聚焦播放與編輯器
cd /d "%~dp0"

echo =======================================================
echo   Yamaha STY 單軌聚焦播放與編輯器 (Player & Editor)
echo =======================================================
echo.

:: 檢查是否已安裝 node_modules
if not exist "node_modules\" (
    echo [資訊] 偵測到首次執行，正在自動安裝相依套件 (npm install)...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [錯誤] 相依套件安裝失敗，請確認電腦是否已安裝 Node.js！
        pause
        exit /b %errorlevel%
    )
    echo [完成] 套件安裝成功！
    echo.
)

echo [資訊] 正在啟動 Vite 開發伺服器並自動開啟瀏覽器...
echo [提示] 伺服器運行中請勿關閉此視窗；若要停止請按 Ctrl + C。
echo =======================================================
echo.

:: 啟動 Vite 並自動在瀏覽器中開啟頁面
call npm run dev -- --open

if %errorlevel% neq 0 (
    echo.
    echo [提示] 伺服器已結束運行。
    pause
)
