# F1 Race Replay - Leaderboard Ordering Analysis

## Executive Summary

The Arcade leaderboard is displaying drivers in incorrect positions, while the Three.js visualization shows drivers in the correct locations on track. This document analyzes why the leaderboard ordering is wrong and how the 3D visualization gets it right.

**Core Issue:** The Arcade leaderboard uses pre-calculated position data from frame generation, but there's a **fundamental bug in how this position data is calculated and sorted**.

---

## Data Flow Architecture

### 1. Backend Data Generation Pipeline

```
FastF1 API
    ↓
src/f1_data.py::get_race_telemetry()
    ├─ Load session via FastF1
    ├─ Extract telemetry for all drivers
    ├─ Resample to 25 FPS timeline
    └─ Generate frame data
    ↓
Frame Generation (lines 351-456 in src/f1_data.py)
    ├─ For each timestamp:
    │   ├─ Create snapshot of all drivers
    │   ├─ SORT snapshot by position (line 396)  ← CRITICAL STEP
    │   ├─ Assign position: idx + 1 (line 414)
    │   └─ Build frame_data dict with position field
    ├─ Cache frames to pickle file
    └─ Return cached frames
    ↓
backend/main.py
    ├─ Load cached frames
    ├─ Serialize to JSON
    └─ Send via WebSocket to frontend
    ↓
frontend: useReplayWebSocket.ts
    ├─ Receive frame JSON from WebSocket
    ├─ Deserialize to FrameData object
    ├─ Store in Zustand state (replayStore)
    └─ Trigger component re-renders
```

### 2. Frame Data Structure

Each frame contains all driver data:

```json
{
  "t": 10.0,
  "lap": 1,
  "drivers": {
    "VER": {
      "x": 1234.5,
      "y": 5678.9,
      "dist": 500.0,
      "lap": 1,
      "rel_dist": 0.25,
      "position": 1,
      "speed": 320.5,
      "gear": 4,
      "drs": 0,
      "tyre": 2
    },
    "NOR": {
      "x": 1220.0,
      "y": 5650.0,
      "dist": 480.0,
      "lap": 1,
      "rel_dist": 0.24,
      "position": 2,
      "speed": 315.0,
      "gear": 4,
      "drs": 0,
      "tyre": 2
    }
    // ... more drivers
  }
}
```

**Key Fields:**
- `x`, `y` - World coordinates in meters (from FastF1 telemetry)
- `dist` - Cumulative race distance in meters
- `lap` - Current lap number
- `rel_dist` - Relative distance (0-1) = position on track as fraction of circuit length
- `position` - Race position (1-20) calculated at frame generation time

---

## The Bug: Position Calculation

### Where the Bug Lives

**File:** `src/f1_data.py`
**Function:** `get_race_telemetry()`
**Lines:** 387-396

```python
# Current sorting logic (HAS A BUG)
if is_race_start and grid_positions:
    snapshot.sort(key=lambda r: (grid_positions.get(r["code"], 999), -r["rel_dist"]))
elif race_finished and final_positions:
    snapshot.sort(key=lambda r: final_positions.get(r["code"], 999))
else:
    # During race: sorts by lap first, then rel_dist
    snapshot.sort(key=lambda r: (-r["lap"], -r["rel_dist"]))
```

### What's Wrong

At face value, the sorting looks correct:
1. Sort by lap number (descending) - higher lap = ahead ✓
2. Sort by rel_dist (descending) - further along track = ahead ✓

**But there's a hidden issue:** When drivers are on the **same lap**, `rel_dist` alone does NOT determine position. Consider this scenario:

**Frame 357 Example (Real Data):**
```
Driver  | Lap | rel_dist | Position Shown | Actually On Track
--------|-----|----------|----------------|------------------
VER     | 1   | 0.432    | 1st (correct)  | Leading ~431m into lap
ALB     | 1   | ???      | 2nd (WRONG!)   | Actually 5+ seconds behind on track
NOR     | 1   | 0.454    | 3rd           | Actually ahead of ALB
```

