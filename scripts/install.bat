@echo off
setlocal enabledelayedexpansion

REM F1 Race Replay - One-Click Setup
REM Installs all dependencies for backend and frontend

echo.
echo ╔════════════════════════════════════════════╗
echo ║   F1 Race Replay - Setup                   ║
echo ╚════════════════════════════════════════════╝
echo.

set "PROJECT_ROOT=%~dp0.."

REM Check Python
echo Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python 3.8+ not found
    echo Install from: https://www.python.org/
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version') do echo ✅ %%i
echo.

REM Check Node.js
echo Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js 16+ not found
    echo Install from: https://nodejs.org/
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do echo ✅ Node.js %%i
echo.

REM Check npm
echo Checking npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ npm not found
    echo Install Node.js from: https://nodejs.org/
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version') do echo ✅ npm %%i
echo.

REM Create Python virtual environment
echo Setting up Python environment...
if not exist "%PROJECT_ROOT%\backend\venv" (
    echo Creating virtual environment...
    python -m venv "%PROJECT_ROOT%\backend\venv"
) else (
    echo Virtual environment already exists
)

REM Activate venv and install backend dependencies
echo Installing backend dependencies...
call "%PROJECT_ROOT%\backend\venv\Scripts\activate.bat"
python -m pip install --upgrade pip >nul 2>&1
pip install -r "%PROJECT_ROOT%\backend\requirements.txt" >nul 2>&1
echo ✅ Backend dependencies installed
echo.

REM Install FastAPI and uvicorn if not already present
echo Installing FastAPI and server...
pip install fastapi uvicorn python-dotenv >nul 2>&1
echo ✅ FastAPI and uvicorn installed
echo.

REM Install frontend dependencies
echo Installing frontend dependencies...
cd "%PROJECT_ROOT%\frontend"
call npm install >nul 2>&1
echo ✅ Frontend dependencies installed
cd "%PROJECT_ROOT%"
echo.

echo ╔════════════════════════════════════════════╗
echo ║   ✨ Setup Complete!                       ║
echo ╚════════════════════════════════════════════╝
echo.
echo Start development with:
echo   npm run dev
echo.
echo Or run services manually:
echo   Backend:  cd backend ^&^& call venv\Scripts\activate.bat ^&^& python main.py
echo   Frontend: cd frontend ^&^& npm run dev
echo.
echo Backend API: http://localhost:8000
echo Frontend:    http://localhost:5173
echo.

pause
