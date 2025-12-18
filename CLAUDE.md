# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

F1 Race Replay is a Python application for visualizing Formula 1 race telemetry and replaying race events with interactive controls. It uses FastF1 for telemetry data and Arcade for graphical rendering.

## RULES

**FOLLOW RULES IN .claude/rules/RULES.MD***

## Common Commands

### Running the Application

**Race replay (default):**
```bash
python main.py --year 2025 --round 12
```

**Sprint race:**
```bash
python main.py --year 2025 --round 12 --sprint
```

**Qualifying session:**
```bash
python main.py --year 2025 --round 12 --qualifying
```

**Sprint qualifying:**
```bash
python main.py --year 2025 --round 12 --sprint-qualifying
```

**Force data recomputation (bypass cache):**
```bash
python main.py --year 2025 --round 12 --refresh-data
```

### Utility Commands

**List all rounds for a year:**
```bash
python main.py --year 2025 --list-rounds
```

**List sprint rounds for a year:**
```bash
python main.py --year 2025 --list-sprints
```

### Installing Dependencies

```bash
pip install -r requirements.txt
```

## Architecture Overview

### Data Flow

1. **Session Loading** (`src/f1_data.py`): Loads F1 session data via FastF1 API
2. **Telemetry Processing**: Extracts and resamples driver telemetry at 25 FPS using multiprocessing
3. **Frame Generation**: Creates timeline of driver positions, speeds, gears, DRS status, etc.
4. **Caching**: Saves computed telemetry to `computed_data/` using pickle for fast reload
5. **Visualization**: Arcade window renders track, cars, leaderboard, and telemetry

### Key Architecture Patterns

**Multiprocessing for Performance:**
- Driver telemetry processing uses `multiprocessing.Pool` to parallelize extraction
- Top-level functions `_process_single_driver` and `_process_quali_driver` are required for pickling
- Utilizes all CPU cores for faster data processing

**Frame-based Animation:**
- All telemetry resampled to common timeline at 25 FPS (`FPS = 25, DT = 1/25`)
- Timeline starts at `global_t_min` shifted to zero for consistent playback
- Frame index uses float for smooth playback speed control

**Component-based UI:**
- UI elements inherit from `BaseComponent` with lifecycle methods:
  - `on_resize(window)`: Handle window resizing
  - `draw(window)`: Render the component
  - `on_mouse_press(window, x, y, button, modifiers)`: Handle mouse input
- Components: `LeaderboardComponent`, `WeatherComponent`, `LegendComponent`, `DriverInfoComponent`, `RaceProgressBarComponent`, `LapTimeLeaderboardComponent`, `QualifyingSegmentSelectorComponent`

**Two Interface Types:**
1. **Race Replay** (`src/interfaces/race_replay.py`): Multi-driver race visualization with live leaderboard
2. **Qualifying** (`src/interfaces/qualifying.py`): Single-driver telemetry analysis with segment selection

### File Structure

- **`main.py`**: Entry point, argument parsing, session type routing
- **`src/f1_data.py`**: All telemetry loading, processing, and caching logic
- **`src/arcade_replay.py`**: Minimal wrapper to launch race replay window
- **`src/interfaces/race_replay.py`**: Race replay window with track rendering and multi-driver support
- **`src/interfaces/qualifying.py`**: Qualifying telemetry window with chart visualization
- **`src/ui_components.py`**: All reusable UI components and track geometry functions
- **`src/lib/tyres.py`**: Tyre compound mapping (string ↔ int)
- **`src/lib/time.py`**: Time formatting utilities
- **`.fastf1-cache/`**: FastF1 API cache (auto-created)
- **`computed_data/`**: Preprocessed telemetry pickle files (auto-created)

### Important Data Structures

