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

            # Extract raw arrays (FastF1 uses nGear, Brake is boolean)
            brake_raw = driver_data.get("Brake", [False] * sample_count)
            brake_list = [1.0 if b else 0.0 for b in (brake_raw.tolist() if hasattr(brake_raw, "tolist") else list(brake_raw))]

            drivers_raw[code] = {
                "t": series_to_float_list(driver_data["Time"], sample_count, 0.0, time_mode=True),
                "x": series_to_float_list(driver_data.get("X", [0.0] * sample_count), sample_count, 0.0),
                "y": series_to_float_list(driver_data.get("Y", [0.0] * sample_count), sample_count, 0.0),
                "dist": series_to_float_list(driver_data.get("Distance", [0.0] * sample_count), sample_count, 0.0),
                "rel_dist": series_to_float_list(driver_data.get("RelativeDistance", [0.0] * sample_count), sample_count, 0.0),
                "speed": series_to_float_list(driver_data.get("Speed", [0.0] * sample_count), sample_count, 0.0),
                "gear": series_to_int_list(driver_data.get("nGear", [0] * sample_count), sample_count, 0),
                "throttle": series_to_float_list(driver_data.get("Throttle", [0.0] * sample_count), sample_count, 0.0),
                "brake": brake_list,
                "rpm": series_to_int_list(driver_data.get("RPM", [0] * sample_count), sample_count, 0),
                "drs": series_to_int_list(driver_data.get("DRS", [0] * sample_count), sample_count, 0),
            }
        except Exception as e:
            print(f"Warning: Could not extract telemetry for driver {code}: {e}", file=sys.stderr)
            continue

    emit_progress(60, f"Processing {len(drivers_raw)} drivers...")

    import numpy as np
    import pandas as pd

    # Get lap data, tyre compounds, positions, and gaps per telemetry sample
    tyre_map = {"SOFT": 0, "MEDIUM": 1, "HARD": 2, "INTERMEDIATE": 3, "WET": 4}
    laps = session.laps

    for code in list(drivers_raw.keys()):
        sample_count = len(drivers_raw[code]["t"])
        sample_times = np.array(drivers_raw[code]["t"])

        driver_laps = laps[laps["Driver"] == code].sort_values("LapNumber")

        if driver_laps.empty:
            drivers_raw[code]["lap"] = [1] * sample_count
            drivers_raw[code]["tyre"] = [0] * sample_count
            continue

        # Compute time offset: session.laps["Time"] is absolute session time,
        # but telemetry Time (used for drivers_raw["t"]) starts at 0 (driver-relative).
        # The offset is the session time of the driver's first telemetry sample.
        time_offset = 0.0
        first_lap_start = driver_laps.iloc[0].get("LapStartTime")
        if pd.notna(first_lap_start):
            time_offset = to_seconds(first_lap_start)

        # Build lap boundary info: end_time, lap_number, position, gap, interval, tyre
        lap_boundaries = []
        for _, lap_row in driver_laps.iterrows():
            end_time = to_seconds(lap_row.get("Time")) - time_offset
            lap_num = safe_int(lap_row.get("LapNumber"), 1)
            pos = safe_int(lap_row.get("Position"), 0)

            # Gap to leader (timedelta -> seconds)
            gap_val = 0.0
            raw_gap = lap_row.get("GapToLeader") if "GapToLeader" in driver_laps.columns else None
            if raw_gap is None and "Gap" in driver_laps.columns:
                raw_gap = lap_row.get("Gap")
            if raw_gap is not None:
                gap_val = to_seconds(raw_gap)

            # Interval to position ahead
            interval_val = 0.0
            raw_interval = lap_row.get("IntervalToPositionAhead") if "IntervalToPositionAhead" in driver_laps.columns else None
            if raw_interval is not None:
                interval_val = to_seconds(raw_interval)

            # Tyre compound
            compound = str(lap_row.get("Compound", "")) if lap_row.get("Compound") is not None else ""
            tyre_code = tyre_map.get(compound.upper(), 0)

            # Lap time and sector times (timedelta -> seconds)
            lap_time_val = to_seconds(lap_row.get("LapTime")) if pd.notna(lap_row.get("LapTime")) else 0.0
            sector1_val = to_seconds(lap_row.get("Sector1Time")) if pd.notna(lap_row.get("Sector1Time")) else 0.0
            sector2_val = to_seconds(lap_row.get("Sector2Time")) if pd.notna(lap_row.get("Sector2Time")) else 0.0
            sector3_val = to_seconds(lap_row.get("Sector3Time")) if pd.notna(lap_row.get("Sector3Time")) else 0.0

            if end_time > 0:
                lap_boundaries.append({
                    "end_time": end_time,
                    "lap_num": lap_num,
                    "position": pos,
                    "gap": gap_val,
                    "interval": interval_val,
                    "tyre": tyre_code,
                    "lap_time": lap_time_val,
                    "sector1": sector1_val,
                    "sector2": sector2_val,
                    "sector3": sector3_val,
                })

        if not lap_boundaries:
            drivers_raw[code]["lap"] = [1] * sample_count
            drivers_raw[code]["tyre"] = [0] * sample_count
            continue

        # Sort by end time and use searchsorted to assign each sample to a lap
        lap_boundaries.sort(key=lambda x: x["end_time"])
        end_times = np.array([lb["end_time"] for lb in lap_boundaries])

        # For each sample, find the lap it belongs to (first lap whose end_time >= sample_time)
        indices = np.searchsorted(end_times, sample_times, side="left")

        lap_arr = []
        tyre_arr = []
        pos_arr = []
        gap_arr = []
        interval_arr = []
        lap_time_arr = []
        sector1_arr = []
        sector2_arr = []
        sector3_arr = []

        for idx in indices:
            if idx < len(lap_boundaries):
                lb = lap_boundaries[idx]
            else:
                lb = lap_boundaries[-1]
            lap_arr.append(lb["lap_num"])
            tyre_arr.append(lb["tyre"])
            pos_arr.append(lb["position"])
            gap_arr.append(lb["gap"])
            interval_arr.append(lb["interval"])
            lap_time_arr.append(lb["lap_time"])
            sector1_arr.append(lb["sector1"])
            sector2_arr.append(lb["sector2"])
            sector3_arr.append(lb["sector3"])

        drivers_raw[code]["lap"] = lap_arr
        drivers_raw[code]["tyre"] = tyre_arr
        drivers_raw[code]["_pos"] = pos_arr
        drivers_raw[code]["_gap"] = gap_arr
        drivers_raw[code]["_interval"] = interval_arr
        drivers_raw[code]["_lap_time"] = lap_time_arr
        drivers_raw[code]["_sector1"] = sector1_arr
        drivers_raw[code]["_sector2"] = sector2_arr
        drivers_raw[code]["_sector3"] = sector3_arr

    # Build timing data from extracted lap-level positions and gaps
    emit_progress(70, "Extracting timing data...")
    timing_data = {
        "gap_by_driver": {},
        "pos_by_driver": {},
        "interval_smooth_by_driver": {},
        "lap_time_by_driver": {},
        "sector1_by_driver": {},
        "sector2_by_driver": {},
        "sector3_by_driver": {},
        "abs_timeline": [],
    }
    for code in drivers_raw.keys():
        sample_count = len(drivers_raw[code]["t"])
        timing_data["pos_by_driver"][code] = drivers_raw[code].pop("_pos", [0] * sample_count)
        timing_data["gap_by_driver"][code] = drivers_raw[code].pop("_gap", [0.0] * sample_count)
        timing_data["interval_smooth_by_driver"][code] = drivers_raw[code].pop("_interval", [0.0] * sample_count)
        timing_data["lap_time_by_driver"][code] = drivers_raw[code].pop("_lap_time", [0.0] * sample_count)
        timing_data["sector1_by_driver"][code] = drivers_raw[code].pop("_sector1", [0.0] * sample_count)
        timing_data["sector2_by_driver"][code] = drivers_raw[code].pop("_sector2", [0.0] * sample_count)
        timing_data["sector3_by_driver"][code] = drivers_raw[code].pop("_sector3", [0.0] * sample_count)
        timing_data["abs_timeline"].extend(drivers_raw[code]["t"])

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

    # Build track geometry from fastest lap
    track_geometry = None
    try:
        from shared.utils.track_geometry import build_track_from_example_lap
        fastest_lap = session.laps.pick_fastest()
        fastest_telem = fastest_lap.get_telemetry()
        track_data = build_track_from_example_lap(fastest_telem, lap_obj=fastest_lap)
        if track_data:
            track_geometry = {
                "centerline_x": [float(x) for x in track_data[0]],
                "centerline_y": [float(y) for y in track_data[1]],
                "inner_x": [float(x) for x in track_data[2]],
                "inner_y": [float(y) for y in track_data[3]],
                "outer_x": [float(x) for x in track_data[4]],
                "outer_y": [float(y) for y in track_data[5]],
                "x_min": float(track_data[6]),
                "x_max": float(track_data[7]),
                "y_min": float(track_data[8]),
                "y_max": float(track_data[9]),
            }
            if track_data[10] is not None:
                track_geometry["sector"] = [int(s) for s in track_data[10]]
    except Exception as e:
        print(f"Warning: Could not build track geometry: {e}", file=sys.stderr)
        track_geometry = None

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
        "total_laps": int(session.total_laps) if hasattr(session, 'total_laps') and session.total_laps else max([max(drivers_raw[code]["lap"]) for code in drivers_raw.keys()] + [1]),
        "track_geometry": track_geometry if track_geometry else {}
    }

    validate_driver_arrays(drivers_raw)
    return payload


