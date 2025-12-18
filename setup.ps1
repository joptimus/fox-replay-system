# F1 Race Replay - Complete Setup Script
# Run this script in PowerShell to automatically set up everything

param(
    [switch]$SkipBackend = $false,
    [switch]$SkipFrontend = $false,
    [switch]$Dev = $false
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Header {
    param([string]$Text)
    Write-Host "`n" -ForegroundColor White
    Write-Host "===============================================" -ForegroundColor Cyan
    Write-Host $Text -ForegroundColor Cyan
    Write-Host "===============================================" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Text)
    Write-Host "✓ $Text" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Text)
    Write-Host "✗ $Text" -ForegroundColor Red
}

function Write-Info {
    param([string]$Text)
    Write-Host "ℹ $Text" -ForegroundColor Yellow
}

# Check if running as administrator
function Test-Admin {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

Write-Header "F1 Race Replay - Complete Setup"

# Welcome message
Write-Host "This script will set up the React + FastAPI application." -ForegroundColor White
Write-Host "It will install all dependencies and get everything ready to run." -ForegroundColor White
Write-Host ""

# Check Python
Write-Header "Checking Python Installation"

$pythonCheck = python --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error-Custom "Python not found! Please install Python 3.11 or 3.12 from python.org"
    Write-Info "Download from: https://www.python.org/downloads/"
    exit 1
}

Write-Host "Found: $pythonCheck" -ForegroundColor Green
$pythonVersion = $pythonCheck -match '\d+\.\d+' | ForEach-Object { $matches[0] }
Write-Success "Python version: $pythonVersion"

# Check Node.js
Write-Header "Checking Node.js Installation"

$nodeCheck = node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error-Custom "Node.js not found! Please install Node.js 18+ from nodejs.org"
    Write-Info "Download from: https://nodejs.org/"
    exit 1
}

Write-Host "Found: $nodeCheck" -ForegroundColor Green
Write-Success "Node.js is installed"

# Check npm
$npmVersion = npm --version 2>&1
Write-Host "npm version: $npmVersion" -ForegroundColor Green

# Backend Setup
if (-not $SkipBackend) {
    Write-Header "Setting Up Backend (FastAPI)"

    $backendPath = ".\backend"

    if (-not (Test-Path $backendPath)) {
        Write-Error-Custom "Backend directory not found at $backendPath"
        exit 1
    }

    Write-Info "Creating Python virtual environment..."
    $venvPath = Join-Path $backendPath "venv"

    if (Test-Path $venvPath) {
        Write-Info "Virtual environment already exists, skipping creation"
    } else {
        python -m venv $venvPath
        if ($LASTEXITCODE -ne 0) {
            Write-Error-Custom "Failed to create virtual environment"
            exit 1
        }
        Write-Success "Virtual environment created"
    }

    Write-Info "Activating virtual environment..."
    & "$venvPath\Scripts\Activate.ps1"

    Write-Info "Installing Python dependencies..."
    pip install --upgrade pip 2>&1 | Out-Null
    pip install -r "$backendPath\requirements.txt"

    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Failed to install Python dependencies"
        Write-Info "Try deleting the venv folder and running the script again"
        Write-Info "Or use Python 3.11/3.12 instead of 3.13"
        exit 1
    }

    Write-Success "Backend dependencies installed"

    if ($Dev) {
        Write-Header "Starting Backend Server"
        Write-Info "Backend running on http://localhost:8000"
        Write-Info "Press Ctrl+C to stop"

        Push-Location $backendPath
        python main.py
        Pop-Location
    }
}

# Frontend Setup
if (-not $SkipFrontend) {
    Write-Header "Setting Up Frontend (React + Vite)"

    $frontendPath = ".\frontend"

    if (-not (Test-Path $frontendPath)) {
        Write-Error-Custom "Frontend directory not found at $frontendPath"
        exit 1
    }

    Write-Info "Installing npm dependencies..."
    Write-Info "This may take a minute..."

    Push-Location $frontendPath
    npm install

    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Failed to install npm dependencies"
        Pop-Location
        exit 1
    }

    Write-Success "Frontend dependencies installed"
    Pop-Location

    if ($Dev) {
        Write-Header "Starting Frontend Dev Server"
        Write-Info "Frontend running on http://localhost:5173"
        Write-Info "Press Ctrl+C to stop"

        Push-Location $frontendPath
        npm run dev
        Pop-Location
    }
}

# Success message
if (-not $Dev) {
    Write-Header "Setup Complete! ✓"
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Open Terminal 1 (Backend):" -ForegroundColor White
    Write-Host "   cd backend" -ForegroundColor Gray
    Write-Host "   .\venv\Scripts\Activate.ps1" -ForegroundColor Gray
    Write-Host "   python main.py" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Open Terminal 2 (Frontend):" -ForegroundColor White
    Write-Host "   cd frontend" -ForegroundColor Gray
    Write-Host "   npm run dev" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Open Browser:" -ForegroundColor White
    Write-Host "   http://localhost:5173" -ForegroundColor Cyan
    Write-Host ""
}
