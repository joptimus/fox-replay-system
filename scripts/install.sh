#!/bin/bash

# F1 Race Replay - One-Click Setup
# Installs all dependencies for backend and frontend

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   F1 Race Replay - Setup                   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""

# Check Python
echo -e "${CYAN}Checking Python...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3.8+ not found${NC}"
    echo "Install from: https://www.python.org/"
    exit 1
fi
PYTHON_VERSION=$(python3 --version 2>&1)
echo -e "${GREEN}✅ ${PYTHON_VERSION}${NC}"

# Check Node.js
echo -e "${CYAN}Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js 16+ not found${NC}"
    echo "Install from: https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node --version)
echo -e "${GREEN}✅ Node.js ${NODE_VERSION}${NC}"

# Check npm
echo -e "${CYAN}Checking npm...${NC}"
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not found${NC}"
    echo "Install Node.js from: https://nodejs.org/"
    exit 1
fi
NPM_VERSION=$(npm --version)
echo -e "${GREEN}✅ npm ${NPM_VERSION}${NC}"
echo ""

# Create Python virtual environment
echo -e "${CYAN}Setting up Python environment...${NC}"
if [ ! -d "$PROJECT_ROOT/backend/venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$PROJECT_ROOT/backend/venv"
else
    echo "Virtual environment already exists"
fi

# Activate venv and install backend dependencies
echo -e "${CYAN}Installing backend dependencies...${NC}"
source "$PROJECT_ROOT/backend/venv/bin/activate"
pip install --upgrade pip > /dev/null 2>&1
pip install -r "$PROJECT_ROOT/backend/requirements.txt" > /dev/null 2>&1
echo -e "${GREEN}✅ Backend dependencies installed${NC}"

# Install FastAPI and uvicorn if not already present
echo -e "${CYAN}Installing FastAPI and server...${NC}"
pip install fastapi uvicorn python-dotenv > /dev/null 2>&1
echo -e "${GREEN}✅ FastAPI and uvicorn installed${NC}"

# Install frontend dependencies
echo -e "${CYAN}Installing frontend dependencies...${NC}"
cd "$PROJECT_ROOT/frontend"
npm install > /dev/null 2>&1
echo -e "${GREEN}✅ Frontend dependencies installed${NC}"
cd "$PROJECT_ROOT"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✨ Setup Complete!                       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Start development with:${NC}"
echo -e "${YELLOW}  npm run dev${NC}"
echo ""
echo -e "${CYAN}Or run services manually:${NC}"
echo -e "${YELLOW}  Backend:${NC}  cd backend && source venv/bin/activate && python main.py"
echo -e "${YELLOW}  Frontend:${NC} cd frontend && npm run dev"
echo ""
echo -e "${CYAN}Backend API: http://localhost:8000${NC}"
echo -e "${CYAN}Frontend:    http://localhost:5173${NC}"
echo ""
