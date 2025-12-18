"""
Track geometry utilities for F1 Race Replay
Calculates track boundaries from telemetry data (no arcade dependency)
"""

import numpy as np


def build_track_from_example_lap(example_lap, track_width=300):
    """
    Build track geometry (inner, outer, centerline) from an example lap telemetry.

    Args:
        example_lap: FastF1 telemetry dataframe with 'X' and 'Y' columns
        track_width: Width of the track in meters (default 200)

    Returns:
        Tuple of (centerline_x, centerline_y, inner_x, inner_y, outer_x, outer_y,
                  x_min, x_max, y_min, y_max)
    """
    plot_x_ref = example_lap["X"].values
    plot_y_ref = example_lap["Y"].values

    # Compute tangents using gradient
    dx = np.gradient(plot_x_ref)
    dy = np.gradient(plot_y_ref)

    # Normalize tangent vectors
    norm = np.sqrt(dx**2 + dy**2)
    norm[norm == 0] = 1.0
    dx /= norm
    dy /= norm

    # Compute perpendicular normals (rotated 90 degrees)
    nx = -dy
    ny = dx

    # Offset centerline by track width to get inner and outer edges
    x_outer = plot_x_ref + nx * (track_width / 2)
    y_outer = plot_y_ref + ny * (track_width / 2)
    x_inner = plot_x_ref - nx * (track_width / 2)
    y_inner = plot_y_ref - ny * (track_width / 2)

    # Calculate world bounds
    x_min = min(plot_x_ref.min(), x_inner.min(), x_outer.min())
    x_max = max(plot_x_ref.max(), x_inner.max(), x_outer.max())
    y_min = min(plot_y_ref.min(), y_inner.min(), y_outer.min())
    y_max = max(plot_y_ref.max(), y_inner.max(), y_outer.max())

    return (plot_x_ref, plot_y_ref, x_inner, y_inner, x_outer, y_outer,
            x_min, x_max, y_min, y_max)
