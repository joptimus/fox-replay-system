import asyncio
from fastapi import WebSocket
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))


async def handle_replay_websocket(websocket: WebSocket, session_id: str, active_sessions: dict):
    await websocket.accept(subprotocol=None)

    if session_id not in active_sessions:
        await websocket.send_json({"error": "Session not found"})
        await websocket.close()
        return

    session = active_sessions[session_id]

    while not session.is_loaded:
        await asyncio.sleep(0.1)

    if session.load_error:
        await websocket.send_json({"error": session.load_error})
        await websocket.close()
        return

    frame_index = 0.0
    playback_speed = 1.0
    is_playing = False
    last_frame_sent = -1

    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=0.01)

                if data.get("action") == "play":
                    is_playing = True
                    playback_speed = data.get("speed", 1.0)
                elif data.get("action") == "pause":
                    is_playing = False
                elif data.get("action") == "seek":
                    frame_index = float(data.get("frame", 0))
                    last_frame_sent = -1
            except asyncio.TimeoutError:
                pass

            if is_playing:
                frame_index += playback_speed * (1.0 / 60.0) * 25

            current_frame = int(frame_index)
            if current_frame != last_frame_sent and 0 <= current_frame < len(session.frames):
                frame_data = session.serialize_frame(current_frame)
                await websocket.send_text(frame_data)
                last_frame_sent = current_frame

            if frame_index >= len(session.frames):
                is_playing = False
                frame_index = len(session.frames) - 1

            await asyncio.sleep(1 / 60)

    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        await websocket.close()