The problem: **The sorting is being done on CURRENT telemetry values that may be unreliable at certain points in the race.**

### Why This Matters

During early race (first lap):
- Drivers may have inconsistent telemetry data
- `rel_dist` values can be noisy or have gaps
- Grid positions haven't settled into actual track order yet

During pit stops:
- Driver's `rel_dist` temporarily shows them in pit lane
- Pit lane positions don't represent actual race order
- Driver emerges from pit but data can be delayed

### The Real Root Cause

**The frame is being sorted by the instantaneous position data at that exact moment, NOT by actual race position.**

---

## How Three.js Gets It Right

### Architecture Difference

Three.js visualization uses:
1. **Raw world coordinates** (x, y) directly from telemetry
2. **No position sorting** - just plots circles on track
3. **Visual rendering** of actual track positions

**File:** `frontend/src/components/TrackVisualization3D.tsx`
**Lines:** 265-326 (Update driver positions)

```typescript
// Three.js driver rendering
drivers.forEach(([code, driver]) => {
  const x = driver.x;  // ← Raw world coordinate
  const y = driver.y;  // ← Raw world coordinate

  // Create sphere mesh at (x, y) position
  mesh.position.set(x, 50, y);

  // That's it - no sorting, no position calculation
  // Visual position on track IS the actual position
});
```

### Why It Works

1. **X, Y coordinates are absolute** - they don't change based on sorting logic
2. **Visual proximity IS reality** - if VER is ahead on the track, he's rendered ahead
3. **No intermediate sorting step** - no opportunity for sort order to diverge from reality

### Track Geometry Reference

Three.js uses the same track geometry that was generated:
- `centerline_x/y` - center line of track
- `inner_x/y` - inner boundary
- `outer_x/y` - outer boundary

Drivers rendered with actual world coordinates will always appear in correct visual order relative to track.

---

## Arcade Leaderboard Rendering

### How Arcade Uses Position Data

**File:** `frontend/src/components/Leaderboard.tsx`
**Lines:** 17-34

```typescript
const drivers = Object.entries(currentFrame.drivers)
  .map(([code, data]) => ({
    code,
    data,
    position: data.position,  // ← Using pre-calculated position
    color: metadata.driver_colors[code],
  }))
  .sort((a, b) => {
    // Primary sort: by position
    if (a.position !== b.position) {
      return a.position - b.position;  // ← Sort by position field
    }
    // Tiebreaker: by distance
    const distDiff = (b.data.dist || 0) - (a.data.dist || 0);
    if (distDiff !== 0) return distDiff;
    // Final tiebreaker: alphabetically
    return a.code.localeCompare(b.code);
  });
```

The Arcade leaderboard **trusts the position field** calculated at frame generation time. But if that position is wrong, the display will be wrong.

---

## Visualizing the Disconnect

```
Frame Data Generation (Backend)
┌─────────────────────────────────────────┐
│ For each frame:                         │
│  1. Get driver telemetry (x,y,dist)     │
│  2. Sort by: (-lap, -rel_dist)          │ ← Potentially unreliable
│  3. Assign positions 1-20               │
│  4. Store in frame.drivers[code].position
└─────────────────────────────────────────┘
                   ↓
          Frame arrives at frontend
                   ↓
        ┌─────────────────────┐
        │ Three.js            │ Leaderboard.tsx
        ├─────────────────────┤
        │ Uses: (x, y)        │ Uses: .position
        │ Visual position =   │ Display order =
        │ True position       │ (potentially wrong)
        │                     │
        │ CORRECT ✓           │ WRONG ✗
        └─────────────────────┘
```

---

## Why rel_dist Can Be Wrong

### Issue 1: Early Race Unreliability

At race start (first 10 seconds), telemetry may be:
- Sparse or interpolated
- Grid positions haven't translated to track positions
- `rel_dist` values noisy

