# F1 Race Replay - Project Structure

## Quick Start

```bash
# Start both backend and frontend with one command
node dev.js

# Or run separately
python backend/main.py          # Backend on :8000
cd frontend && npm run dev      # Frontend on :5173

# Legacy desktop app
python legacy/main.py --year 2025 --round 12
```

## Directory Structure

```
f1-race-replay/
│
├── 📁 backend/                 Modern FastAPI web server
│   ├── main.py                 Entry point (runs FastAPI app)
│   ├── requirements.txt        Python dependencies
│   └── app/                    Application code
│       ├── main.py             FastAPI setup, middleware, routes
│       ├── api/                API endpoints
│       │   ├── rounds.py       Season/sprint routes
│       │   └── sessions.py     Session management routes
│       ├── services/           Business logic
│       │   └── replay_service.py  F1ReplaySession class
│       └── websocket.py        WebSocket handler (real-time streaming)
│
├── 📁 frontend/                React/TypeScript web UI
│   ├── package.json
│   ├── src/
│   │   ├── App.tsx             Main component
│   │   ├── components/         React components
│   │   ├── hooks/              Custom hooks (WebSocket connection)
│   │   ├── store/              Zustand state management
│   │   └── services/           API client
│   └── vite.config.ts
│
├── 📁 shared/                  Code used by both modern & legacy apps
│   ├── telemetry/
│   │   └── f1_data.py          Telemetry loading, processing, caching
│   ├── lib/
│   │   ├── tyres.py            Tyre compound mapping
│   │   └── time.py             Time formatting utilities
│   └── utils/
│       └── track_geometry.py   Track boundary calculation
│
├── 📁 legacy/                  Old Arcade desktop app (reference only)
│   ├── main.py                 Entry point
│   ├── src/                    Application code
│   │   ├── arcade_replay.py    Arcade window manager
│   │   ├── ui_components.py    UI component base classes
│   │   └── interfaces/         Session-specific visualizations
│   ├── scripts/                Legacy Windows scripts
│   └── README.md               How to run the legacy app
│
├── 📁 .claude/                 Claude Code settings & documentation
│   ├── RESTRUCTURING_COMPLETE.md   Technical restructuring details
│   └── rules/RULES.md          Coding conventions
│
├── dev.js                      One-command dev server launcher
├── CLAUDE.md                   Project guide (updated)
├── RESTRUCTURING_SUMMARY.md    What changed & why
├── PROJECT_STRUCTURE.md        This file
└── README.md                   Original project README
```

## Architecture

### Modern Web Application (Active)

```
Frontend (React)
    ↓ HTTP/WebSocket
Backend (FastAPI)
    ↓ Imports
Shared Code (Telemetry, Utilities)
```

### Legacy Desktop Application (Reference)

```
Legacy App (Arcade)
    ↓ Imports
Shared Code (Telemetry, Utilities)
```

## Key Changes from Restructuring

### What Moved

| Before | After | Reason |
|--------|-------|--------|
| `main.py` (root) | `legacy/main.py` | Isolate legacy code |
| `src/arcade_replay.py` | `legacy/src/` | Isolate legacy code |
| `src/f1_data.py` | `shared/telemetry/` | Shared by both apps |
| `src/lib/` | `shared/lib/` | Shared by both apps |
| `src/track_geometry.py` | `shared/utils/` | Shared by both apps |
| Monolithic `backend/main.py` | `backend/app/` | Better organization |

### What's New

- `backend/app/main.py` - FastAPI application setup
- `backend/app/api/` - Modularized routes
- `backend/app/services/` - Business logic
- `shared/` - Centralized shared code
- `legacy/` - Archived original app
- `legacy/README.md` - Legacy documentation
- `RESTRUCTURING_SUMMARY.md` - What changed & why
- `PROJECT_STRUCTURE.md` - This file

### What's Removed

- `src/` directory - Everything organized into `shared/` or `legacy/`

## File Organization Philosophy

**Clear Separation of Concerns:**

1. **Backend** - FastAPI web server with modular structure
   - `api/` - HTTP routes
   - `services/` - Business logic
   - `models/` - Data models
   - `core/` - Config (future)
   - `utils/` - Helpers (future)

2. **Frontend** - React web UI (unchanged)

3. **Shared** - Code used by multiple parts
   - `telemetry/` - F1 data processing
   - `lib/` - General utilities
   - `utils/` - Domain utilities

4. **Legacy** - Old application (read-only reference)

## Development Guidelines

### Adding New Backend Features

1. **New API Route?**
   - Add to `backend/app/api/new_feature.py`
   - Register router in `backend/app/main.py`

2. **New Business Logic?**
   - Add to `backend/app/services/`
   - Import and use in API routes

3. **New Data Models?**
   - Add to `backend/models/`
   - Import in API routes or services

### Using Shared Code

```python
# Telemetry processing
from shared.telemetry.f1_data import get_race_telemetry, load_session

# Utilities
from shared.lib.tyres import get_tyre_compound_int
from shared.lib.time import format_time
from shared.utils.track_geometry import build_track_from_example_lap
```

### Adding Shared Code

1. Create file in appropriate `shared/` subdirectory
2. Import from both backend and legacy code
3. Avoid dependencies on framework-specific code

## Data Flow

1. **Frontend Request** → HTTP POST to `POST /api/sessions`
2. **Backend** → Creates F1ReplaySession, loads telemetry in background
3. **Frontend Polls** → GET `GET /api/sessions/{session_id}` for status
4. **WebSocket Connection** → `ws://localhost:8000/ws/replay/{session_id}`
5. **Frame Streaming** → Backend sends frames on-demand, frontend renders
6. **Shared Code** → Both use `shared/telemetry/f1_data.py` for data processing

## Running Tests (Future)

```bash
# Backend tests
cd backend && pytest

# Frontend tests
cd frontend && npm test
```

## Documentation Files

- **CLAUDE.md** - Project guide with commands and architecture
- **RESTRUCTURING_SUMMARY.md** - Before/after comparison
- **.claude/RESTRUCTURING_COMPLETE.md** - Technical details
- **legacy/README.md** - How to use legacy desktop app
- **PROJECT_STRUCTURE.md** - This file (directory organization)

## Important Notes

- **No Breaking Changes** - All code still works exactly as before
- **Easy to Extend** - Clear where to add new features
- **Easy to Test** - Services are now isolated and testable
- **Easy to Scale** - Modular structure supports growth
- **Easy to Onboard** - New developers know where code lives

## Environment

- **Python:** 3.8+ (backend, shared code)
- **Node.js:** 16+ (frontend)
- **Package Managers:** pip (Python), npm (Node)
- **Databases:** None (data cached locally)
- **External APIs:** FastF1 for F1 telemetry

## Useful Commands

```bash
# Development
node dev.js                    # Start both servers
python backend/main.py         # Backend only
cd frontend && npm run dev     # Frontend only

# Building
cd frontend && npm run build   # Production build

# Legacy App
python legacy/main.py --year 2025 --round 12  # Race
python legacy/main.py --year 2025 --round 12 --qualifying  # Qualifying

# Dependencies
pip install -r backend/requirements.txt
cd frontend && npm install
```

---

**Last Updated:** December 18, 2024
**Project Status:** Restructuring Complete ✅
