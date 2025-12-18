from fastapi import APIRouter, HTTPException
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from shared.telemetry.f1_data import list_rounds, list_sprints

router = APIRouter(prefix="/api/seasons", tags=["seasons"])


@router.get("/{year}/rounds")
async def get_rounds(year: int):
    try:
        rounds = list_rounds(year)
        return {"year": year, "rounds": rounds}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{year}/sprints")
async def get_sprint_rounds(year: int):
    try:
        sprints = list_sprints(year)
        return {"year": year, "sprints": sprints}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
