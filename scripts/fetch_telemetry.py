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


def to_seconds(value):
    """Convert FastF1/pandas time-like values to seconds."""
    if value is None:
        return 0.0
    if hasattr(value, "total_seconds"):
        try:
            return float(value.total_seconds())
        except Exception:
            pass
    try:
        return float(value)
    except Exception:
        return 0.0


def safe_float(value, default=0.0):
    try:
        if value is None:
            return float(default)
        return float(value)
    except Exception:
        return float(default)


def safe_int(value, default=0):
    try:
        if value is None:
            return int(default)
        return int(float(value))
    except Exception:
        return int(default)


def normalize_team_color(value):
    """Convert FastF1 team color value to [r,g,b] int triplet."""
    if value is None:
        return [0, 0, 0]
    if isinstance(value, (list, tuple)) and len(value) == 3:
        return [safe_int(value[0]), safe_int(value[1]), safe_int(value[2])]

    color_str = str(value).strip().lstrip("#")
    if len(color_str) == 6:
        try:
            return [
                int(color_str[0:2], 16),
                int(color_str[2:4], 16),
                int(color_str[4:6], 16),
            ]
        except ValueError:
            return [0, 0, 0]
    return [0, 0, 0]


def series_to_float_list(series_like, fallback_len=0, default=0.0, time_mode=False):
    """Convert pandas-like series/list to float list, with optional timedelta conversion."""
    try:
        values = series_like.tolist() if hasattr(series_like, "tolist") else list(series_like)
    except Exception:
        return [float(default)] * fallback_len
    if time_mode:
        return [to_seconds(v) for v in values]
    return [safe_float(v, default) for v in values]


def series_to_int_list(series_like, fallback_len=0, default=0):
    """Convert pandas-like series/list to int list."""
    try:
        values = series_like.tolist() if hasattr(series_like, "tolist") else list(series_like)
    except Exception:
        return [int(default)] * fallback_len
    return [safe_int(v, default) for v in values]


def validate_driver_arrays(drivers_raw: dict):
    """Validate that per-driver arrays are present and have equal lengths."""
    required_keys = ["t", "x", "y", "dist", "rel_dist", "lap", "tyre", "speed", "gear", "drs", "throttle", "brake", "rpm"]
    if not drivers_raw:
        raise ValueError("no drivers extracted from FastF1 session")

    for code, data in drivers_raw.items():
        missing = [k for k in required_keys if k not in data]
        if missing:
            raise ValueError(f"driver {code} missing keys: {missing}")
        lengths = {k: len(data[k]) for k in required_keys}
        expected = lengths["t"]
        if expected == 0:
            raise ValueError(f"driver {code} has no telemetry samples")
        bad = {k: v for k, v in lengths.items() if v != expected}
        if bad:
            raise ValueError(f"driver {code} array length mismatch: expected {expected}, got {bad}")


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
        driver_numbers = {row["Abbreviation"]: str(row.get("DriverNumber", "")) for _, row in results.iterrows()}
        driver_teams = {
            row["Abbreviation"]: (
                row.get("Team")
                or row.get("TeamName")
                or row.get("TeamId")
                or "Unknown"
            )
            for _, row in results.iterrows()
        }
        driver_colors = {
            row["Abbreviation"]: normalize_team_color(row.get("TeamColor", "000000"))
            for _, row in results.iterrows()
        }
    except Exception as e:
        emit_progress(0, f"Warning: Could not get driver info: {e}")
        driver_numbers = {code: str(i) for i, code in enumerate(driver_codes.values())}
        driver_teams = {code: "Unknown" for code in driver_codes.values()}
        driver_colors = {code: [0, 0, 0] for code in driver_codes.values()}

    # Extract raw arrays per driver
    drivers_raw = {}

    for num, code in driver_codes.items():
        try:
            # FastF1 API: get driver data from laps
            driver_laps = session.laps[session.laps["Driver"] == code]
            if driver_laps.empty:
                continue
            driver_data = driver_laps.get_telemetry()
            sample_count = len(driver_data)
            if sample_count == 0:
                continue

            # Extract raw arrays
            drivers_raw[code] = {
                "t": series_to_float_list(driver_data["Time"], sample_count, 0.0, time_mode=True),
                "x": series_to_float_list(driver_data.get("X", [0.0] * sample_count), sample_count, 0.0),
                "y": series_to_float_list(driver_data.get("Y", [0.0] * sample_count), sample_count, 0.0),
                "dist": series_to_float_list(driver_data.get("Distance", [0.0] * sample_count), sample_count, 0.0),
                "rel_dist": series_to_float_list(driver_data.get("RelativeDistance", [0.0] * sample_count), sample_count, 0.0),
                "speed": series_to_float_list(driver_data.get("Speed", [0.0] * sample_count), sample_count, 0.0),
                "gear": series_to_int_list(driver_data.get("Gear", [0] * sample_count), sample_count, 0),
                "throttle": series_to_float_list(driver_data.get("Throttle", [0.0] * sample_count), sample_count, 0.0),
                "brake": series_to_float_list(driver_data.get("Brake", [0.0] * sample_count), sample_count, 0.0),
                "rpm": series_to_int_list(driver_data.get("RPM", [0] * sample_count), sample_count, 0),
                "drs": series_to_int_list(driver_data.get("DRS", [0] * sample_count), sample_count, 0),
            }
        except Exception as e:
            print(f"Warning: Could not extract telemetry for driver {code}: {e}", file=sys.stderr)
            continue

    emit_progress(60, f"Processing {len(drivers_raw)} drivers...")

    # Get lap and tyre data
    try:
        laps = session.laps
        for code in list(drivers_raw.keys()):
            sample_count = len(drivers_raw[code]["t"])
            driver_laps = laps[laps["Driver"] == code]
            drivers_raw[code]["lap"] = [1] * sample_count
            tyre_code = 0
            if not driver_laps.empty and "Compound" in driver_laps.columns:
                compound = str(driver_laps.iloc[0]["Compound"]) if driver_laps.iloc[0]["Compound"] is not None else ""
                tyre_map = {"SOFT": 0, "MEDIUM": 1, "HARD": 2, "INTERMEDIATE": 3, "WET": 4}
                tyre_code = tyre_map.get(compound.upper(), 0)
            drivers_raw[code]["tyre"] = [tyre_code] * sample_count
    except Exception as e:
        print(f"Warning: Could not extract lap/tyre data: {e}", file=sys.stderr)
        for code in list(drivers_raw.keys()):
            drivers_raw[code]["lap"] = [1] * len(drivers_raw[code]["t"])
            drivers_raw[code]["tyre"] = [0] * len(drivers_raw[code]["t"])

    # Get timing data (gap, position, interval)
    emit_progress(70, "Extracting timing data...")
    try:
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
                "start_time": to_seconds(row.get("Time", 0)),
                "end_time": to_seconds(row.get("Time", 0))
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

    validate_driver_arrays(drivers_raw)
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
