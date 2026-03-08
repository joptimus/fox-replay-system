#!/usr/bin/env python3
"""
FastF1 Telemetry Extractor for Go Backend

This script:
1. Loads F1 session data via FastF1
2. Extracts raw driver telemetry arrays (x, y, speed, etc.)
3. Writes to msgpack binary file (fast serialization)
4. Tells Go where to find the file

Go then generates frames from these raw arrays.

Usage:
    python3 fetch_telemetry.py <year> <round> <session_type> [--refresh]

Output:
    - Msgpack file: computed_data/{year}_r{round}_{type}_telemetry.msgpack
    - Progress on stdout: JSON-lines with type, pct, msg
"""

import sys
import json
import argparse
from pathlib import Path
import msgpack
import fastf1

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))


def emit_progress(pct: int, msg: str):
    """Output progress message as JSON-line."""
    print(json.dumps({
        "type": "progress",
        "pct": min(100, max(0, pct)),
        "msg": msg
    }), flush=True)


def emit_completion(cache_file: str):
    """Output completion message with cache file path."""
    print(json.dumps({
        "type": "completion",
        "cache_file": cache_file
    }), flush=True)


def emit_error(msg: str):
    """Output error message."""
    print(json.dumps({
        "type": "error",
        "message": msg
    }), flush=True)


def extract_raw_telemetry(session, session_type: str):
    """
    Extract raw telemetry from FastF1 session.

    Returns dict with raw driver arrays (not frames).
    Go will resample these to 25 FPS and generate frames.
    """
    emit_progress(30, "Extracting driver telemetry...")

    drivers = session.drivers
    driver_codes = {
        num: session.get_driver(num)["Abbreviation"]
        for num in drivers
    }

    # Get timing/position data
    try:
        results = session.results
        driver_numbers = {row["Abbreviation"]: num for _, row in results.iterrows()}
        driver_teams = {row["Abbreviation"]: row["Team"] for _, row in results.iterrows()}
        driver_colors = {row["Abbreviation"]: row.get("TeamColor", "000000") for _, row in results.iterrows()}
    except Exception as e:
        emit_progress(0, f"Warning: Could not get driver info: {e}")
        driver_numbers = {code: str(i) for i, code in enumerate(driver_codes.values())}
        driver_teams = {code: "Unknown" for code in driver_codes.values()}
        driver_colors = {code: "000000" for code in driver_codes.values()}

    # Extract raw arrays per driver
    drivers_raw = {}

    for num, code in driver_codes.items():
        try:
            # FastF1 API: get driver data from laps
            driver_laps = session.laps[session.laps["Driver"] == code]
            if driver_laps.empty:
                continue
            driver_data = driver_laps.get_telemetry()

            # Extract raw arrays
            drivers_raw[code] = {
                "t": driver_data["Time"].astype(float).tolist(),
                "x": driver_data["X"].astype(float).tolist(),
                "y": driver_data["Y"].astype(float).tolist(),
                "dist": driver_data.get("Distance", [0] * len(driver_data)).astype(float).tolist(),
                "rel_dist": driver_data.get("RelativeDistance", [0] * len(driver_data)).astype(float).tolist(),
                "speed": driver_data["Speed"].astype(float).tolist(),
                "gear": driver_data.get("Gear", [0] * len(driver_data)).astype(int).tolist(),
                "throttle": driver_data.get("Throttle", [0] * len(driver_data)).astype(float).tolist(),
                "brake": driver_data.get("Brake", [0] * len(driver_data)).astype(float).tolist(),
                "rpm": driver_data.get("RPM", [0] * len(driver_data)).astype(int).tolist(),
                "drs": driver_data.get("DRS", [0] * len(driver_data)).astype(int).tolist(),
            }
        except Exception as e:
            print(f"Warning: Could not extract telemetry for driver {code}: {e}", file=sys.stderr)
            continue

    emit_progress(60, f"Processing {len(drivers_raw)} drivers...")

    # Get lap and tyre data
    try:
        laps = session.laps
        lap_data = {}
        tyre_data = {}

        for code in drivers_raw.keys():
            driver_laps = laps[laps["Driver"] == code]
            if not driver_laps.empty:
                # Get lap numbers from telemetry times
                lap_data[code] = [1] * len(drivers_raw[code]["t"])
                # Get tyre compounds
                tyre_map = {"SOFT": 0, "MEDIUM": 1, "HARD": 2, "INTERMEDIATE": 3, "WET": 4}
                tyres = driver_laps["Compound"].map(tyre_map).astype(int).tolist() if "Compound" in driver_laps.columns else [0]
                tyre_data[code] = tyres if tyres else [0] * len(drivers_raw[code]["t"])

        # Add lap/tyre to raw drivers
        for code in drivers_raw.keys():
            if code in lap_data:
                drivers_raw[code]["lap"] = lap_data[code]
            else:
                drivers_raw[code]["lap"] = [1] * len(drivers_raw[code]["t"])

            if code in tyre_data:
                drivers_raw[code]["tyre"] = tyre_data[code]
            else:
                drivers_raw[code]["tyre"] = [0] * len(drivers_raw[code]["t"])
    except Exception as e:
        print(f"Warning: Could not extract lap/tyre data: {e}", file=sys.stderr)
        for code in drivers_raw.keys():
            drivers_raw[code]["lap"] = [1] * len(drivers_raw[code]["t"])
            drivers_raw[code]["tyre"] = [0] * len(drivers_raw[code]["t"])

    # Get timing data (gap, position, interval)
    emit_progress(70, "Extracting timing data...")
    try:
        timing = session.get_session_status()
        timing_data = {
            "gap_by_driver": {code: [0.0] * len(drivers_raw[code]["t"]) for code in drivers_raw.keys()},
            "pos_by_driver": {code: [1] * len(drivers_raw[code]["t"]) for code in drivers_raw.keys()},
            "interval_smooth_by_driver": {code: [0.0] * len(drivers_raw[code]["t"]) for code in drivers_raw.keys()},
            "abs_timeline": [t for code in drivers_raw.keys() for t in drivers_raw[code]["t"]]
        }
    except Exception as e:
        print(f"Warning: Could not extract timing data: {e}", file=sys.stderr)
        timing_data = {
            "gap_by_driver": {code: [0.0] * len(drivers_raw[code]["t"]) for code in drivers_raw.keys()},
            "pos_by_driver": {code: [1] * len(drivers_raw[code]["t"]) for code in drivers_raw.keys()},
            "interval_smooth_by_driver": {code: [0.0] * len(drivers_raw[code]["t"]) for code in drivers_raw.keys()},
            "abs_timeline": [t for code in drivers_raw.keys() for t in drivers_raw[code]["t"]]
        }

    # Get track status
    try:
        track_statuses = []
        for _, row in session.get_session_status().iterrows():
            track_statuses.append({
                "status": str(row.get("Status", "1")),
                "start_time": float(row.get("Time", 0)),
                "end_time": float(row.get("Time", 0))
            })
    except Exception:
        track_statuses = [{"status": "1", "start_time": 0, "end_time": 999999}]

    # Build payload
    payload = {
        "global_t_min": min([min(drivers_raw[code]["t"]) for code in drivers_raw.keys()] + [0]),
        "global_t_max": max([max(drivers_raw[code]["t"]) for code in drivers_raw.keys()] + [0]),
        "drivers": drivers_raw,
        "timing": timing_data,
        "track_statuses": track_statuses,
        "driver_colors": driver_colors,
        "driver_numbers": driver_numbers,
        "driver_teams": driver_teams,
        "driver_lap_positions": {code: [1] * len(drivers_raw[code]["lap"]) for code in drivers_raw.keys()},
        "weather_times": [],
        "weather_data": {
            "track_temp": [],
            "air_temp": [],
            "humidity": [],
            "wind_speed": [],
            "wind_direction": [],
            "rainfall": []
        },
        "race_start_time_absolute": 0.0,
        "total_laps": max([max(drivers_raw[code]["lap"]) for code in drivers_raw.keys()] + [1]),
        "track_geometry_telemetry": {"x": [], "y": []}
    }

    return payload


