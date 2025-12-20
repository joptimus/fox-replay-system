import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
import pandas as pd
import numpy as np
from shared.telemetry.f1_data import _smooth_interval_data


def test_smooth_interval_data_basic():
    """Test that _smooth_interval_data processes dataframe correctly"""
    stream_data = pd.DataFrame({
        'Driver': ['HAM', 'HAM', 'HAM', 'VER', 'VER', 'VER'],
        'Interval_s': [0.5, 0.51, 0.52, 1.2, 1.21, 1.19],
    })

    result = _smooth_interval_data(stream_data, window_length=3, polyorder=1)

    assert 'Interval_smooth' in result.columns
    assert result[result['Driver'] == 'HAM']['Interval_smooth'].notna().sum() > 0
    assert result[result['Driver'] == 'VER']['Interval_smooth'].notna().sum() > 0


def test_smooth_interval_data_preserves_nan():
    """Test that NaN values are preserved"""
    stream_data = pd.DataFrame({
        'Driver': ['HAM', 'HAM', 'HAM'],
        'Interval_s': [0.5, np.nan, 0.51],
    })

    result = _smooth_interval_data(stream_data, window_length=3, polyorder=1)

    assert pd.isna(result.iloc[1]['Interval_smooth'])


def test_smooth_interval_data_empty():
    """Test that empty dataframe is handled gracefully"""
    stream_data = pd.DataFrame({'Interval_s': []})
    result = _smooth_interval_data(stream_data)

    assert result.empty