def extract_quali_segments(session):
    import pandas as pd

    segments = {}
    results = session.results
    laps = session.laps

    for seg_name in ["Q1", "Q2", "Q3"]:
        seg_data = {"duration": 0.0, "drivers": {}}

        for _, row in results.iterrows():
            code = row["Abbreviation"]
            seg_time = row.get(seg_name)
            if seg_time is None:
                continue
            if pd.isna(seg_time):
                continue
            if hasattr(seg_time, "total_seconds") and seg_time.total_seconds() == 0:
                continue

            driver_laps = laps[laps["Driver"] == code]
            if driver_laps.empty:
                continue

            try:
                fastest = driver_laps.pick_fastest()
            except Exception:
                continue

            if fastest is None:
                continue

            try:
                telem = fastest.get_telemetry()
            except Exception:
                continue

            if telem is None or len(telem) == 0:
                continue

            lap_time = to_seconds(seg_time)

            times = series_to_float_list(telem["Time"], len(telem), 0.0, time_mode=True)
            t_offset = times[0] if times else 0.0

            xs = series_to_float_list(telem.get("X", [0.0] * len(telem)), len(telem), 0.0)
            ys = series_to_float_list(telem.get("Y", [0.0] * len(telem)), len(telem), 0.0)
            dists = series_to_float_list(telem.get("Distance", [0.0] * len(telem)), len(telem), 0.0)
            speeds = series_to_float_list(telem.get("Speed", [0.0] * len(telem)), len(telem), 0.0)
            gears = series_to_int_list(telem.get("nGear", [0] * len(telem)), len(telem), 0)
            throttles = series_to_float_list(telem.get("Throttle", [0.0] * len(telem)), len(telem), 0.0)
            brake_raw = telem.get("Brake", [False] * len(telem))
            brakes = [1.0 if b else 0.0 for b in (brake_raw.tolist() if hasattr(brake_raw, "tolist") else list(brake_raw))]
            drss = series_to_int_list(telem.get("DRS", [0] * len(telem)), len(telem), 0)

            frames = []
            for i in range(len(times)):
                frames.append({
                    "t": times[i] - t_offset,
                    "x": xs[i],
                    "y": ys[i],
                    "dist": dists[i],
                    "speed": speeds[i],
                    "gear": gears[i],
                    "throttle": throttles[i],
                    "brake": brakes[i],
                    "drs": drss[i],
                })

            seg_data["drivers"][code] = {
                "frames": frames,
                "lap_time": lap_time,
            }

            if lap_time > seg_data["duration"]:
                seg_data["duration"] = lap_time

        segments[seg_name] = seg_data

    return segments