def main():
    parser = argparse.ArgumentParser(description="FastF1 Telemetry Extractor for Go Backend")
    parser.add_argument("year", type=int, help="Season year (e.g., 2025)")
    parser.add_argument("round", type=int, help="Round number (e.g., 1)")
    parser.add_argument("session_type", choices=["R", "S", "Q", "SQ"],
                       help="Session type: R=Race, S=Sprint, Q=Qualifying, SQ=SprintQuali")
    parser.add_argument("--refresh", action="store_true", help="Force refresh data")

    args = parser.parse_args()

    try:
        emit_progress(5, f"Loading FastF1 session {args.year} R{args.round} {args.session_type}...")

        # Load session
        session_map = {"R": "Race", "S": "Sprint", "Q": "Qualifying", "SQ": "SprintQualifying"}
        session = fastf1.get_session(args.year, args.round, session_map[args.session_type])
        session.load(telemetry=True, weather=True)

        emit_progress(20, f"Extracting {args.session_type} telemetry...")

        # Extract raw data
        payload = extract_raw_telemetry(session, args.session_type)

        # Write to msgpack file
        emit_progress(80, "Writing telemetry to cache file...")

        cache_dir = Path(__file__).parent.parent / "computed_data"
        cache_dir.mkdir(parents=True, exist_ok=True)

        cache_file = cache_dir / f"{args.year}_r{args.round}_{args.session_type}_telemetry.msgpack"

        # msgpack.packb returns bytes
        payload_bytes = msgpack.packb(payload, use_bin_type=True)
        with open(cache_file, 'wb') as f:
            f.write(payload_bytes)

        emit_progress(100, "Extraction complete!")
        emit_completion(str(cache_file))

        return 0

    except Exception as e:
        import traceback
        error_msg = f"ERROR: {str(e)}"
        emit_progress(0, error_msg)
        print(f"Traceback: {traceback.format_exc()}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
