#!/usr/bin/env python3
"""
Test WebSocket frame streaming
"""
import requests
import json
import time
import websocket
import sys

BACKEND_URL = "http://localhost:8000"

print("=" * 70)
print("WEBSOCKET FRAME STREAMING TEST")
print("=" * 70)

# Create session
print("\n[1] Creating session...")
response = requests.post(
    f"{BACKEND_URL}/api/sessions",
    json={
        "year": 2025,
        "round": 1,
        "session_type": "R",
        "refresh": False
    }
)

if response.status_code != 200:
    print(f"ERROR: {response.status_code}")
    sys.exit(1)

data = response.json()
session_id = data.get("session_id")
print(f"Session ID: {session_id}")

# Open WebSocket
print("\n[2] Opening WebSocket...")
ws = websocket.create_connection(f"ws://localhost:8000/ws/replay/{session_id}")
print("Connected!")

# Read messages
print("\n[3] Reading WebSocket messages...")
print("-" * 70)

message_types = {}
frame_count = 0
loading_complete_received = False

for i in range(100):  # Read up to 100 messages
    try:
        msg = ws.recv()

        if isinstance(msg, bytes):
            # Binary frame data
            frame_count += 1
            print(f"  [{i}] Binary frame data (msgpack) - {len(msg)} bytes")
            if frame_count <= 3:
                # Try to unpack first few frames
                try:
                    from msgpackr import Unpackr
                    decoder = Unpackr(mapsAsObjects=True)
                    decoded = decoder.unpack(msg)
                    print(f"       Frame content: t={decoded.get('t'):.2f}, drivers={len(decoded.get('drivers', {}))}")
                except:
                    pass
        else:
            # JSON text message
            data = json.loads(msg)
            msg_type = data.get("type", "unknown")
            message_types[msg_type] = message_types.get(msg_type, 0) + 1

            if msg_type == "loading_complete":
                loading_complete_received = True
                print(f"  [{i}] loading_complete: frames={data.get('frames')}, metadata keys={list(data.get('metadata', {}).keys())}")
            elif msg_type == "generation_progress":
                print(f"  [{i}] generation_progress: {data.get('message')} ({data.get('progress')}%)")
            else:
                print(f"  [{i}] {msg_type}: {json.dumps(data)[:100]}")

    except websocket.WebSocketTimeoutException:
        print(f"  [{i}] Timeout waiting for message")
        break
    except Exception as e:
        print(f"  [{i}] Error: {e}")
        break

ws.close()

print("-" * 70)
print(f"\nSummary:")
print(f"  Message types received: {message_types}")
print(f"  Binary frames received: {frame_count}")
print(f"  Loading complete: {loading_complete_received}")
print("\nExpected: loading_complete message + binary frame messages")
if not loading_complete_received:
    print("ERROR: loading_complete not received!")
if frame_count == 0:
    print("ERROR: No binary frames received!")
