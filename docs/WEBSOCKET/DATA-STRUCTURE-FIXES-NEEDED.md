# Data Structure Fixes Required for UI to Work

**Status:** Root cause identified - track geometry is incomplete
**Date:** March 9, 2026
**User's Problem:** "Nothing on the UI is displaying"

---

## Root Cause: Missing Track Geometry

The track outline doesn't render because the Python extraction script doesn't compute the **inner and outer track boundaries**. The TrackVisualization3D component requires these fields and fails silently when they're missing.

---

## What Needs to Be Fixed

### Issue #1: Python Script Must Compute Track Geometry ⚠️ CRITICAL

**File:** `scripts/generate_telemetry.py`

**Current State:**
- Calls `get_race_telemetry()` which returns frame data
- Returns only centerline coordinates (X, Y)
- **Missing:** inner_x, inner_y, outer_x, outer_y, bounds, sectors

**Required Fix:**
```python
# Add this import at the top
from shared.utils.track_geometry import build_track_from_example_lap

# After getting telemetry data, add this:
if session_type in ['R', 'S']:
    example_lap = session.laps.iloc[0]  # First lap (usually leader)
else:
    example_lap = session.laps.iloc[0]  # Best qualifying lap

# Compute track geometry
centerline_x, centerline_y, inner_x, inner_y, outer_x, outer_y, \
    x_min, x_max, y_min, y_max, sectors = build_track_from_example_lap(
        example_lap[['X', 'Y']].values,
        track_width=300,
        lap_obj=example_lap
    )

# Add to telemetry output before returning
telemetry['track_geometry'] = {
    'centerline_x': centerline_x.tolist(),
    'centerline_y': centerline_y.tolist(),
    'inner_x': inner_x.tolist(),
    'inner_y': inner_y.tolist(),
    'outer_x': outer_x.tolist(),
    'outer_y': outer_y.tolist(),
    'x_min': float(x_min),
    'x_max': float(x_max),
    'y_min': float(y_min),
    'y_max': float(y_max),
    'sector': sectors
}
```

**Impact:** Once fixed, Go backend will have complete track geometry to send to frontend

---

### Issue #2: Go Backend Must Pass Track Geometry to Frontend ✅ DONE

**File:** `go-backend/main.go` (already fixed in this session)

**Fix Status:** ✅ APPLIED
- Added code to extract TrackGeometry from Python payload
- Converts to map format for JSON serialization
- Sends in loading_complete message

**Current Code (lines 481-510):**
```go
// Convert TrackGeometry to map format for frontend
trackGeometry := map[string]interface{}{}
if rawPayload.TrackGeometryTelemetry.X != nil && rawPayload.TrackGeometryTelemetry.Y != nil {
    trackGeometry = map[string]interface{}{
        "centerline_x": rawPayload.TrackGeometryTelemetry.X,
        "centerline_y": rawPayload.TrackGeometryTelemetry.Y,
        // ... other fields would be here once Python provides them
    }
}

sessionMeta := models.SessionMetadata{
    // ... other fields ...
    TrackGeometry: trackGeometry,
}
```

**Note:** This code will work once Issue #1 is fixed

---

### Issue #3: Frontend Components ✅ DONE

**Status:** Components are already ready to receive complete data
- TrackVisualization3D checks for inner_x, inner_y, outer_x, outer_y
- Will render track outline once these fields are populated
- No frontend code changes needed

---

## Summary Table

| Component | Issue | Status | Impact |
|-----------|-------|--------|--------|
| Python Script (generate_telemetry.py) | Doesn't compute track boundaries | ⚠️ NEEDS FIX | Track geometry incomplete |
| Go Backend (main.go) | Can't pass geometry it doesn't have | ✅ FIXED | Ready once Python provides data |
| Frontend (TrackVisualization3D) | Requires complete geometry to render | ✅ READY | Will work once data arrives |

---

## Testing the Fix

Once Issue #1 is fixed (Python script updated):

1. Start backend: `go run main.go`
2. In browser console, load a race session
3. After LoadingModal closes, check:
   ```javascript
   const metadata = useReplayStore.getState().session.metadata;
   console.log(metadata.track_geometry);
   // Should show: {centerline_x: [...], inner_x: [...], outer_x: [...], ...}
   ```
4. If complete, track outline will render in 3D view

---

## Additional Data Structure Fixes Applied

✅ **TrackStatuses** - Now properly converted to array of objects
✅ **RaceStartTime** - Now populated from payload
✅ **WeatherData** - Now passed through to frontend
✅ **FrameData** - All required fields being sent correctly
✅ **DriverData** - All fields match frontend expectations
✅ **WebSocket Protocol** - Fixed (removed unrecognized session_init message)
✅ **TelemetryChart** - Fixed undefined reference errors

---

## Files to Modify

### Primary Fix Needed:
- `scripts/generate_telemetry.py` - Add track geometry computation

### Already Fixed:
- `go-backend/main.go` - Metadata population
- `frontend/src/components/TelemetryChart.tsx` - Null checks
- `go-backend/ws/handler.go` - Protocol cleanup

---

## Expected Results After Fix

| Component | Before | After |
|-----------|--------|-------|
| Track Outline | ❌ Not visible | ✅ Visible |
| Leaderboard | ⚠️ Shows but no context | ✅ Shows with track data |
| 3D View | ⚠️ Camera setup only | ✅ Track and cars render |
| Playback | ✅ Works | ✅ Works with visuals |

---

## Documentation

For complete details, see: [data-structure-alignment.md](./data-structure-alignment.md)

This document explains:
- Complete data flow from backend to frontend
- Field mappings between Go/Python/TypeScript
- Why specific fields are needed
- What each component expects

