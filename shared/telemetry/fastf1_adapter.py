"""
Adapter layer for FastF1 API calls.

Isolates FastF1 API usage to enable future upgrades without code changes.
All timedelta conversion happens here (once, not per-frame).

Exports:
- get_stream_timing(session) -> DataFrame
- get_track_status(session) -> DataFrame
- get_lap_timing(session) -> DataFrame
- get_position_data(session) -> dict
"""

from typing import Dict

import fastf1
import pandas as pd
from fastf1.core import Session


def get_stream_timing(session: Session) -> pd.DataFrame:
    """
    Adapter: Get stream-level timing data (FIA tower updates ~240ms).

    Returns:
        DataFrame with columns: Time, Driver, Position, GapToLeader_s, Interval_s
        - GapToLeader_s and Interval_s are already converted to seconds (timedelta → float)

    FastF1 3.7.0: Uses session.laps which includes Position, Gap (GapToLeader),
    and other timing columns already loaded during session.load()
    """
    if session.laps is None or session.laps.empty:
        raise ValueError("Session does not have laps data available - call session.load() first")

    try:
        # In FastF1 3.7.0, session.laps is already loaded with timing data
        # including Position, Gap (GapToLeader), and other columns
        stream_data = session.laps.copy()

        # Convert timedelta columns to seconds if they exist
        if "Gap" in stream_data.columns:
            stream_data["GapToLeader_s"] = stream_data["Gap"].dt.total_seconds()
        else:
            stream_data["GapToLeader_s"] = None

        if "IntervalToPositionAhead" in stream_data.columns:
            stream_data["Interval_s"] = stream_data["IntervalToPositionAhead"].dt.total_seconds()
        else:
            # Fallback: use Gap if Interval not available
            stream_data["Interval_s"] = stream_data.get("GapToLeader_s", None)

    except Exception as e:
        raise RuntimeError(f"Failed to extract stream timing from session.laps: {e}") from e

    return stream_data


def get_track_status(session: Session) -> pd.DataFrame:
    """
    Adapter: Get track status (SC/VSC/Red Flag detection).

    Returns:
        DataFrame with columns: Time, Status (str), Message (str)
        Status codes: '1'=Green, '2'=Yellow, '4'=SC, '6'=VSC, '7'=Red

    FastF1 3.7.0: Uses session.track_status property
    """
    if session.track_status is None or session.track_status.empty:
        raise ValueError("Session does not have track status data available - call session.load() first")

    try:
        return session.track_status.copy()
    except Exception as e:
        raise RuntimeError(f"Failed to get track status from session: {e}") from e


def get_lap_timing(session: Session) -> pd.DataFrame:
    """
    Adapter: Get lap-level timing data with lap positions.

    Returns:
        DataFrame with lap information including Position at lap completion

    FastF1 3.7.0: Uses session.laps which includes Position for each completed lap
    """
    if session.laps is None or session.laps.empty:
        raise ValueError("Session does not have laps data available - call session.load() first")

    try:
        # In FastF1 3.7.0, session.laps contains lap-level data with Position
        return session.laps.copy()
    except Exception as e:
        raise RuntimeError(f"Failed to get lap timing from session.laps: {e}") from e


def get_position_data(session: Session) -> Dict:
    """
    Adapter: Get GPS position data (X, Y, Z coordinates).

    Returns:
        dict mapping driver_num -> DataFrame with X, Y, Z, Time columns
    """
    if session.pos_data is None:
        raise ValueError("Session does not have position data")

    return session.pos_data
