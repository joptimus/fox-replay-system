"""Debug endpoints for testing FastF1 API directly."""

from fastapi import APIRouter, HTTPException
import sys
from pathlib import Path
from typing import Optional, Dict, Any
import json
import traceback
import time
import logging

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from shared.telemetry.f1_data import load_session
import fastf1
import pandas as pd

logger = logging.getLogger("debug.fastf1")

router = APIRouter(prefix="/api/debug", tags=["debug"])


class FastF1Tester:
    """Helper class to test FastF1 functionality."""

    @staticmethod
    def safe_json(obj):
        """Convert objects to JSON-serializable format."""
        if isinstance(obj, pd.Timestamp):
            return obj.isoformat()
        elif isinstance(obj, pd.Timedelta):
            return str(obj.total_seconds())
        elif isinstance(obj, (pd.DataFrame, pd.Series)):
            return obj.to_dict()
        elif isinstance(obj, (int, float, str, bool, type(None))):
            return obj
        elif isinstance(obj, dict):
            return {k: FastF1Tester.safe_json(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple)):
            return [FastF1Tester.safe_json(item) for item in obj]
        else:
            return str(obj)

    @staticmethod
    def test_load_session(year: int, round_num: int, session_type: str) -> Dict[str, Any]:
        """Test loading a session."""
        logs = []
        try:
            # Map session type codes to names
            session_type_map = {
                'R': 'Race',
                'Q': 'Qualifying',
                'S': 'Sprint',
                'SQ': 'Sprint Qualifying',
                'FP1': 'Free Practice 1',
                'FP2': 'Free Practice 2',
                'FP3': 'Free Practice 3'
            }

            logs.append(f"[START] Loading {session_type_map.get(session_type, session_type)} session")
            logs.append(f"[PARAMS] year={year}, round={round_num}, session_type={session_type}")

            start_time = time.time()
            logs.append(f"[API CALL] Calling: load_session({year}, {round_num}, '{session_type}')")
            logs.append(f"[FASTF1] Requesting session from FastF1 API...")
            logs.append(f"[FASTF1] This will call: fastf1.get_session({year}, {round_num}, '{session_type}')")

            session = load_session(year, round_num, session_type)

            load_time = time.time() - start_time
            logs.append(f"[SUCCESS] ✓ Session loaded in {load_time:.2f}s")
            logs.append(f"[SESSION NAME] {session}")
            logs.append(f"[SESSION TYPE] {session_type_map.get(session_type, session_type)}")
            logs.append(f"[LAPS] Total laps: {len(session.laps) if hasattr(session, 'laps') else 'N/A'}")
            logs.append(f"[DRIVERS] Total drivers: {len(session.drivers) if hasattr(session, 'drivers') else 'N/A'}")
            logs.append(f"[CACHE] Using .fastf1-cache/ for API responses")

            return {
                "success": True,
                "message": f"Successfully loaded {session_type_map.get(session_type, session_type)} session",
                "session_info": {
                    "name": str(session),
                    "session_type": session_type_map.get(session_type, session_type),
                    "date": str(session.date) if hasattr(session, 'date') else None,
                    "event_name": str(session.event["EventName"]) if hasattr(session, 'event') else None,
                    "has_laps": len(session.laps) > 0 if hasattr(session, 'laps') else False,
                },
                "logs": logs,
                "load_time_seconds": load_time
            }
        except Exception as e:
            logs.append(f"[ERROR] {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "traceback": traceback.format_exc(),
                "logs": logs
            }

    @staticmethod
    def test_laps(year: int, round_num: int, session_type: str) -> Dict[str, Any]:
        """Test accessing laps data."""
        logs = []
        try:
            logs.append(f"[API CALL] Calling: load_session({year}, {round_num}, '{session_type}')")
            logs.append(f"[FASTF1] Fetching session.laps from FastF1 session object...")

            start_time = time.time()
            session = load_session(year, round_num, session_type)
            laps_count = len(session.laps)
            load_time = time.time() - start_time

            logs.append(f"[SUCCESS] ✓ Laps data retrieved in {load_time:.2f}s")
            logs.append(f"[LAPS] Found {laps_count} laps")
            logs.append(f"[COLUMNS] Available columns: {', '.join(list(session.laps.columns)[:5])}... ({len(session.laps.columns)} total)")

            return {
                "success": True,
                "laps_count": laps_count,
                "columns": list(session.laps.columns) if laps_count > 0 else [],
                "sample_laps": FastF1Tester.safe_json(
                    session.laps.head(3) if laps_count > 0 else pd.DataFrame()
                ),
                "drivers_count": len(session.drivers) if hasattr(session, 'drivers') else 0,
                "logs": logs,
            }
        except Exception as e:
            logs.append(f"[ERROR] Failed to fetch laps: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "traceback": traceback.format_exc(),
                "logs": logs
            }

    @staticmethod
    def test_drivers(year: int, round_num: int, session_type: str) -> Dict[str, Any]:
        """Test accessing driver information."""
        logs = []
        try:
            logs.append(f"[API CALL] Calling: load_session({year}, {round_num}, '{session_type}')")
            logs.append(f"[FASTF1] Accessing session.drivers and session.get_driver()...")

            start_time = time.time()
            session = load_session(year, round_num, session_type)
            driver_count = len(session.drivers) if hasattr(session, 'drivers') else 0
            load_time = time.time() - start_time

            logs.append(f"[SUCCESS] ✓ Driver data retrieved in {load_time:.2f}s")
            logs.append(f"[DRIVERS] Total drivers in session: {driver_count}")
            logs.append(f"[DRIVER NUMBERS] {list(session.drivers)[:10]}{'...' if driver_count > 10 else ''}")

            drivers_info = {}
            if hasattr(session, 'drivers') and session.drivers:
                for driver_no in list(session.drivers)[:5]:  # First 5 drivers
                    try:
                        logs.append(f"[FASTF1] Calling session.get_driver({driver_no})...")
                        driver_info = session.get_driver(driver_no)
                        drivers_info[str(driver_no)] = FastF1Tester.safe_json(driver_info)
                    except Exception as e:
                        drivers_info[str(driver_no)] = {"error": str(e)}
                        logs.append(f"[ERROR] Failed to get driver {driver_no}: {str(e)}")

            return {
                "success": True,
                "total_drivers": driver_count,
                "drivers_list": list(session.drivers) if hasattr(session, 'drivers') else [],
                "sample_drivers": drivers_info,
                "logs": logs,
            }
        except Exception as e:
            logs.append(f"[ERROR] Failed to fetch driver data: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "traceback": traceback.format_exc(),
                "logs": logs
            }

    @staticmethod
    def test_telemetry(year: int, round_num: int, session_type: str, driver_code: Optional[str] = None) -> Dict[str, Any]:
        """Test accessing telemetry for a driver."""
        logs = []
        try:
            logs.append(f"[API CALL] Calling: load_session({year}, {round_num}, '{session_type}')")
            logs.append(f"[FASTF1] Accessing driver telemetry...")

            start_time = time.time()
            session = load_session(year, round_num, session_type)

            if not driver_code and hasattr(session, 'drivers') and session.drivers:
                driver_code = session.get_driver(list(session.drivers)[0])["Abbreviation"]
                logs.append(f"[AUTO-SELECT] Driver code not provided, using first driver: {driver_code}")

            if not driver_code:
                logs.append(f"[ERROR] No driver code available")
                return {
                    "success": False,
                    "error": "No driver code provided and couldn't find drivers in session",
                    "logs": logs
                }

            logs.append(f"[FASTF1] Calling session.laps.pick_drivers('{driver_code}')...")
            driver_laps = session.laps.pick_drivers(driver_code)

            if driver_laps.empty:
                logs.append(f"[ERROR] No laps found for driver {driver_code}")
                return {
                    "success": False,
                    "error": f"No laps found for driver {driver_code}",
                    "drivers_available": list(session.drivers) if hasattr(session, 'drivers') else [],
                    "logs": logs
                }

            logs.append(f"[FASTF1] Found {len(driver_laps)} laps for {driver_code}")

            # Get first lap telemetry
            first_lap = driver_laps.iloc[0]
            logs.append(f"[FASTF1] Calling first_lap.get_telemetry() for lap {int(first_lap.LapNumber) if pd.notna(first_lap.LapNumber) else 'N/A'}...")
            telemetry = first_lap.get_telemetry()
            load_time = time.time() - start_time

            logs.append(f"[SUCCESS] ✓ Telemetry retrieved in {load_time:.2f}s")
            logs.append(f"[TELEMETRY] {len(telemetry)} telemetry points extracted")
            logs.append(f"[COLUMNS] Available: {', '.join(list(telemetry.columns)[:5])}... ({len(telemetry.columns)} total)")

            return {
                "success": True,
                "driver": driver_code,
                "lap_number": int(first_lap.LapNumber) if pd.notna(first_lap.LapNumber) else None,
                "telemetry_points": len(telemetry),
                "telemetry_columns": list(telemetry.columns) if len(telemetry) > 0 else [],
                "sample_telemetry": FastF1Tester.safe_json(telemetry.head(5)),
                "lap_time": str(first_lap.LapTime) if pd.notna(first_lap.LapTime) else None,
                "logs": logs,
            }
        except Exception as e:
            logs.append(f"[ERROR] Failed to fetch telemetry: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "traceback": traceback.format_exc(),
                "logs": logs
            }

    @staticmethod
    def test_weather(year: int, round_num: int, session_type: str) -> Dict[str, Any]:
        """Test accessing weather data."""
        logs = []
        try:
            logs.append(f"[API CALL] Calling: load_session({year}, {round_num}, '{session_type}')")
            logs.append(f"[FASTF1] Accessing session.weather attribute...")

            start_time = time.time()
            session = load_session(year, round_num, session_type)

            # Check if weather attribute exists
            if not hasattr(session, 'weather') or session.weather is None:
                logs.append(f"[ERROR] session.weather is not available")
                return {
                    "success": False,
                    "error": "No weather data available for this session",
                    "logs": logs
                }

            weather = session.weather
            load_time = time.time() - start_time

            logs.append(f"[SUCCESS] ✓ Weather data retrieved in {load_time:.2f}s")
            logs.append(f"[WEATHER] Data points: {len(weather)}")
            logs.append(f"[COLUMNS] {', '.join(list(weather.columns))}")

            return {
                "success": True,
                "weather_data": FastF1Tester.safe_json(weather),
                "columns": list(weather.columns) if hasattr(weather, 'columns') else [],
                "logs": logs,
            }
        except Exception as e:
            logs.append(f"[ERROR] Failed to fetch weather data: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "traceback": traceback.format_exc(),
                "logs": logs
            }


