# WebSocket Data Structure Alignment Guide

**Date:** March 9, 2026
**Status:** ACTIVE - Data Structure Mismatch Identified and Fixed
**Severity:** HIGH - UI not displaying due to data structure issues

---

## Executive Summary

After the Go backend rewrite and performance fixes, the **data structures being sent from the backend don't fully match what the frontend expects**. This is why "nothing on the UI is displaying" even though the WebSocket connection and frame streaming are working.

### What's Fixed in Go Backend:
✅ Binary search performance (265x speedup achieved)
✅ WebSocket protocol (session_init message removed)
✅ Metadata fields added (TrackStatuses, TrackGeometry, etc.)
✅ Frame generation working

### What Needs Verification:
⚠️ All metadata fields actually being populated
⚠️ Frame data structure sent matches FrameData interface
⚠️ Frontend components can handle all data types

---

## Part 1: Frontend Expects (TypeScript Interfaces)

### FrameData Interface (what frontend expects in msgpack frames):
```typescript
interface FrameData {
  frame_index?: number;        // ✓ Sent by Go backend
  t: number;                   // ✓ Sent by Go backend
  lap: number;                 // ✓ Sent by Go backend
  drivers: Record<string, DriverData>;  // ✓ Sent by Go backend
  weather?: WeatherData;       // ⚠️ NOT sent by Go backend
  error?: string;              // ⚠️ NOT sent by Go backend
}
```

### DriverData Interface (what frontend expects per driver in each frame):
```typescript
interface DriverData {
  x: number;                   // ✓ Sent as 'x'
  y: number;                   // ✓ Sent as 'y'
  speed: number;               // ✓ Sent as 'speed'
  gear: number;                // ✓ Sent as 'gear'
  lap: number;                 // ✓ Sent as 'lap'
  position: number;            // ✓ Sent as 'position'
  tyre: number;                // ✓ Sent as 'tyre'
  throttle: number;            // ✓ Sent as 'throttle'
  brake: number;               // ✓ Sent as 'brake'
  drs: number;                 // ✓ Sent as 'drs'
  dist: number;                // ✓ Sent as 'dist'
  rel_dist: number;            // ✓ Sent as 'rel_dist'
  race_progress: number;       // ✓ Sent as 'race_progress'
  lap_time?: number | null;    // ⚠️ NOT sent - OPTIONAL
  sector1?: number | null;     // ⚠️ NOT sent - OPTIONAL
  sector2?: number | null;     // ⚠️ NOT sent - OPTIONAL
  sector3?: number | null;     // ⚠️ NOT sent - OPTIONAL
  status?: string;             // ✓ Sent as 'status'
  gap_to_previous?: number;    // ✓ Sent as 'gap_to_previous'
  gap_to_leader?: number;      // ✓ Sent as 'gap_to_leader'
}
```

### SessionMetadata Interface (sent in loading_complete message):
```typescript
interface SessionMetadata {
  year: number;                // ✓ Sent
  round: number;               // ✓ Sent
  session_type: string;        // ✓ Sent
  total_frames: number;        // ✓ Sent as 'total_frames'
  total_laps: number;          // ✓ Sent as 'total_laps'
  driver_colors: Record<string, [number, number, number]>;  // ✓ Sent as 'driver_colors'
  track_geometry?: TrackGeometry;      // ✅ NOW SENT (was missing)
  track_statuses?: TrackStatus[];      // ✅ NOW SENT (was missing)
  race_start_time?: number;            // ✅ NOW SENT (was missing)
  quali_segments?: QualiSegments;      // ✅ NOW SENT (was missing)
  error?: string;                      // ⚠️ Not in loading_complete
}
```

### TrackGeometry Interface:
```typescript
interface TrackGeometry {
  centerline_x: number[];      // ⚠️ GO sends as generic map
  centerline_y: number[];      // ⚠️ GO sends as generic map
  inner_x: number[];           // ⚠️ GO sends as generic map
  inner_y: number[];           // ⚠️ GO sends as generic map
  outer_x: number[];           // ⚠️ GO sends as generic map
  outer_y: number[];           // ⚠️ GO sends as generic map
  x_min: number;               // ⚠️ GO sends as generic map
  x_max: number;               // ⚠️ GO sends as generic map
  y_min: number;               // ⚠️ GO sends as generic map
  y_max: number;               // ⚠️ GO sends as generic map
  sector?: number[];           // ⚠️ GO sends as generic map
}
```

