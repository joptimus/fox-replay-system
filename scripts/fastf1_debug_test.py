#!/usr/bin/env python3
"""Standalone FastF1 debug tester - called by Go backend.

Usage: python3 fastf1_debug_test.py <year> <round> <session_type> <method> [--no-cache] [driver_code]
Outputs JSON to stdout.
"""

import sys
import os
import json
import traceback
import time
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import fastf1
import pandas as pd

# Parse --no-cache before importing anything that triggers cache
no_cache = "--no-cache" in sys.argv
if no_cache:
    sys.argv.remove("--no-cache")

cache_dir = os.path.join(os.path.dirname(__file__), '..', '.fastf1-cache')
os.makedirs(cache_dir, exist_ok=True)
fastf1.Cache.enable_cache(cache_dir, force_renew=no_cache)

from shared.telemetry.f1_data import load_session


def safe_json(obj):
    if isinstance(obj, pd.Timestamp):
        return obj.isoformat()
    elif isinstance(obj, pd.Timedelta):
        return str(obj.total_seconds())
    elif isinstance(obj, (pd.DataFrame, pd.Series)):
        return obj.to_dict()
    elif isinstance(obj, (int, float, str, bool, type(None))):
        return obj
    elif isinstance(obj, dict):
        return {k: safe_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [safe_json(item) for item in obj]
    else:
        return str(obj)


SESSION_TYPE_MAP = {
    'R': 'Race', 'Q': 'Qualifying', 'S': 'Sprint',
    'SQ': 'Sprint Qualifying',
    'FP1': 'Free Practice 1', 'FP2': 'Free Practice 2', 'FP3': 'Free Practice 3',
}


def test_load_session(year, round_num, session_type):
    logs = []
    try:
        logs.append(f"[START] Loading {SESSION_TYPE_MAP.get(session_type, session_type)} session")
        logs.append(f"[PARAMS] year={year}, round={round_num}, session_type={session_type}")
        start_time = time.time()
        logs.append(f"[API CALL] Calling: load_session({year}, {round_num}, '{session_type}')")
        session = load_session(year, round_num, session_type)
        load_time = time.time() - start_time
        logs.append(f"[SUCCESS] Session loaded in {load_time:.2f}s")
        return {
            "success": True,
            "message": f"Successfully loaded {SESSION_TYPE_MAP.get(session_type, session_type)} session",
            "session_info": {
                "name": str(session),
                "session_type": SESSION_TYPE_MAP.get(session_type, session_type),
                "date": str(session.date) if hasattr(session, 'date') else None,
                "event_name": str(session.event["EventName"]) if hasattr(session, 'event') else None,
                "has_laps": len(session.laps) > 0 if hasattr(session, 'laps') else False,
            },
            "logs": logs,
            "load_time_seconds": load_time,
        }
    except Exception as e:
        logs.append(f"[ERROR] {str(e)}")
        return {"success": False, "error": str(e), "traceback": traceback.format_exc(), "logs": logs}


def test_laps(year, round_num, session_type):
    logs = []
    try:
        logs.append(f"[API CALL] Calling: load_session({year}, {round_num}, '{session_type}')")
        start_time = time.time()
        session = load_session(year, round_num, session_type)
        laps_count = len(session.laps)
        load_time = time.time() - start_time
        logs.append(f"[SUCCESS] Laps data retrieved in {load_time:.2f}s")
        logs.append(f"[LAPS] Found {laps_count} laps")
        return {
            "success": True,
            "laps_count": laps_count,
            "columns": list(session.laps.columns) if laps_count > 0 else [],
            "sample_laps": safe_json(session.laps.head(3) if laps_count > 0 else pd.DataFrame()),
            "drivers_count": len(session.drivers) if hasattr(session, 'drivers') else 0,
            "logs": logs,
        }
    except Exception as e:
        logs.append(f"[ERROR] {str(e)}")
        return {"success": False, "error": str(e), "traceback": traceback.format_exc(), "logs": logs}


def test_drivers(year, round_num, session_type):
    logs = []
    try:
        logs.append(f"[API CALL] Calling: load_session({year}, {round_num}, '{session_type}')")
        start_time = time.time()
        session = load_session(year, round_num, session_type)
        driver_count = len(session.drivers) if hasattr(session, 'drivers') else 0
        load_time = time.time() - start_time
        logs.append(f"[SUCCESS] Driver data retrieved in {load_time:.2f}s")
        drivers_info = {}
        if hasattr(session, 'drivers') and session.drivers:
            for driver_no in list(session.drivers)[:5]:
                try:
                    driver_info = session.get_driver(driver_no)
                    drivers_info[str(driver_no)] = safe_json(driver_info)
                except Exception as e:
                    drivers_info[str(driver_no)] = {"error": str(e)}
        return {
            "success": True,
            "total_drivers": driver_count,
            "drivers_list": list(session.drivers) if hasattr(session, 'drivers') else [],
            "sample_drivers": drivers_info,
            "logs": logs,
        }
    except Exception as e:
        logs.append(f"[ERROR] {str(e)}")
        return {"success": False, "error": str(e), "traceback": traceback.format_exc(), "logs": logs}


def test_telemetry(year, round_num, session_type, driver_code=None):
    logs = []
    try:
        logs.append(f"[API CALL] Calling: load_session({year}, {round_num}, '{session_type}')")
        start_time = time.time()
        session = load_session(year, round_num, session_type)
        if not driver_code and hasattr(session, 'drivers') and session.drivers:
            driver_code = session.get_driver(list(session.drivers)[0])["Abbreviation"]
            logs.append(f"[AUTO-SELECT] Using first driver: {driver_code}")
        if not driver_code:
            return {"success": False, "error": "No driver code available", "logs": logs}
        driver_laps = session.laps.pick_drivers(driver_code)
        if driver_laps.empty:
            return {"success": False, "error": f"No laps found for {driver_code}", "logs": logs}
        logs.append(f"[FASTF1] Found {len(driver_laps)} laps for {driver_code}")
        first_lap = driver_laps.iloc[0]
        telemetry = first_lap.get_telemetry()
        load_time = time.time() - start_time
        logs.append(f"[SUCCESS] Telemetry retrieved in {load_time:.2f}s")
        return {
            "success": True,
            "driver": driver_code,
            "lap_number": int(first_lap.LapNumber) if pd.notna(first_lap.LapNumber) else None,
            "telemetry_points": len(telemetry),
            "telemetry_columns": list(telemetry.columns) if len(telemetry) > 0 else [],
            "sample_telemetry": safe_json(telemetry.head(5)),
            "logs": logs,
        }
    except Exception as e:
        logs.append(f"[ERROR] {str(e)}")
        return {"success": False, "error": str(e), "traceback": traceback.format_exc(), "logs": logs}


def test_weather(year, round_num, session_type):
    logs = []
    try:
        logs.append(f"[API CALL] Calling: load_session({year}, {round_num}, '{session_type}')")
        start_time = time.time()
        session = load_session(year, round_num, session_type)
        if not hasattr(session, 'weather') or session.weather is None:
            return {"success": False, "error": "No weather data available", "logs": logs}
        weather = session.weather
        load_time = time.time() - start_time
        logs.append(f"[SUCCESS] Weather data retrieved in {load_time:.2f}s")
        return {
            "success": True,
            "weather_data": safe_json(weather),
            "columns": list(weather.columns) if hasattr(weather, 'columns') else [],
            "logs": logs,
        }
    except Exception as e:
        logs.append(f"[ERROR] {str(e)}")
        return {"success": False, "error": str(e), "traceback": traceback.format_exc(), "logs": logs}


METHODS = {
    "load_session": test_load_session,
    "laps": test_laps,
    "drivers": test_drivers,
    "telemetry": test_telemetry,
    "weather": test_weather,
}


def main():
    if len(sys.argv) < 5:
        print(json.dumps({"error": "Usage: fastf1_debug_test.py <year> <round> <session_type> <method> [driver_code]"}))
        sys.exit(1)

    year = int(sys.argv[1])
    round_num = int(sys.argv[2])
    session_type = sys.argv[3]
    method = sys.argv[4]
    driver_code = sys.argv[5] if len(sys.argv) > 5 else None

    if method not in METHODS:
        print(json.dumps({
            "year": year, "round": round_num, "session_type": session_type, "method": method,
            "result": {"success": False, "error": f"Unknown method: {method}. Available: {list(METHODS.keys())}"},
        }))
        sys.exit(0)

    try:
        if method == "telemetry":
            result = METHODS[method](year, round_num, session_type, driver_code)
        else:
            result = METHODS[method](year, round_num, session_type)
        output = {"year": year, "round": round_num, "session_type": session_type, "method": method, "result": result}
    except Exception as e:
        output = {
            "year": year, "round": round_num, "session_type": session_type, "method": method,
            "result": {"success": False, "error": str(e), "traceback": traceback.format_exc()},
        }

    print(json.dumps(output, default=str))


if __name__ == "__main__":
    main()