def main():
    parser = argparse.ArgumentParser(description="FastF1 Telemetry Extractor for Go Backend")
    parser.add_argument("year", type=int, help="Season year (e.g., 2025)")
    parser.add_argument("round", type=int, help="Round number (e.g., 1)")
    parser.add_argument("session_type", choices=["R", "S", "Q", "SQ", "FP1", "FP2", "FP3"],
                       help="Session type: R=Race, S=Sprint, Q=Qualifying, SQ=SprintQuali, FP1/FP2/FP3=Practice")
    parser.add_argument("--refresh", action="store_true", help="Force refresh data")

    args = parser.parse_args()

    try:
        emit_progress(5, f"Loading FastF1 session {args.year} R{args.round} {args.session_type}...")

        # Load session
        session_map = {"R": "Race", "S": "Sprint", "Q": "Qualifying", "SQ": "SprintQualifying", "FP1": "Practice 1", "FP2": "Practice 2", "FP3": "Practice 3"}
        session = fastf1.get_session(args.year, args.round, session_map[args.session_type])
        session.load(telemetry=True, weather=True)

        emit_progress(20, f"Extracting {args.session_type} telemetry...")

        # Extract raw data
        payload = extract_raw_telemetry(session, args.session_type)

        if args.session_type in ("Q", "SQ"):
            emit_progress(75, "Extracting qualifying segments...")
            try:
                quali_segments = extract_quali_segments(session)
                payload["quali_segments"] = quali_segments
            except Exception as e:
                print(f"Warning: Could not extract qualifying segments: {e}", file=sys.stderr)
                payload["quali_segments"] = {"Q1": {"duration": 0, "drivers": {}}, "Q2": {"duration": 0, "drivers": {}}, "Q3": {"duration": 0, "drivers": {}}}

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
