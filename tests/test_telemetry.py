import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
import pandas as pd
import numpy as np
from shared.telemetry.f1_data import _smooth_interval_data, sort_key_hybrid


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


def test_smooth_interval_data_missing_driver_column():
    """Test that missing Driver column is handled gracefully"""
    stream_data = pd.DataFrame({
        'Interval_s': [0.5, 0.51, 0.52],
    })
    result = _smooth_interval_data(stream_data)
    assert result is not None


def test_sort_key_hybrid_basic_sorting():
    """Test basic sorting with 3 drivers with known values"""
    frame_data_raw = {
        'HAM': {'pos_raw': 1, 'interval_smooth': 0.5, 'race_progress': 1000.0},
        'VER': {'pos_raw': 2, 'interval_smooth': 1.2, 'race_progress': 950.0},
        'SAI': {'pos_raw': 3, 'interval_smooth': 2.1, 'race_progress': 900.0},
    }

    ham_key = sort_key_hybrid('HAM', frame_data_raw)
    ver_key = sort_key_hybrid('VER', frame_data_raw)
    sai_key = sort_key_hybrid('SAI', frame_data_raw)

    assert ham_key < ver_key < sai_key
    assert ham_key == (1, 0.5, -1000.0)
    assert ver_key == (2, 1.2, -950.0)
    assert sai_key == (3, 2.1, -900.0)


def test_sort_key_hybrid_none_interval_smooth():
    """Test handling of None interval_smooth (falls back to 9999)"""
    frame_data_raw = {
        'HAM': {'pos_raw': 1, 'interval_smooth': 0.5, 'race_progress': 1000.0},
        'VER': {'pos_raw': 2, 'interval_smooth': None, 'race_progress': 950.0},
    }

    ver_key = sort_key_hybrid('VER', frame_data_raw)
    assert ver_key[1] == 9999
    assert ver_key == (2, 9999, -950.0)


def test_sort_key_hybrid_nan_race_progress():
    """Test handling of NaN race_progress (treated as 0.0)"""
    frame_data_raw = {
        'HAM': {'pos_raw': 1, 'interval_smooth': 0.5, 'race_progress': 1000.0},
        'VER': {'pos_raw': 2, 'interval_smooth': 1.2, 'race_progress': np.nan},
    }

    ver_key = sort_key_hybrid('VER', frame_data_raw)
    assert ver_key[2] == 0.0
    assert ver_key == (2, 1.2, 0.0)


def test_sort_key_hybrid_retired_driver():
    """Test handling of pos_raw <= 0 (treated as 9999, retired)"""
    frame_data_raw = {
        'HAM': {'pos_raw': 1, 'interval_smooth': 0.5, 'race_progress': 1000.0},
        'RET': {'pos_raw': 0, 'interval_smooth': None, 'race_progress': 500.0},
    }

    ret_key = sort_key_hybrid('RET', frame_data_raw)
    assert ret_key[0] == 9999
    assert ret_key == (9999, 9999, -500.0)


def test_sort_key_hybrid_tuple_ordering():
    """Test that tuple ordering is correct (lower values sort first)"""
    frame_data_raw = {
        'P1': {'pos_raw': 1, 'interval_smooth': 0.5, 'race_progress': 1000.0},
        'P2': {'pos_raw': 2, 'interval_smooth': 1.0, 'race_progress': 900.0},
        'P3': {'pos_raw': 3, 'interval_smooth': 1.5, 'race_progress': 800.0},
    }

    drivers = ['P1', 'P2', 'P3']
    sort_keys = [sort_key_hybrid(code, frame_data_raw) for code in drivers]

    sorted_drivers = sorted(drivers, key=lambda c: sort_key_hybrid(c, frame_data_raw))
    assert sorted_drivers == ['P1', 'P2', 'P3']
