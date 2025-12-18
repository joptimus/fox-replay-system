"""
FastAPI backend for F1 Race Replay
Handles data loading, caching, and real-time frame streaming via WebSocket
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.app.main import app

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