### TrackStatus Interface:
```typescript
interface TrackStatus {
  status: string;              // ✓ Sent
  start_time: number;          // ✓ Sent
  end_time: number | null;     // ⚠️ GO sends as 'end_time'
}
```

---

## Part 2: What Go Backend Actually Sends

### SessionMetadata struct (Go):
```go
type SessionMetadata struct {
  Year              int                         `json:"year"`
  Round             int                         `json:"round"`
  SessionType       string                      `json:"session_type"`
  TotalLaps         int                         `json:"total_laps"`
  TotalFrames       int                         `json:"total_frames"`
  DriverNumbers     map[string]string           `json:"driver_numbers"`         // Extra
  DriverTeams       map[string]string           `json:"driver_teams"`           // Extra
  DriverColors      map[string][3]int           `json:"driver_colors"`
  TrackStatuses     []map[string]interface{}    `json:"track_statuses"`         // ✅ NEW
  TrackGeometry     map[string]interface{}      `json:"track_geometry"`         // ✅ NEW (as generic map!)
  RaceStartTime     *float64                    `json:"race_start_time"`        // ✅ NEW (pointer)
  WeatherData       map[string]interface{}      `json:"weather_data"`           // ✅ NEW
  QualiSegments     map[string]interface{}      `json:"quali_segments"`         // ✅ NEW
}
```

### DriverData struct (Go):
```go
type DriverData struct {
  X              float64  `json:"x"`
  Y              float64  `json:"y"`
  Speed          float64  `json:"speed"`
  Lap            int      `json:"lap"`
  Tyre           int      `json:"tyre"`
  Gear           int      `json:"gear"`
  DRS            int      `json:"drs"`
  Throttle       float64  `json:"throttle"`
  Brake          float64  `json:"brake"`
  RPM            int      `json:"rpm"`                  // Extra - frontend ignores
  Dist           float64  `json:"dist"`
  RelDist        float64  `json:"rel_dist"`
  RaceProgress   float64  `json:"race_progress"`
  Position       int      `json:"position"`
  PosRaw         *int     `json:"pos_raw,omitempty"`     // Extra - frontend ignores
  Gap            *float64 `json:"gap,omitempty"`         // Extra - frontend ignores
  IntervalSmooth *float64 `json:"interval_smooth,omitempty"`  // Extra - frontend ignores
  GapToLeader    float64  `json:"gap_to_leader"`
  GapToPrevious  float64  `json:"gap_to_previous"`
  Status         string   `json:"status"`
  // Missing from Go: lap_time, sector1, sector2, sector3 (only for qualifying)
}
```

---

## Part 3: Data Alignment Issues

### Issue #1: TrackGeometry is Generic Map (not strongly typed)
**Problem:** Go sends TrackGeometry as `map[string]interface{}` but frontend expects strongly-typed array fields.

**Where it matters:**
- `TrackVisualization3D.tsx` component uses `metadata.track_geometry?.centerline_x` to render track outline
- If centerline_x/y aren't proper number arrays, track won't render

**Impact:** Track outline disappears from visualization

**Current Status in Go:**
```go
TrackGeometry     map[string]interface{}      `json:"track_geometry,omitempty"`
```

**Frontend expects:**
```typescript
interface TrackGeometry {
  centerline_x: number[];
  centerline_y: number[];
  inner_x: number[];
  inner_y: number[];
  outer_x: number[];
  outer_y: number[];
  x_min: number;
  x_max: number;
  y_min: number;
  y_max: number;
  sector?: number[];
}
```

### Issue #2: TrackStatuses may not be Properly Converted
**Problem:** Go converts `rawPayload.TrackStatuses` to `[]map[string]interface{}` but frontend expects `TrackStatus[]` interface.

**Where it matters:**
- `Leaderboard.tsx` reads `metadata?.track_statuses` to determine current session state
- May use it to show flags (yellow, red, VSC, etc.)

**Current Status in Go:**
```go
trackStatusMaps := make([]map[string]interface{}, len(rawPayload.TrackStatuses))
for i, ts := range rawPayload.TrackStatuses {
    trackStatusMaps[i] = map[string]interface{}{
        "status":     ts.Status,
        "start_time": ts.StartTime,
        "end_time":   ts.EndTime,
    }
}
metadata.TrackStatuses = trackStatusMaps
```

