from fastapi import APIRouter, HTTPException, BackgroundTasks
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from backend.models.session import SessionRequest
from backend.app.services.replay_service import F1ReplaySession

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

active_sessions = {}


@router.post("")
async def create_session(background_tasks: BackgroundTasks, request: SessionRequest):
    year = request.year
    round_num = request.round_num
    session_type = request.session_type
    refresh = request.refresh
    session_id = f"{year}_{round_num}_{session_type}"

    if session_id in active_sessions and not refresh:
        session = active_sessions[session_id]
        if session.is_loaded:
            if session.load_error:
                raise HTTPException(status_code=400, detail=session.load_error)
            return {"session_id": session_id, "metadata": session.get_metadata()}

    session = F1ReplaySession(year, round_num, session_type, refresh=refresh)
    active_sessions[session_id] = session

    background_tasks.add_task(session.load_data)

    return {
        "session_id": session_id,
        "loading": True,
        "metadata": session.get_metadata(),
    }


@router.get("/{session_id}")
async def get_session_status(session_id: str):
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = active_sessions[session_id]
    return {
        "session_id": session_id,
        "loading": not session.is_loaded,
        "metadata": session.get_metadata(),
    }


def get_active_sessions():
    return active_sessions
