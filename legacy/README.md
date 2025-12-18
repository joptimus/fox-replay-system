# Legacy Arcade Desktop Application

This directory contains the original Python-based desktop application using the Arcade library for visualization. This is no longer the primary application but is maintained as a reference implementation.

## Overview

The legacy application provides a desktop-based F1 race replay interface with:
- 2D track visualization using Arcade graphics
- Real-time telemetry playback
- Qualifying and race session support
- UI components for leaderboards, weather, and race progress

## Running the Legacy Application

```bash
# Race replay (default)
python legacy/main.py --year 2025 --round 12

# Sprint race
python legacy/main.py --year 2025 --round 12 --sprint

# Qualifying session
python legacy/main.py --year 2025 --round 12 --qualifying

# Force data recomputation
python legacy/main.py --year 2025 --round 12 --refresh-data

# List available rounds
python legacy/main.py --year 2025 --list-rounds
```

## Directory Structure

- `main.py` - Entry point for legacy application
- `src/arcade_replay.py` - Arcade window manager
- `src/ui_components.py` - UI component base classes and implementations
- `src/interfaces/` - Session-specific visualizations (race and qualifying)
- `scripts/` - Windows batch and PowerShell scripts (legacy build tools)

## Important Notes

- The modern web application (`frontend/` + `backend/`) is the recommended way to view F1 race data
- The legacy application shares telemetry processing logic with the backend via `shared/telemetry/`
- Dependencies and data structures are documented in the main project `CLAUDE.md`

## Shared Code

The legacy application uses shared code from the parent directory:
- `shared/telemetry/f1_data.py` - Telemetry loading and processing
- `shared/lib/time.py` - Time formatting utilities
- `shared/lib/tyres.py` - Tyre compound mapping