**This should work**, but we need to verify the field names match:
- `"status"` ✓ matches TrackStatus.status
- `"start_time"` ✓ matches TrackStatus.start_time
- `"end_time"` ✓ matches TrackStatus.end_time | null

### Issue #3: Frame Data Missing Optional Lap Metrics
**Problem:** Go doesn't send `lap_time`, `sector1`, `sector2`, `sector3` per driver per frame.

**Where it matters:**
- `TelemetryChart.tsx` reads these to show lap timing analysis
- `Leaderboard.tsx` might use these for timing displays

**Current Status:**
- These fields are OPTIONAL in the interface (`?: number | null`)
- Frontend should handle them being undefined
- TelemetryChart already has fallback: `(currentDriverData.throttle || 0)`

**Impact:** LOW - telemetry chart shows less data but shouldn't crash

### Issue #4: RaceStartTime is Pointer (could be null)
**Problem:** In Go, `RaceStartTime *float64` could be nil, but frontend expects `number | undefined`.

**Where it matters:**
- Components that use race_start_time to adjust relative timing

**Current Status:**
- JSON serialization of nil pointers becomes `null` in JSON
- Frontend should handle this with optional chaining

---

## Part 4: What's Currently Working

✅ **WebSocket Connection:** Frontend connects to `ws://localhost:8000/ws/replay/{sessionId}`
✅ **Protocol Messages:** Receives `loading_progress`, `generation_progress`, `loading_complete`, `error` as JSON
✅ **Binary Frame Streaming:** Receives msgpack-encoded frames as binary messages
✅ **Frame Deserialization:** `Unpackr` correctly decodes msgpack frames
✅ **Store Updates:** Frame data correctly stored in Zustand store
✅ **Metadata Loading:** Metadata from `loading_complete` message correctly stored

---

## Part 5: Why "Nothing on UI is Displaying"

Possible causes:

