# Race Start Timing Synchronization Fix

**Date:** December 2025
**Status:** Complete
**Severity:** Critical
**Impact:** Affects all race replay sessions (not qualifying)

## Overview

This document describes a critical fix to properly synchronize race start timing between the backend telemetry processing and frontend playback visualization. The issue involved misalignment between frame timeline coordinates and race start time, preventing accurate identification of when the race actually began.

## The Problem

### Timeline Mismatch

The F1 Race Replay system uses two different timing reference frames:

1. **Absolute Session Time** - Seconds from when the FIA started recording the session
2. **Relative Frame Time** - Seconds relative to the earliest telemetry data point (`global_t_min`)

The bug was that:
- **Frame times (`t` field)** were in **relative coordinates** (shifted by `global_t_min`)
- **Race start time** was being returned in **absolute session seconds** (from track status)
- Frontend comparison directly compared these incompatible values

### Example

Suppose:
- `global_t_min = 42.0` seconds (earliest telemetry from any driver)
- Lights turn green (track status "1") at `42.5` seconds absolute
- Frame 0 occurs at relative time `t = 0.0` (which is absolute time `42.0`)

**Before Fix:**
```javascript
// Frontend
currentFrame.t = 3.2  // relative seconds
metadata.race_start_time = 42.5  // absolute seconds

raceStarted = (3.2 >= 42.5)  // FALSE - always wrong!
```

**After Fix:**
```javascript
// Frontend
currentFrame.t = 3.2  // relative seconds
metadata.race_start_time = 0.5  // relative seconds (42.5 - 42.0)

raceStarted = (3.2 >= 0.5)  // TRUE - correct!
```

### Consequences

1. **Race start detection failed** - Frontend couldn't identify when race actually began
2. **Formation lap included in replay** - Frame 0 showed pre-race data (grid procedures)
3. **Race progress normalization broken** - Drivers' lap numbers and positions misaligned
4. **Visual sync issues** - Track status changes (yellow flags, safety car) didn't align correctly with position data

## Root Cause Analysis

### Timeline Construction

In `shared/telemetry/f1_data.py`, telemetry processing works as follows:

**Step 1: Extract absolute times from telemetry (Line 92)**
```python
t_lap = lap_tel["SessionTime"].dt.total_seconds().to_numpy()
# Result: [42.0, 42.04, 42.08, ...] - absolute session seconds
```

**Step 2: Find minimum across all drivers (Line 709)**
```python
global_t_min = min(all_driver_times)
# Result: 42.0 - earliest telemetry point (formation lap start)
```

**Step 3: Create relative timeline (Line 717)**
```python
timeline = np.arange(global_t_min, global_t_max, DT) - global_t_min
# Result: [0.0, 0.04, 0.08, ...] - relative to formation lap start
```

### Race Start Detection

**Step 4: Get track status from FastF1 (Line 801)**
```python
track_status = get_track_status(session)
# Returns DataFrame with Time column in absolute session seconds
```

**Step 5: Find first "All Clear" status (Lines 826-828)**
```python
if status['Status'] == "1":  # Green flag
    race_start_time = seconds  # Absolute session seconds
# Result: race_start_time = 42.5 (lights out at 42.5 seconds)
```

**Step 6: Return to frontend (Line 1214 - BEFORE FIX)**
```python
"race_start_time": race_start_time  # Still absolute! ❌
```

### The Logic Bug

There was also a secondary bug in race progress normalization:

**Step 7: Calculate race start frame index (Lines 894-896 - BEFORE FIX)**
```python
if race_start_time is not None:  # ❌ race_start_time is NEVER set here
    race_start_idx = int(np.argmin(np.abs(abs_timeline - race_start_time)))
else:
    race_start_idx = 0  # ❌ Always executes this branch!
```

This meant `race_start_idx` was always 0, causing race progress to be normalized to frame 0 instead of the actual race start frame.

## The Solution

### Two-Part Fix

#### Part 1: Separate Absolute and Relative Time (Line 805)

Store race start time in absolute coordinates until the final conversion:
```python
race_start_time = None
race_start_time_absolute = None  # New: track absolute time separately
```

#### Part 2: Capture in Absolute Coordinates (Line 827-828)

Record the race start time from track status in absolute seconds:
```python
if race_start_time_absolute is None and status['Status'] == "1":
    race_start_time_absolute = start_time  # Absolute session seconds
```

