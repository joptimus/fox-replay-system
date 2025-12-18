# F1 Race Replay - Quick Setup (One Command)
# This script sets up backend AND starts it in one go
# Then you just need to run: cd frontend && npm install && npm run dev

param(
    [switch]$FrontendOnly = $false
)

$ErrorActionPreference = "Stop"

# Colors
function Write-Header {
    param([string]$Text)
    Write-Host "`n$Text" -ForegroundColor Cyan -BackgroundColor Black
    Write-Host "=" * 50 -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Text)
    Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-Info {
    param([string]$Text)
    Write-Host "[*] $Text" -ForegroundColor Yellow
}

Write-Header "F1 Race Replay - Setup & Start"

if (-not $FrontendOnly) {
    # Backend setup
    Write-Header "Setting up Backend..."

    # Check Python
    $python = python3 --version 2>&1
    Write-Info "Python: $python"

    # Create venv if needed
    if (-not (Test-Path ".\backend\venv")) {
        Write-Info "Creating virtual environment..."
        python3 -m venv .\backend\venv
    }

    # Activate venv
    Write-Info "Activating virtual environment..."
    & ".\backend\venv\Scripts\Activate.ps1"

    # Install dependencies
    Write-Info "Installing Python packages..."
    python3 -m pip install --upgrade pip
    python3 -m pip install -r .\backend\requirements.txt

    if ($LASTEXITCODE -eq 0) {
        Write-Success "Backend ready!"
    } else {
        Write-Host "Failed to install backend dependencies" -ForegroundColor Red
        exit 1
    }

    Write-Header "Starting Backend Server..."
    Write-Host "Server running on http://localhost:8000" -ForegroundColor Green
    Write-Host "Leave this running and open another terminal for the frontend" -ForegroundColor Green
    Write-Host ""
    Write-Host "In a new terminal, run:" -ForegroundColor Cyan
    Write-Host "  cd frontend" -ForegroundColor Gray
    Write-Host "  npm install" -ForegroundColor Gray
    Write-Host "  npm run dev" -ForegroundColor Gray
    Write-Host ""

    cd .\backend
    python3 main.py
} else {
    # Frontend setup
    Write-Header "Setting up Frontend..."

    Write-Info "Installing npm packages..."
    Push-Location .\frontend
    npm install

    if ($LASTEXITCODE -eq 0) {
        Write-Success "Frontend ready!"
        Write-Header "Starting Frontend Dev Server..."
        npm run dev
    } else {
        Write-Host "Failed to install frontend dependencies" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
}