### Cause A: LoadingModal Never Closes
**Symptom:** Loading modal stays open indefinitely
**Root Cause:** `isLoadingComplete` never becomes true (WebSocket didn't receive `loading_complete`)

**Debug:** Check browser console:
```
[WS Client] Loading complete  // Should appear
```

**Check backend logs for errors:**
```
session not ready: ERROR  // Indicates backend failed
```

### Cause B: LoadingModal Closes But ReplayView is Blank
**Symptom:** Modal closes, but UI shows nothing
**Root Cause:** TrackVisualization3D or Leaderboard failed to render

**Likely:** TrackGeometry is not being set correctly (map vs typed object)

**Debug in browser DevTools:**
```javascript
// Check what metadata was received
const store = useReplayStore.getState();
console.log(store.session.metadata);
// Look for: track_geometry, track_statuses, etc.
```

### Cause C: TypeError from Missing Data
**Symptom:** "Cannot read property X of undefined" error in console
**Root Cause:** Component tries to access field that doesn't exist or is the wrong type

**Already Fixed:**
- TelemetryChart checks for `currentDriverData`
- Leaderboard has guards for metadata

**Still Possible Issues:**
- TrackVisualization3D assumes track_geometry is properly formatted array-based object

---

## Part 6: Verification Checklist

Before saying data structure is correct, verify:

- [ ] **Backend populates TrackGeometry**
  - Check if `rawPayload.TrackGeometry` is available and populated
  - Verify field names: centerline_x, centerline_y, etc.

- [ ] **Backend populates TrackStatuses**
  - Check if `rawPayload.TrackStatuses` is available
  - Verify conversion to map works: status, start_time, end_time

- [ ] **Frame data complete**
  - All DriverData fields being set in Go frame generation
  - No nil pointers being sent without `omitempty`

- [ ] **Loading complete message sent**
  - Handler sends loading_complete with metadata
  - Metadata object is JSON-serializable

- [ ] **Frontend receives metadata**
  - Browser console should show metadata structure
  - Run: `useReplayStore.getState().session.metadata`

---

## Part 7: Required Frontend Changes

### Change #1: Handle TrackGeometry as Generic Map (if needed)
If TrackGeometry is coming through as `map[string]interface{}` instead of typed arrays:

**File:** `frontend/src/components/TrackVisualization3D.tsx`

Add type guard/conversion:
```typescript
const trackGeometry = metadata?.track_geometry as unknown as TrackGeometry;
if (trackGeometry) {
  const centerlineX = trackGeometry.centerline_x || [];
  const centerlineY = trackGeometry.centerline_y || [];
  // ... use arrays
}
```

### Change #2: Handle TrackStatuses Array Type
If TrackStatuses coming through as generic objects:

**File:** `frontend/src/components/Leaderboard.tsx`

Add type assertion:
```typescript
const trackStatuses = metadata?.track_statuses as unknown as TrackStatus[];
if (trackStatuses && trackStatuses.length > 0) {
  // Use track status data
}
```

### Change #3: Verify Components Handle Optional Fields
All component props should handle optional metadata fields:

```typescript
// Good - handles undefined
const trackGeometry = metadata?.track_geometry;
const trackOutline = trackGeometry ? renderTrack(trackGeometry) : null;

// Good - handles null frame
if (!currentFrame) return <div>No frame data</div>;

// Good - handles undefined driver data
const speed = currentDriverData?.speed ?? 0;
```

---

## Part 8: Testing Commands

### Test 1: Verify WebSocket Connection Works
```bash
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  http://localhost:8000/ws/replay/test-session-id
```

### Test 2: Check Backend Logs for Errors
```bash
# Look for any error messages during session creation
tail -f /tmp/backend.log | grep -i error
```

### Test 3: Verify Frontend Receives Metadata
Open browser console and run:
```javascript
// After loading a session
const metadata = useReplayStore.getState().session.metadata;
console.log('Track Geometry:', metadata.track_geometry);
console.log('Track Statuses:', metadata.track_statuses);
console.log('Total Frames:', metadata.total_frames);
```

### Test 4: Check Frame Structure
```javascript
const frame = useReplayStore.getState().currentFrame;
console.log('Frame keys:', Object.keys(frame));
console.log('Driver data:', frame.drivers?.HAM);  // Check a driver
```

---

## Part 9: Summary of Data Flow

```
┌─────────────────────────────────────────────────────────┐
│ Frontend: POST /api/sessions                            │
│ {year: 2025, round: 1, session_type: "R"}              │
└───────────────┬─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────┐
│ Go Backend: Create/Load Session                         │
│ - Load telemetry from cache or Python bridge           │
│ - Populate SessionMetadata with:                        │
│   * track_geometry (⚠️ as generic map)                  │
│   * track_statuses (✓)                                  │
│   * race_start_time (✓)                                 │
│   * quali_segments (✓)                                  │
│ - Return session_id                                     │
└───────────────┬─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────┐
│ Frontend: WebSocket Connect to ws://localhost:8000/    │
│ ws/replay/{sessionId}                                   │
└───────────────┬─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────┐
│ Go Backend: Stream Messages                             │
│ 1. generation_progress (JSON)                           │
│ 2. loading_complete (JSON) with metadata                │
│    - Includes track_geometry, track_statuses, etc.     │
│ 3. Frame data (msgpack binary)                          │
│    - Repeating frames at 60 Hz during playback         │
└───────────────┬─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────┐
│ Frontend: Process & Render                              │
│ - Store.setSession(metadata)  [opens TrackViz, Leaderboard] │
│ - Store.setCurrentFrame(frame) [updates animation]     │
│ - Components read from store and render                │
└─────────────────────────────────────────────────────────┘
```

---

## Part 9A: CRITICAL ISSUE - Track Geometry Not Available

### 🚨 ROOT CAUSE OF "NOTHING DISPLAYING"

The **frontend REQUIRES `inner_x, inner_y, outer_x, outer_y` arrays to render the track**, but the current pipeline only provides centerline data.

**This is why nothing displays on the UI!**

### The Problem:

1. **Python script** (`scripts/generate_telemetry.py`) calls `get_race_telemetry()`
2. **Returns**: Only frame data (positions, speeds, etc.)
3. **Missing**: Track geometry (inner/outer boundaries)
4. **Result**: Go backend receives incomplete geometry
5. **Frontend**: TrackVisualization3D fails silently when inner_x/outer_x are undefined

### Frontend Failure Point:
```typescript
// TrackVisualization3D.tsx, line 370
if (!geometry.centerline_x?.length || !geometry.outer_x?.length || !geometry.inner_x?.length) {
  console.error("Track geometry arrays are empty or invalid");
  return;  // ← RETURNS EARLY, NOTHING RENDERS
}
```

### What We Have vs. What We Need:

| Field | Available | Required | Source |
|-------|-----------|----------|--------|
| `centerline_x` | ✓ YES | ✓ YES | Telemetry X coordinates |
| `centerline_y` | ✓ YES | ✓ YES | Telemetry Y coordinates |
| `inner_x` | ❌ NO | ✓ YES | Computed from centerline |
| `inner_y` | ❌ NO | ✓ YES | Computed from centerline |
| `outer_x` | ❌ NO | ✓ YES | Computed from centerline |
| `outer_y` | ❌ NO | ✓ YES | Computed from centerline |
| `x_min`, `x_max` | ❌ NO | ✓ YES | Computed from all bounds |
| `y_min`, `y_max` | ❌ NO | ✓ YES | Computed from all bounds |
| `sector` | ❌ NO | ? MAYBE | Computed from sector times |

### Solution Already Exists:

The `shared/utils/track_geometry.py` file has the **complete solution**:

```python
def build_track_from_example_lap(example_lap, track_width=300, lap_obj=None):
    """
    Takes centerline data and computes:
    - Perpendicular normals using np.gradient
    - Inner boundary = centerline - normals * (track_width/2)
    - Outer boundary = centerline + normals * (track_width/2)
    - Bounds (x_min, x_max, y_min, y_max)
    - Sector boundaries (if lap_obj provided)
    """
    # ... computes and returns all required fields
    return (centerline_x, centerline_y, inner_x, inner_y, outer_x, outer_y,
            x_min, x_max, y_min, y_max, sectors)
```

**But it's never called in the pipeline!**

### Why Track Outline Doesn't Render:

```
Python extracts telemetry (centerline only)
            ↓
Go backend receives incomplete geometry
            ↓
Metadata sent to frontend with only centerline_x/y
            ↓
TrackVisualization3D checks for inner_x
            ↓
inner_x is undefined → Component returns early
            ↓
🎨 NO TRACK RENDERING
```

### Required Fix:

Update `scripts/generate_telemetry.py` to:

```python
# After calling get_race_telemetry()
from shared.utils.track_geometry import build_track_from_example_lap

# Get an example lap for track geometry
if session_type in ['R', 'S']:
    # Use leader's lap for race/sprint
    example_lap = session.laps[0]
else:
    # Use best qualifying lap
    example_lap = session.laps[0]

# Compute track geometry
centerline_x, centerline_y, inner_x, inner_y, outer_x, outer_y, \
    x_min, x_max, y_min, y_max, sectors = build_track_from_example_lap(
        example_lap,
        track_width=300,
        lap_obj=example_lap
    )

# Add to output
output['track_geometry'] = {
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

### Impact:
Once this fix is applied:
- ✓ Track outline renders
- ✓ Sector boundaries display
- ✓ Leaderboard has spatial context
- ✓ 3D visualization becomes functional

---

## Part 10: Next Steps

1. **Run full end-to-end test:**
   - Start backend: `go run main.go`
   - Start frontend: `npm start`
   - Load a race session
   - Open browser DevTools → Console
   - Check for any errors

2. **If LoadingModal appears:**
   - ✓ WebSocket connection is working
   - ✓ Backend is generating data
   - Wait for it to close

3. **If UI still blank after modal closes:**
   - Check console for errors in components
   - Verify metadata structure: `useReplayStore.getState().session.metadata`
   - Check if track_geometry and track_statuses are populated
   - Look for TypeErrors accessing undefined properties

4. **If specific component not rendering:**
   - TrackVisualization3D not showing: Check track_geometry structure
   - Leaderboard not showing: Check track_statuses and driver_colors
   - TelemetryChart not showing: Check currentFrame structure

---

## Documentation References

- **Frontend Types:** [frontend/src/types/index.ts](../../frontend/src/types/index.ts)
- **Go Models:** [go-backend/models/types.go](../../go-backend/models/types.go)
- **WebSocket Hook:** [frontend/src/hooks/useReplayWebSocket.ts](../../frontend/src/hooks/useReplayWebSocket.ts)
- **Store:** [frontend/src/store/replayStore.ts](../../frontend/src/store/replayStore.ts)

---

**Status:** This document should be checked after running a full test to verify all data structures align correctly.