@router.get("/fastf1-test")
async def test_fastf1(
    year: int,
    round_num: int,
    session_type: str = "R",
    method: str = "load_session",
    driver_code: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Test FastF1 functionality.

    Args:
        year: Season year (e.g., 2026)
        round_num: Round number (1-24)
        session_type: Session type (R=Race, Q=Qualifying, S=Sprint, SQ=Sprint Quali, FP1/FP2/FP3=Practice)
        method: Which test to run:
            - load_session: Load the session
            - laps: Get laps information
            - drivers: Get driver information
            - telemetry: Get driver telemetry (requires driver_code)
            - weather: Get weather data
        driver_code: Driver code for telemetry method (e.g., "VER", "HAM")

    Returns:
        Test results with success status and data
    """
    methods = {
        "load_session": lambda: FastF1Tester.test_load_session(year, round_num, session_type),
        "laps": lambda: FastF1Tester.test_laps(year, round_num, session_type),
        "drivers": lambda: FastF1Tester.test_drivers(year, round_num, session_type),
        "telemetry": lambda: FastF1Tester.test_telemetry(year, round_num, session_type, driver_code),
        "weather": lambda: FastF1Tester.test_weather(year, round_num, session_type),
    }

    if method not in methods:
        return {
            "year": year,
            "round": round_num,
            "session_type": session_type,
            "method": method,
            "result": {
                "success": False,
                "error": f"Unknown method: {method}. Available: {list(methods.keys())}"
            }
        }

    try:
        result = methods[method]()
        return {
            "year": year,
            "round": round_num,
            "session_type": session_type,
            "method": method,
            "result": result,
        }
    except Exception as e:
        return {
            "year": year,
            "round": round_num,
            "session_type": session_type,
            "method": method,
            "result": {
                "success": False,
                "error": str(e),
                "traceback": traceback.format_exc()
            }
        }


@router.get("/fastf1-methods")
async def get_fastf1_methods() -> Dict[str, str]:
    """Get available FastF1 test methods."""
    return {
        "load_session": "Load a session and verify it exists",
        "laps": "Get laps information (count, columns, sample)",
        "drivers": "Get driver information (count, list, details)",
        "telemetry": "Get driver telemetry data (requires driver_code parameter)",
        "weather": "Get weather information",
    }
