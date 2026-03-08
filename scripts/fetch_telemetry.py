#!/usr/bin/env python3
"""
FastF1 Telemetry Bridge for Go Backend

This standalone script:
1. Loads F1 session data via FastF1
2. Extracts driver telemetry using multiprocessing
3. Outputs raw arrays as JSON-lines to stdout (for Go to parse)
4. Does NOT generate frames (Go does that)

Usage:
    python3 fetch_telemetry.py <year> <round> <session_type> [--refresh]

Output (JSON-lines):
    {"type":"progress","pct":10,"msg":"Loading FastF1 session..."}
    {"type":"progress","pct":50,"msg":"Extracting telemetry..."}
    {"type":"data","payload":{...raw telemetry data...}}

This script is called as a subprocess by the Go backend and
communicates via stdout.
"""

import sys
import json
import argparse
from pathlib import Path

# Add parent directory to path to import shared modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from shared.telemetry.f1_data import get_race_telemetry, get_quali_telemetry
from shared.lib.tyres import TYRE_MAPPING


def emit_progress(pct: int, msg: str):
    """Emit progress message as JSON-line."""
    print(json.dumps({
        "type": "progress",
        "pct": min(100, max(0, pct)),
        "msg": msg
    }), flush=True)


def emit_data(data: dict):
    """Emit data payload as JSON-line."""
    print(json.dumps({
        "type": "data",
        "payload": data
    }), flush=True)


def serialize_for_go(frames: list, session_type: str = "R") -> dict:
    """
    Convert frame list to raw arrays format for Go.

    Go will receive this and:
    1. Reindex to consistent 25 FPS timeline
    2. Interpolate/resample all telemetry
    3. Generate frames

    This keeps the bridge simple - just extract raw data.
    """
    emit_progress(80, "Serializing telemetry for Go...")

    if not frames:
        return {
            "global_t_min": 0,
            "global_t_max": 0,
            "drivers": {},
            "timing": {
                "gap_by_driver": {},
                "pos_by_driver": {},
                "interval_smooth_by_driver": {},
                "abs_timeline": []
            },
            "track_statuses": [],
            "driver_colors": {},
            "driver_lap_positions": {},
            "driver_numbers": {},
            "driver_teams": {},
            "weather_times": [],
            "weather_data": {
                "track_temp": [],
                "air_temp": [],
                "humidity": [],
                "wind_speed": [],
                "wind_direction": [],
                "rainfall": []
            },
            "race_start_time_absolute": 0,
            "total_laps": 0,
            "track_geometry_telemetry": {"x": [], "y": []}
        }

    # Extract unique drivers and their data
    drivers = {}
    global_t_min = float('inf')
    global_t_max = float('-inf')
    timing_data = {}
    driver_colors = {}
    driver_numbers = {}
    driver_teams = {}
    driver_lap_positions = {}

    for frame in frames:
        t = frame.get("t", 0)
        global_t_min = min(global_t_min, t)
        global_t_max = max(global_t_max, t)

        for code, driver_data in frame.get("drivers", {}).items():
            if code not in drivers:
                drivers[code] = {
                    "t": [],
                    "x": [],
                    "y": [],
                    "dist": [],
                    "rel_dist": [],
                    "lap": [],
                    "tyre": [],
                    "speed": [],
                    "gear": [],
                    "drs": [],
                    "throttle": [],
                    "brake": [],
                    "rpm": []
                }
                timing_data[code] = {
                    "gap": [],
                    "pos_raw": [],
                    "interval_smooth": []
                }

            # Append telemetry values
            drivers[code]["t"].append(float(t))
            drivers[code]["x"].append(float(driver_data.get("x", 0)))
            drivers[code]["y"].append(float(driver_data.get("y", 0)))
            drivers[code]["dist"].append(float(driver_data.get("dist", 0)))
            drivers[code]["rel_dist"].append(float(driver_data.get("rel_dist", 0)))
            drivers[code]["lap"].append(int(driver_data.get("lap", 0)))
            drivers[code]["tyre"].append(int(driver_data.get("tyre", 0)))
            drivers[code]["speed"].append(float(driver_data.get("speed", 0)))
            drivers[code]["gear"].append(int(driver_data.get("gear", 0)))
            drivers[code]["drs"].append(int(driver_data.get("drs", 0)))
            drivers[code]["throttle"].append(float(driver_data.get("throttle", 0)))
            drivers[code]["brake"].append(float(driver_data.get("brake", 0)))
            drivers[code]["rpm"].append(int(driver_data.get("rpm", 0)))

            # Timing data
            timing_data[code]["gap"].append(float(driver_data.get("gap", 0)))
            timing_data[code]["pos_raw"].append(int(driver_data.get("pos_raw", 0)))
            timing_data[code]["interval_smooth"].append(float(driver_data.get("interval_smooth", 0)))

            # Metadata (from first frame with data)
            if code not in driver_colors:
                color = driver_data.get("color", [128, 128, 128])
                driver_colors[code] = color if isinstance(color, list) else [128, 128, 128]
            if code not in driver_numbers:
                driver_numbers[code] = str(driver_data.get("number", ""))
            if code not in driver_teams:
                driver_teams[code] = driver_data.get("team", "")

    emit_progress(90, "Finalizing telemetry payload...")

    return {
        "global_t_min": float(global_t_min) if global_t_min != float('inf') else 0,
        "global_t_max": float(global_t_max) if global_t_max != float('-inf') else 0,
        "drivers": drivers,
        "timing": {
            "gap_by_driver": {code: data["gap"] for code, data in timing_data.items()},
            "pos_by_driver": {code: data["pos_raw"] for code, data in timing_data.items()},
            "interval_smooth_by_driver": {code: data["interval_smooth"] for code, data in timing_data.items()},
            "abs_timeline": [f.get("t", 0) for f in frames]
        },
        "track_statuses": [
            {"status": str(f.get("track_status", "1")), "start_time": f.get("t", 0), "end_time": f.get("t", 0)}
            for f in frames[:1]  # Simplified: just session status
        ],
        "driver_colors": driver_colors,
        "driver_lap_positions": driver_lap_positions,
        "driver_numbers": driver_numbers,
        "driver_teams": driver_teams,
        "weather_times": [f.get("t", 0) for f in frames],
        "weather_data": {
            "track_temp": [f.get("weather", {}).get("track_temp", 0) for f in frames],
            "air_temp": [f.get("weather", {}).get("air_temp", 0) for f in frames],
            "humidity": [f.get("weather", {}).get("humidity", 0) for f in frames],
            "wind_speed": [f.get("weather", {}).get("wind_speed", 0) for f in frames],
            "wind_direction": [f.get("weather", {}).get("wind_direction", 0) for f in frames],
            "rainfall": [f.get("weather", {}).get("rainfall", 0) for f in frames]
        },
        "race_start_time_absolute": float(frames[0].get("t", 0)) if frames else 0,
        "total_laps": max([f.get("lap", 0) for f in frames]) if frames else 0,
        "track_geometry_telemetry": {"x": [], "y": []}
    }


