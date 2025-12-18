@echo off
REM F1 Race Replay - Setup Script for Command Prompt
REM This is a wrapper that calls the PowerShell setup script

setlocal enabledelayedexpansion

echo.
echo ================================================
echo    F1 Race Replay - Complete Setup
echo ================================================
echo.

REM Check if PowerShell is available
powershell -version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Error: PowerShell is required but not found
    exit /b 1
)

REM Check for command line arguments
if "%1"=="--frontend-only" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "quick-setup.ps1" -FrontendOnly
    exit /b %ERRORLEVEL%
)

if "%1"=="--dev" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "setup.ps1" -Dev
    exit /b %ERRORLEVEL%
)

if "%1"=="--help" (
    echo Usage: setup.bat [options]
    echo.
    echo Options:
    echo   (no args)         - Setup both backend and frontend
    echo   --dev             - Setup and start both servers
    echo   --frontend-only   - Setup and start only frontend
    echo   --help            - Show this help message
    echo.
    exit /b 0
)

REM Run the PowerShell setup script
powershell -NoProfile -ExecutionPolicy Bypass -File "setup.ps1"
exit /b %ERRORLEVEL%