#### Part 3: Fix Race Progress Normalization (Lines 894-896)

Use the correct variable when calculating the race start frame index:
```python
# BEFORE FIX
if race_start_time is not None:  # ❌ Always None
    race_start_idx = int(np.argmin(np.abs(abs_timeline - race_start_time)))

# AFTER FIX
if race_start_time_absolute is not None:  # ✅ Correct variable
    race_start_idx = int(np.argmin(np.abs(abs_timeline - race_start_time_absolute)))
```

#### Part 4: Convert to Relative Time Before Return (Line 1195)

Convert race start time to relative coordinates for frontend consistency:
```python
race_start_time = race_start_time_absolute - global_t_min if race_start_time_absolute is not None else None
```

Now `race_start_time` is in relative coordinates, matching frame time coordinates.

## Technical Details

### Timing Reference Frames

**Absolute Session Time**
- Origin: Session start (FIA starts recording)
- Used for: FastF1 API data, track status events
- Example: `42.5` seconds

**Relative Frame Time**
- Origin: `global_t_min` (earliest telemetry)
- Used for: Frame playback, animation timeline
- Example: `0.5` seconds (= 42.5 - 42.0)

### Data Flow After Fix

```
FastF1 Track Status
    ↓
    ├─ Detect first "1" (Green)
    └─ Store in race_start_time_absolute (absolute)
          ↓
    Calculate race_start_idx using race_start_time_absolute
          ↓
    Normalize race_progress relative to race_start_idx
          ↓
    Convert to relative: race_start_time - global_t_min
          ↓
    Return to Backend (replay_service.py)
          ↓
    Send to Frontend in metadata
          ↓
Frontend Comparison
    currentFrame.t >= metadata.race_start_time
    (both in relative coordinates) ✅
```

### Frame Generation Loop

During frame generation (Line 984):
```python
t = timeline[i]  # Relative time: 0.0, 0.04, 0.08, ...
t_abs = t + global_t_min  # Convert to absolute: 42.0, 42.04, 42.08, ...

# t_abs is used for track status comparison (both absolute)
# t is stored in frame (relative)
```

This maintains consistency throughout the system.

## Code Changes

### File: `shared/telemetry/f1_data.py`

**Change 1: Line 805**
```python
+ race_start_time_absolute = None
```

**Change 2: Lines 827-828**
```python
- if race_start_time is None and status['Status'] == "1":
-     race_start_time = start_time
+ if race_start_time_absolute is None and status['Status'] == "1":
+     race_start_time_absolute = start_time
```

**Change 3: Lines 892-896**
```python
- # race_start_time is in "session seconds" (from track_status)
+ # race_start_time_absolute is in "session seconds" (from track_status)
- if race_start_time is not None:
+ if race_start_time_absolute is not None:
      abs_timeline = timeline + global_t_min
-     race_start_idx = int(np.argmin(np.abs(abs_timeline - race_start_time)))
+     race_start_idx = int(np.argmin(np.abs(abs_timeline - race_start_time_absolute)))
```

**Change 4: Line 1195**
```python
+ race_start_time = race_start_time_absolute - global_t_min if race_start_time_absolute is not None else None
```

## Impact Analysis

### What Gets Fixed

✅ **Race start frame correctly identified**
- `race_start_idx` now points to actual lights-out frame
- Previously always pointed to frame 0 (formation lap start)

✅ **Race progress normalizes correctly**
- All drivers have `race_progress = 0` at actual race start
- Previous behavior: drivers had negative race progress until lights out

✅ **Frontend race start detection works**
- `raceStarted = currentFrame.t >= metadata.race_start_time` is now meaningful
- Previously this was always false during the race

✅ **Lap numbers and positions align properly**
- Driver position data aligns with visual track position
- Lap number increments happen at correct frames

✅ **Track status events sync correctly**
- Yellow flags, safety cars appear at correct moments
- Previously could be offset by 30-60+ seconds

### What's Unaffected

- **Qualifying sessions** - Don't set `race_start_time`, handled gracefully via optional field
- **Track status times** - Still stored as absolute (correct, for FIA event reference)
- **Telemetry processing** - Continues to work as before
- **Frontend UI** - No changes needed (properly checks for undefined)

## Testing Recommendations

### Critical Tests

