#!/usr/bin/env python3
"""
Generate telemetry cache for F1 Race Replay
Called by Go backend when cache is missing
"""
import sys
import json
import os

# Add parent directory to path to import shared modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from shared.telemetry.f1_data import get_race_telemetry, get_quali_telemetry, load_session, enable_cache

def generate_cache(year: int, round_num: int, session_type: str):
    """Generate telemetry cache for a session"""
    try:
        print(f"Generating {year} R{round_num} {session_type} telemetry...", file=sys.stderr)

        # Enable FastF1 caching
        enable_cache()

        # Send progress update
        print(json.dumps({"type": "progress", "message": "Loading session data..."}))
        sys.stdout.flush()

        # Load the FastF1 session
        session = load_session(year, round_num, session_type)

        # Send progress update
        print(json.dumps({"type": "progress", "message": "Extracting telemetry..."}))
        sys.stdout.flush()

        if session_type == 'Q' or session_type == 'SQ':
            telemetry = get_quali_telemetry(session, session_type)
        else:
            telemetry = get_race_telemetry(session, session_type)

        # Send progress update
        print(json.dumps({"type": "progress", "message": "Generating frames..."}))
        sys.stdout.flush()

        # Return as JSON for Go to process
        frame_count = len(telemetry.get('results', [])) if isinstance(telemetry, dict) else len(telemetry)
        result = {
            "status": "success",
            "frames": frame_count,
            "data": telemetry
        }

        # Send final result
        print(json.dumps(result))
        sys.stdout.flush()
        return 0

    except Exception as e:
        error_result = {
            "status": "error",
            "message": str(e)
        }
        print(json.dumps(error_result))
        sys.stdout.flush()
        return 1

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print('{"status": "error", "message": "Usage: generate_telemetry.py <year> <round> <session_type>"}')
        sys.exit(1)

    year = int(sys.argv[1])
    round_num = int(sys.argv[2])
    session_type = sys.argv[3]

    sys.exit(generate_cache(year, round_num, session_type))