def main():
    parser = argparse.ArgumentParser(
        description="FastF1 Telemetry Bridge for Go Backend"
    )
    parser.add_argument("year", type=int, help="Season year (e.g., 2025)")
    parser.add_argument("round", type=int, help="Round number (e.g., 1)")
    parser.add_argument("session_type", choices=["R", "S", "Q", "SQ"],
                       help="Session type: R=Race, S=Sprint, Q=Qualifying, SQ=SprintQuali")
    parser.add_argument("--refresh", action="store_true",
                       help="Force refresh data (bypass cache)")

    args = parser.parse_args()

    try:
        emit_progress(5, f"Loading FastF1 session {args.year} R{args.round} {args.session_type}...")

        # Load telemetry based on session type
        if args.session_type in ["Q", "SQ"]:
            emit_progress(20, "Extracting qualifying telemetry...")
            frames = get_quali_telemetry(
                year=args.year,
                round_num=args.round,
                refresh=args.refresh
            )
        else:  # Race or Sprint
            emit_progress(20, "Extracting race/sprint telemetry...")
            frames = get_race_telemetry(
                year=args.year,
                round_num=args.round,
                session_type=args.session_type,
                refresh=args.refresh
            )

        emit_progress(70, f"Processing {len(frames)} frames...")

        # Serialize to format Go expects
        payload = serialize_for_go(frames, args.session_type)

        emit_progress(95, "Sending data to Go backend...")
        emit_data(payload)

        emit_progress(100, "Done!")
        return 0

    except Exception as e:
        emit_progress(0, f"ERROR: {str(e)}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