**Frame Dictionary Structure (Race):**
```python
{
    "t": float,           # Time in seconds from race start
    "lap": int,           # Leader's current lap
    "drivers": {
        "HAM": {          # Driver code
            "x": float, "y": float,      # Track position (meters)
            "dist": float,               # Total race distance (meters)
            "rel_dist": float,           # Relative distance (0-1, 1=out/finished)
            "lap": int,                  # Current lap number
            "tyre": int,                 # Tyre compound (0-4)
            "position": int,             # Race position
            "speed": float,              # Speed (km/h)
            "gear": int,                 # Current gear (0-8)
            "drs": int,                  # DRS status (0/8/10/12/14)
            "throttle": float,           # Throttle (0-100)
            "brake": float               # Brake (0-100)
        }
    },
    "weather": {         # Optional weather data
        "track_temp": float, "air_temp": float,
        "humidity": float, "wind_speed": float,
        "wind_direction": float, "rain_state": str
    }
}
```

**DRS Status Values:**
- `0`: DRS off
- `8`: DRS available but not activated
- `10/12/14`: DRS activated

**Track Status Codes (from FastF1):**
- `"1"`: Green/All Clear
- `"2"`: Yellow Flag
- `"4"`: Safety Car
- `"5"`: Red Flag
- `"6"/"7"`: Virtual Safety Car (VSC)

### Coordinate System and Rendering

**World vs Screen Coordinates:**
- Telemetry provides world coordinates (x, y in meters)
- Circuit rotation applied via rotation matrix (`_cos_rot`, `_sin_rot`)
- Scaled to screen coordinates using `world_scale`, `tx`, `ty` translations
- Track fitting algorithm ensures full circuit visible with UI margins

**Track Geometry Construction:**
- Center line from example lap telemetry (x, y coordinates)
- Perpendicular normals computed via gradient to create track edges
- Inner/outer boundaries offset by `track_width/2`
- Interpolated to smooth polylines for rendering

### Caching Strategy

**Two-level Cache:**
1. **FastF1 Cache** (`.fastf1-cache/`): Raw F1 API responses
2. **Computed Telemetry Cache** (`computed_data/`): Processed frame data
   - Filenames: `{event_name}_{race|sprint|quali|sprintquali}_telemetry.pkl`
   - Use `--refresh-data` to bypass and recompute

**Cache Files Include:**
- Frames array with all driver positions/telemetry
- Driver colors (team colors from FastF1)
- Track statuses (flags, safety car periods)
- Total laps, speed ranges (qualifying)

### Known Issues

**Leaderboard Accuracy:**
- Position calculations based on race distance may be inaccurate in first few corners
- Pit stops temporarily affect leaderboard accuracy
- Final positions sometimes affected by final telemetry point locations
- These are telemetry data quality issues being addressed incrementally

**Performance:**
- First run for a session requires telemetry computation (can take minutes)
- Subsequent runs load from cache (near-instant)
- Large races (many laps) generate large frame arrays

## Development Guidelines

**When modifying telemetry processing:**
- Changes to `get_race_telemetry` or `get_quali_telemetry` require `--refresh-data` to see effects
- Multiprocessing worker functions must be top-level (not nested) for pickle compatibility
- Maintain 25 FPS resampling for consistent playback

**When adding UI components:**
- Inherit from `BaseComponent` in `src/ui_components.py`
- Implement `draw(window)` at minimum
- Optional: `on_resize(window)`, `on_mouse_press(...)`, `on_mouse_motion(...)`
- Return `True` from `on_mouse_press` to consume event and stop propagation

**When working with track rendering:**
- World coordinates are in meters (FastF1 telemetry)
- Apply rotation first, then scale and translate to screen space
- Use `_world_to_screen(x, y)` helper methods in window classes

**Testing different sessions:**
- Use `--list-rounds` to find valid round numbers
- Session types: `'R'` (Race), `'S'` (Sprint), `'Q'` (Qualifying), `'SQ'` (Sprint Qualifying)
- Not all events have sprint sessions

## Project Vision (from roadmap.md)

This project aims to be the best way for data-loving F1 fans to explore race weekend data:
- **GUI Menu System** (planned): Navigate sessions and data views
- **Qualifying & Practice** (in development): Full session replay support
- **Lap Telemetry Analysis** (in development): Speed traces and performance analysis
- **Comparison Tools** (planned): Side-by-side driver/lap comparisons
