"""
Track geometry utilities for F1 Race Replay
Calculates track boundaries from telemetry data (no arcade dependency)
"""

import numpy as np
import pandas as pd


def compute_sector_boundaries(telemetry_df, lap_obj):
    """
    Compute sector indices for each telemetry point using linear interpolation.

    Args:
        telemetry_df: FastF1 telemetry dataframe with Time, Distance columns
        lap_obj: FastF1 lap object with Sector1Time, Sector2Time attributes

    Returns:
        Array of sector indices (1, 2, or 3) matching telemetry_df length
    """
    try:
        if not hasattr(lap_obj, "Sector1Time") or not hasattr(lap_obj, "Sector2Time"):
            return None

        s1_time = lap_obj["Sector1Time"]
        s2_time = lap_obj["Sector2Time"]

        if pd.isna(s1_time) or pd.isna(s2_time):
            return None

        times = telemetry_df["Time"].values
        distances = telemetry_df["Distance"].values

        times_s = times.astype("timedelta64[ns]").astype(np.float64) / 1e9

        s1_end_t = s1_time.total_seconds()
        s2_end_t = s1_end_t + s2_time.total_seconds()

        s1_end_dist = _interpolate_distance_at_time(times_s, distances, s1_end_t)
        s2_end_dist = _interpolate_distance_at_time(times_s, distances, s2_end_t)

        sectors = np.zeros(len(distances), dtype=int)
        for i, d in enumerate(distances):
            if d <= s1_end_dist:
                sectors[i] = 1
            elif d <= s2_end_dist:
                sectors[i] = 2
            else:
                sectors[i] = 3

        return sectors.tolist()
    except Exception as e:
        print(f"Warning: Could not compute sector boundaries: {e}")
        return None


def _interpolate_distance_at_time(times_s, distances, target_t):
    """Linear interpolation to find distance at a given time."""
    after_idx = np.searchsorted(times_s, target_t, side="right")
    if after_idx == 0:
        return float(distances[0])
    if after_idx >= len(times_s):
        return float(distances[-1])

    before_idx = after_idx - 1
    t0, t1 = times_s[before_idx], times_s[after_idx]
    d0, d1 = distances[before_idx], distances[after_idx]

    if t1 == t0:
        return float(d0)

    alpha = (target_t - t0) / (t1 - t0)
    return float(d0 + alpha * (d1 - d0))


def build_track_from_example_lap(example_lap, track_width=300, lap_obj=None):
    """
    Build track geometry (inner, outer, centerline) from an example lap telemetry.

    Args:
        example_lap: FastF1 telemetry dataframe with 'X' and 'Y' columns
        track_width: Width of the track in meters (default 300)
        lap_obj: Optional FastF1 lap object for sector data

    Returns:
        Tuple of (centerline_x, centerline_y, inner_x, inner_y, outer_x, outer_y,
                  x_min, x_max, y_min, y_max, sectors)
        sectors is None if lap_obj not provided or sector data unavailable
    """
    plot_x_ref = example_lap["X"].values
    plot_y_ref = example_lap["Y"].values

    dx = np.gradient(plot_x_ref)
    dy = np.gradient(plot_y_ref)

    norm = np.sqrt(dx**2 + dy**2)
    norm[norm == 0] = 1.0
    dx /= norm
    dy /= norm

    nx = -dy
    ny = dx

    x_outer = plot_x_ref + nx * (track_width / 2)
    y_outer = plot_y_ref + ny * (track_width / 2)
    x_inner = plot_x_ref - nx * (track_width / 2)
    y_inner = plot_y_ref - ny * (track_width / 2)

    x_min = min(plot_x_ref.min(), x_inner.min(), x_outer.min())
    x_max = max(plot_x_ref.max(), x_inner.max(), x_outer.max())
    y_min = min(plot_y_ref.min(), y_inner.min(), y_outer.min())
    y_max = max(plot_y_ref.max(), y_inner.max(), y_outer.max())

    sectors = None
    if lap_obj is not None:
        sectors = compute_sector_boundaries(example_lap, lap_obj)

    return (plot_x_ref, plot_y_ref, x_inner, y_inner, x_outer, y_outer,
            x_min, x_max, y_min, y_max, sectors)