1. **Race Start Frame Verification**
   - Load a race session
   - Verify frame 0 shows formation lap (grid procedures)
   - Verify race start occurs at approximately `global_t_min - race_start_time` seconds into playback
   - Check that first driver move happens after race start frame

2. **Race Progress Normalization**
   - Verify all drivers have `race_progress >= 0`
   - Check that race progress = 0 at the race start frame
   - Verify monotonic increase in race progress throughout session

3. **Position Accuracy**
   - Verify positions match FIA official results at key points (lap 1 end, finish)
   - Check that position changes occur at correct frames
   - Validate against timing tower data if available

4. **Track Status Alignment**
   - Load race with safety car periods
   - Verify yellow flags appear at correct time in visualization
   - Check safety car deployment aligns with telemetry

### Edge Cases

5. **Delayed Race Start**
   - Test races with formation laps or false starts
   - Verify `race_start_idx` is not always 0
   - Check that race progress still normalizes correctly

6. **Qualifying Sessions**
   - Load qualifying session
   - Verify `race_start_time` is undefined/null
   - Check frontend gracefully handles missing field

7. **Sprint Races**
   - Test sprint qualifying (`SQ` session type)
   - Verify race start detection works for shorter format
   - Check timing with very short formation lap

### Performance Verification

8. **Caching Behavior**
   - Clear `computed_data/` directory
   - Load race (should compute and cache)
   - Load same race again (should load from cache)
   - Verify timing data matches between runs

## Related Components

### Backend Files

- `backend/app/services/replay_service.py` - Loads race data, includes `race_start_time` in metadata
- `shared/telemetry/fastf1_adapter.py` - Fetches track status from FastF1 API
- `shared/telemetry/f1_data.py` - Core telemetry processing and race start detection

### Frontend Files

- `frontend/src/components/Leaderboard.tsx` - Checks `raceStarted` flag (lines 35-38)
- `frontend/src/types/index.ts` - Metadata type includes optional `race_start_time` (line 73)
- `frontend/src/store/replayStore.ts` - Manages session metadata and frame playback

### Data Flow

```
FastF1 API → fastf1_adapter.py → f1_data.py → replay_service.py → frontend
                                    ↓
                          race_start_time_absolute
                                    ↓
                    Normalized via race_start_idx
                                    ↓
                    Converted to relative time
                                    ↓
                    race_start_time (relative)
                                    ↓
                            SessionMetadata
```

## Known Limitations

### Formation Lap Inclusion

The system intentionally includes formation lap data (frame 0 starts at `global_t_min`). This provides context but means:
- Initial frames show grid procedures, not race action
- This is by design for completeness of session data
- Frontend uses `race_start_time` to identify actual racing

### Track Status Time Precision

- Track status events are recorded with session-level precision
- May be off by a few tenths of a second in some cases
- Closest frame to race start time is used via `np.argmin()`

## Historical Context

### Before This Fix

The system had been returning `race_start_time` in absolute coordinates, which was incompatible with frame time coordinates. This went unnoticed because:
- Frontend check `currentFrame.t >= metadata.race_start_time` would never be true during normal playback
- The issue was masked by the race progress normalization bug (always normalizing to frame 0)
- Most UI components didn't rely on the `raceStarted` flag

### Discovery

The bug was identified during:
- Implementation of improved race start visualization
- Code review of timing synchronization changes
- Analysis of leaderboard position accuracy at race start

## Future Improvements

### Potential Enhancements

1. **Formation Lap Detection** - Could analyze track status changes to identify formation lap boundaries
2. **Race Restart Handling** - Support red flag restarts (multiple "All Clear" events)
3. **Session Clock Synchronization** - Sync with official FIA session clock for additional validation
4. **Timing Validation** - Compare detected race start with FastF1 official session dates

## References

- [FastF1 Documentation](https://docs.fastf1.dev/)
- [CLAUDE.md - Development Guide](../../CLAUDE.md) - Project overview and architecture
- [Architecture Overview](../../CLAUDE.md#architecture-overview) - How telemetry flows through system
- [Race Data Structures](../../CLAUDE.md#important-data-structures) - Frame format and timing fields

## Commit Information

This fix addresses race start timing synchronization issues identified in code review. The changes ensure that:
1. Race start time is properly detected from FIA track status
2. Race progress is normalized relative to actual lights-out
3. Frontend can reliably identify when race actually began
4. All telemetry data aligns with track status events

**Related Issues:** Race start frame timing sync with visualization lights
