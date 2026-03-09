#!/usr/bin/env python3
"""
Test the actual Go backend performance (not Python pipeline)
"""
import requests
import json
import time
import sys

BACKEND_URL = "http://localhost:8000"

def test_race_load(year, round_num, session_type, refresh=False):
    """Load a race session via Go backend and measure time"""

    print(f"\n{'='*60}")
    print(f"Testing: {year} R{round_num} {session_type}")
    print(f"{'='*60}")

    # Step 1: Create session
    print(f"\n[1] POST /api/sessions (create session)...")
    start = time.time()

    response = requests.post(
        f"{BACKEND_URL}/api/sessions",
        json={
            "year": year,
            "round": round_num,
            "session_type": session_type,
            "refresh": refresh
        }
    )

    session_create_time = time.time() - start
    print(f"    Response: {session_create_time:.2f}s")

    if response.status_code != 200:
        print(f"    ERROR: {response.status_code} - {response.text}")
        return None

    data = response.json()
    session_id = data.get("session_id")
    status = data.get("status")
    print(f"    Session ID: {session_id}")
    print(f"    Status: {status}")

    if status == "READY":
        print(f"    ✓ Cache hit - session already ready")
        return {
            "session_id": session_id,
            "total_time": session_create_time,
            "cache_hit": True,
            "status": "SUCCESS"
        }

    # Step 2: Open WebSocket and wait for ready
    print(f"\n[2] WS /ws/replay/{session_id} (stream frames)...")

    import websocket

    ws_start = time.time()
    ws = websocket.create_connection(f"ws://localhost:8000/ws/replay/{session_id}")

    print(f"    WebSocket connected: {time.time() - ws_start:.2f}s")

    # Read messages until loading_complete
    loading_complete = False
    session_ready_time = None
    message_count = 0

    while not loading_complete and time.time() - ws_start < 300:  # 5 min timeout
        try:
            msg = ws.recv()
            message_count += 1

            if isinstance(msg, bytes):
                # Binary frame data
                continue

            data = json.loads(msg)
            msg_type = data.get("type", "unknown")

            if msg_type == "generation_progress":
                pct = data.get("pct", 0)
                msg_text = data.get("msg", "")
                print(f"    Progress: {pct}% - {msg_text}")

            elif msg_type == "loading_complete":
                loading_complete = True
                session_ready_time = time.time() - ws_start
                frames = data.get("frames", 0)
                print(f"    ✓ Loading complete: {frames} frames")

        except websocket.WebSocketTimeoutException:
            break

    ws.close()

    total_time = time.time() - start

    if not loading_complete:
        print(f"    ✗ Timeout waiting for loading_complete")
        return {
            "session_id": session_id,
            "total_time": total_time,
            "cache_hit": False,
            "status": "TIMEOUT"
        }

    print(f"\n[RESULTS]")
    print(f"  Total time: {total_time:.2f}s")
    print(f"  Session create: {session_create_time:.2f}s")
    print(f"  WebSocket ready: {session_ready_time:.2f}s")
    print(f"  Messages received: {message_count}")

    return {
        "session_id": session_id,
        "total_time": total_time,
        "session_create_time": session_create_time,
        "websocket_time": session_ready_time,
        "cache_hit": False,
        "status": "SUCCESS"
    }

if __name__ == "__main__":
    print("\n" + "="*60)
    print("GO BACKEND PERFORMANCE TEST")
    print("="*60)

    tests = [
        (2025, 1, "R", False),   # Cold cache
        (2025, 1, "R", False),   # Warm cache (second request)
    ]

    try:
        for year, round_num, session_type, refresh in tests:
            test_race_load(year, round_num, session_type, refresh)

    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