### Issue 2: Pit Stop Complications

When a driver pits:
```
Time: 45:00
Driver position: In pit lane
rel_dist: 0.05 (pit lane section of track data)
Actual race position: Should be last or near-last, but telemetry shows them near start
```

### Issue 3: Data Quality Issues

FastF1 telemetry quality varies:
- Some drivers have more frequent updates
- Interpolation can create artificial gaps
- Coordinate projections can have errors

---

## The Fix (What Should Happen)

### Option A: Use Accumulated Distance

Instead of relying on instantaneous `rel_dist`, calculate true race progress:

```python
# Better sorting approach
total_distance = (lap - 1) * circuit_length + rel_dist * circuit_length
snapshot.sort(key=lambda r: -total_distance)
```

This accounts for:
- How many laps completed
- Progress on current lap
- Gives smoother ordering progression

### Option B: Use Position Changes Smoothly

Track position changes rather than recalculating each frame:
```python
# Use previous frame's positions as baseline
# Only reorder when driver actually passes another
```

### Option C: Use Official Telemetry Position Field

FastF1 may provide an official position field that's more reliable.

---

## Recommended Diagnostic Steps

### 1. Log Sorting Data

Add logging to `src/f1_data.py` around line 396:

```python
if 10 < time_seconds < 35:
    debug_data = [
        (r["code"], r["lap"], r["rel_dist"], r["dist"])
        for r in snapshot[:5]
    ]
    print(f"DEBUG t={time_seconds:.1f}s BEFORE_SORT: {debug_data}", flush=True)

    # Do the sort here
    snapshot.sort(key=lambda r: (-r["lap"], -r["rel_dist"]))

    debug_data = [
        (r["code"], r["lap"], r["rel_dist"], r["dist"])
        for r in snapshot[:5]
    ]
    print(f"DEBUG t={time_seconds:.1f}s AFTER_SORT: {debug_data}", flush=True)
```

### 2. Compare with Three.js

Run both Arcade and web versions side-by-side at same frame, check:
- Do drivers appear in different visual order on track?
- What positions does Arcade show vs actual track positions?

### 3. Check FastF1 Source

Examine raw FastF1 telemetry for frame 357:
```python
session = fastf1.get_session(...)
telemetry = session.laps...get_telemetry()
# Print position field if it exists
```

### 4. Test with Smooth Distance

Modify sorting to use total distance instead:
```python
total_dist = (max(r["lap"], 1) - 1) * circuit_length + r["rel_dist"] * circuit_length
snapshot.sort(key=lambda r: -total_dist)
```

---

## Files Involved

| File | Role | Issue? |
|------|------|--------|
| `src/f1_data.py:396` | Position sorting logic | **PRIMARY - BUG HERE** |
| `src/f1_data.py:414` | Assign positions 1-20 | Depends on sorting |
| `frontend/src/components/Leaderboard.tsx:24-28` | Display using position | Displays buggy data |
| `frontend/src/components/TrackVisualization3D.tsx:315` | Render using x,y | Renders correctly |
| `backend/main.py` | Serialize frames | Passes buggy data through |

---

## Conclusion

The Arcade leaderboard shows wrong driver positions because the `position` field calculated during frame generation is based on potentially unreliable `rel_dist` sorting. The Three.js visualization appears correct because it uses raw world coordinates (x, y) which are direct from telemetry and not subject to sorting logic.

**The fix must be in the frame generation sorting logic**, not in the UI layer. The data needs to be correct at the source.

---

## Questions for Peer Review

1. Does FastF1 provide an official position/rank field we should use instead?
2. Should we smooth position changes frame-to-frame to prevent sudden jumps?
3. At race start, should we use grid positions longer until drivers settle?
4. What's the expected behavior at pit stops - should pit position be in race order?
5. Should we calculate distance differently for multi-lap races?
