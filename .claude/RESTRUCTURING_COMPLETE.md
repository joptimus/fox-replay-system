# Project Restructuring Complete

## Overview
The F1 Race Replay project has been restructured to cleanly separate the modern web application (FastAPI + React) from the legacy Arcade desktop application. Shared telemetry code is now centralized for reuse across both applications.

## What Changed

### 1. **Legacy Application Isolated** ✅
- Moved all Arcade desktop app code to `legacy/` directory
  - `main.py` → `legacy/main.py`
  - `src/arcade_replay.py`, `src/ui_components.py`, `src/interfaces/` → `legacy/src/`
  - Legacy scripts → `legacy/scripts/`
- Updated all imports in legacy code to use relative paths
- Added `legacy/README.md` with documentation on running the legacy app

### 2. **Shared Code Centralized** ✅
- Created `shared/` directory for code used by both modern app and legacy app
  - `shared/telemetry/f1_data.py` - Core telemetry loading/processing
  - `shared/lib/time.py` - Time formatting utilities
  - `shared/lib/tyres.py` - Tyre compound mapping
- These libraries are imported by:
  - Modern backend: `backend/app/services/replay_service.py`
  - Legacy app: `legacy/src/` files

### 3. **Backend Modernized** ✅
New organized backend structure under `backend/app/`:
```
backend/
├── main.py                          # Entry point
├── app/
│   ├── main.py                      # FastAPI app setup
│   ├── api/
│   │   ├── rounds.py               # Season/sprint endpoints
│   │   └── sessions.py             # Session creation/status
│   ├── services/
│   │   └── replay_service.py       # F1ReplaySession class
│   └── websocket.py                 # WebSocket handler
├── models/
│   └── session.py                   # Request/response models
├── core/
│   └── (future config/constants)
└── utils/
    └── (future utilities)
```

Benefits:
- Clear separation of concerns (routes → services → data)
- Easier to test and maintain
- API endpoints modularized
- WebSocket logic isolated

### 4. **Documentation Updated** ✅
- Updated `CLAUDE.md` with new file paths
- Added `legacy/README.md` explaining legacy application
- Updated `.gitignore` with better organization:
  - Separate cache paths for each module
  - Frontend build artifacts
  - Python cache/pycache
  - Environment files

## File Structure Summary

### Core Directories
```
f1-race-replay/
├── backend/              # Modern FastAPI web server
│   ├── app/             # Application code
│   ├── models/          # Pydantic models
│   ├── core/            # Config (future)
│   └── main.py          # Entry point
│
├── frontend/            # React web UI (unchanged)
│
├── shared/              # Code used by both
│   ├── telemetry/       # Data processing
│   └── lib/             # Utilities
│
├── legacy/              # Old Arcade desktop app
│   ├── src/
│   ├── scripts/
│   └── README.md
│
└── src/                 # Non-shared utilities
    └── track_geometry.py  # Still used by backend
```

## Running the Application

### Modern Web Application
```bash
# Both frontend and backend
node dev.js

# Or separately
python backend/main.py          # Backend on :8000
cd frontend && npm run dev      # Frontend on :5173
```

### Legacy Desktop Application
```bash
python legacy/main.py --year 2025 --round 12
```

See `legacy/README.md` for more options.

## What Still Works

✅ **Backend starts successfully** - Tested with timeout
✅ **Frontend builds and runs** - Tested with npm run dev
✅ **Legacy app imports work** - All imports resolved
✅ **Shared code is accessible** - Both apps can import from `shared/`

## Migration Notes

- The `src/` directory still exists for non-shared utilities like `track_geometry.py`
- No changes to frontend code - it remains in `frontend/` as-is
- Cache directories (`.fastf1-cache/`, `computed_data/`, `data/`) are still created at runtime
- Legacy code uses relative path imports with `sys.path.insert()` to find shared modules

## Next Steps (Optional)

Consider these future improvements:
1. Move config to `backend/core/config.py`
2. Extract more utilities to `backend/utils/`
3. Add unit tests in parallel directory structure
4. Document backend API endpoints
5. Add type hints to shared telemetry code
6. Create environment configuration (`.env.example`)

## Files Modified/Created

**New Files:**
- `legacy/README.md` - Legacy app documentation
- `backend/app/main.py` - Refactored FastAPI app
- `backend/app/api/rounds.py` - Routes for rounds/sprints
- `backend/app/api/sessions.py` - Routes for session management
- `backend/app/services/replay_service.py` - Session business logic
- `backend/app/websocket.py` - WebSocket handler
- `backend/models/session.py` - Request models
- `shared/` directory and all subdirectories

**Modified Files:**
- `backend/main.py` - Simplified to import from backend/app/main
- `CLAUDE.md` - Updated file paths and documentation
- `.gitignore` - Improved organization
- `legacy/main.py` - Updated imports
- `legacy/src/*.py` - Updated imports to use shared/ and legacy/
- `shared/telemetry/f1_data.py` - Updated imports

**Unchanged:**
- `frontend/` - Still works as-is
- All data files and caches

**Removed:**
- `src/` directory - Consolidated into `shared/` structure
  - `track_geometry.py` moved to `shared/utils/track_geometry.py`

## Verification Checklist

- [x] Backend imports resolve correctly
- [x] Backend can start (FastAPI loads)
- [x] Frontend can start (Vite builds)
- [x] Legacy app imports work
- [x] Shared code accessible to all modules
- [x] Documentation updated
- [x] .gitignore covers all cache/build artifacts
- [x] No breaking changes to frontend or legacy app
