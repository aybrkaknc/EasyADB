@echo off
rem Starts EasyADB in development mode with hot reload.
rem Frontend changes reload instantly (Vite HMR); Rust changes rebuild and restart the app.
rem Stops a previously running EasyADB first so its exe is not locked during rebuild.

cd /d "%~dp0"

taskkill /IM easy-adb.exe /F >nul 2>&1

call npm run tauri dev
if errorlevel 1 pause
