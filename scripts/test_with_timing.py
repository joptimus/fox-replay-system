#!/usr/bin/env python3
"""
Test Go backend and capture timing output
"""
import requests
import json
import time
import subprocess
import sys

BACKEND_URL = "http://localhost:8000"

print("=" * 70)
print("TESTING GO BACKEND WITH INSTRUMENTATION")
print("=" * 70)

# Start capturing logs
log_file = open("/tmp/backend_timing.log", "w")

print("\n[1] POST /api/sessions (create session)...")
start = time.time()

response = requests.post(
    f"{BACKEND_URL}/api/sessions",
    json={
        "year": 2025,
        "round": 1,
        "session_type": "R",
        "refresh": True  # Force refresh to see full timing
    }
)

print(f"    Response: {time.time() - start:.2f}s")
print(f"    Status: {response.status_code}")

if response.status_code == 200:
    data = response.json()
    session_id = data.get("session_id")
    print(f"    Session ID: {session_id}")

    # Open WebSocket
    print("\n[2] Opening WebSocket...")
    import websocket

    ws_start = time.time()
    ws = websocket.create_connection(f"ws://localhost:8000/ws/replay/{session_id}")
    print(f"    Connected: {time.time() - ws_start:.2f}s")

    # Read messages
    print("\n[3] Waiting for loading_complete...")
    message_count = 0
    while True:
        try:
            msg = ws.recv()
            message_count += 1

            if isinstance(msg, bytes):
                continue

            data = json.loads(msg)
            if data.get("type") == "loading_complete":
                print(f"    ✓ Complete in {time.time() - ws_start:.2f}s")
                break

        except Exception as e:
            print(f"    Error: {e}")
            break

    ws.close()

    print("\n[4] Checking backend logs for TIMING output...")
    print("    (This shows where the time is spent in Go frame generation)\n")

# Wait a bit for logs to flush
time.sleep(2)

# Print any timing output from the backend
import os
if os.path.exists("/tmp/backend_instrumented.log"):
    with open("/tmp/backend_instrumented.log", "r") as f:
        lines = f.readlines()
        # Find and print all TIMING lines
        timing_lines = [line for line in lines if "TIMING" in line]
        if timing_lines:
            print("BACKEND TIMING OUTPUT:")
            print("-" * 70)
            for line in timing_lines[-50:]:  # Last 50 timing lines
                print(line.rstrip())
            print("-" * 70)
        else:
            print("(No TIMING output found in backend logs)")
            print("\nLast 30 lines of backend log:")
            for line in lines[-30:]:
                print(line.rstrip())

print("\n" + "=" * 70)
