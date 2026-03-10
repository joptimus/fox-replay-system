#!/usr/bin/env python3
"""
Get sector times for specific drivers and laps.
Called by Go backend as a subprocess.

Usage:
    python3 get_sector_times.py <year> <round> <session_type> <driver_codes> <lap_numbers>

    driver_codes and lap_numbers are comma-separated.

Output:
    JSON on stdout with sector times data.
"""

import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from shared.telemetry.f1_data import load_session, get_sector_times


def main():
    if len(sys.argv) < 6:
        print(json.dumps({"error": "Usage: get_sector_times.py <year> <round> <session_type> <driver_codes> <lap_numbers>"}))
        sys.exit(1)

    year = int(sys.argv[1])
    round_num = int(sys.argv[2])
    session_type = sys.argv[3]
    driver_codes = sys.argv[4].split(",")
    lap_numbers = [int(x) for x in sys.argv[5].split(",")]

    try:
        session = load_session(year, round_num, session_type)
        sectors = get_sector_times(session, driver_codes, lap_numbers)
        print(json.dumps({"sectors": sectors}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
