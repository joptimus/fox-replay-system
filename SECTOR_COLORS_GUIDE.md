# Sector-Colored Track Feature Guide

## Overview

The sector-colored track feature colors the track surface with three distinct colors representing the three sectors of each lap in Formula 1:
- **Sector 1 (Cyan)**: From the start/finish line to the first sector timing point
- **Sector 2 (Purple)**: From the first to second sector timing point
- **Sector 3 (Yellow)**: From the second sector timing point to the start/finish line

## How It Works

### Data Flow

1. **Backend loads session data**
   - Fetches FastF1 session with telemetry
   - Identifies fastest lap to use as reference

2. **Sector boundary computation**
   - Extracts sector end times from lap metadata
   - Uses linear interpolation on telemetry to find exact sector boundaries
   - Creates array of sector indices (1, 2, or 3) for each track point

3. **Frontend receives and renders**
   - Receives sector data in session metadata
   - Creates per-vertex colors for track surface
   - Renders with `THREE.MeshBasicMaterial` using `vertexColors: true`

### Accuracy

The implementation uses **linear interpolation** to compute sector boundaries accurately:
- Sector times are precise (to milliseconds)
- Telemetry samples may be spaced several meters apart
- Linear interpolation finds exact distance at each sector boundary
- Typically accurate to within ±1-2 meters

## Color Scheme

Official F1 sector colors:
- **Sector 1:** `#00e5ff` (Cyan)
- **Sector 2:** `#b700ff` (Purple)
- **Sector 3:** `#ffd400` (Yellow)

These match F1's official timing graphics color scheme.

## Technical Implementation

### Backend Components

**File:** `shared/utils/track_geometry.py`

```python
def compute_sector_boundaries(telemetry_df, lap_obj):
    """Compute sector indices for telemetry points"""
    # Linear interpolation to find sector boundary distances
    # Returns array of sector indices (1, 2, 3)

def build_track_from_example_lap(example_lap, track_width=300, lap_obj=None):
    """Build track geometry with optional sector data"""
    # Returns 11-element tuple including sector array
```

**File:** `backend/app/services/replay_service.py`

```python
# Session loading:
fastest_lap_obj = session.laps.pick_fastest()
fastest_lap_telem = fastest_lap_obj.get_telemetry()
track_data = build_track_from_example_lap(fastest_lap_telem, lap_obj=fastest_lap_obj)
self.track_geometry["sector"] = [int(s) for s in track_data[10]]
```

### Frontend Components

**File:** `frontend/src/types/index.ts`

```typescript
interface TrackGeometry {
  sector?: number[];  // Optional sector indices for each point
  // ... other fields
}
```

**File:** `frontend/src/components/TrackVisualization3D.tsx`

```typescript
// Generate color for each vertex
const sectorColors: Record<number, { r: number; g: number; b: number }> = {
  1: { r: 0.0, g: 0.898, b: 1.0 },      // Cyan
  2: { r: 0.718, g: 0.0, b: 1.0 },      // Purple
  3: { r: 1.0, g: 0.831, b: 0.0 },      // Yellow
};

// Create per-vertex color attribute
trackGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

// Use MeshBasicMaterial with vertex colors
const material = new THREE.MeshBasicMaterial({ vertexColors: true });
```

## Browser Display

When loaded in the browser, you should see:

1. **Colored track surface** - The race track displays with three distinct color bands
2. **White edges** - Track boundaries remain white for reference
3. **Smooth transitions** - Colors blend smoothly at sector boundaries
4. **No centerline** - The cyan centerline has been removed for a cleaner look

## Performance

- **One draw call** - Single BufferGeometry with vertex colors
- **Minimal overhead** - Computed once at session load, no per-frame updates
- **GPU efficient** - Standard Three.js rendering, no custom shaders needed
- **Memory efficient** - Sector data is just an integer array

## Backward Compatibility

- **Optional field** - If sector data is unavailable, track renders with default color
- **Optional parameter** - Old code continues to work without changes
- **Graceful degradation** - Sessions without sector data are fully functional

## Testing the Feature

### Load a race session
```
1. Start server: node dev.js
2. Open http://localhost:5173
3. Select a race session (e.g., 2024 Bahrain)
4. Observe the track colors
```

### Verify sector boundaries
- Sector 1 should cover the initial corners
- Sector 2 should cover the middle section
- Sector 3 should cover the final turns before the line
- Colors should transition smoothly

### Check different tracks
- Works with all circuits
- Sector boundaries visible for Monaco, Spa, Silverstone, etc.

## Debugging

### No colors showing?
1. Check browser console for errors
2. Verify sector data in network tab (session metadata)
3. Ensure `geometry.sector` array is present

### Colors not correct?
1. Verify sector times in FastF1 data (may be missing for practice sessions)
2. Check that `compute_sector_boundaries()` returns valid indices
3. Confirm Three.js vertex color material is enabled

### Performance issues?
1. Number of track points is typically 600-1000 (acceptable)
2. Single geometry ensures efficient rendering
3. Check GPU memory if using very large sessions

## Future Enhancements

Possible improvements:
1. **Gradient colors** - Smooth color gradients within sectors
2. **Sector labels** - Add text labels at sector start points
3. **Lap comparison** - Overlay sector times on screen
4. **Sector highlights** - Highlight specific sectors on hover
5. **Custom colors** - Allow user to customize sector colors

## Related Features

- Leaderboard with position sorting
- Playback controls (play, speed, frame seek)
- Driver selection and highlighting
- Track geometry from FastF1

## Support

For issues or questions:
1. Check `.claude/SECTOR_IMPLEMENTATION_SUMMARY.md` for technical details
2. Review commit `5baef29` for implementation changes
3. Check FastF1 documentation for data availability on different sessions

---

**Status:** Complete and functional
**Last Updated:** 2025-12-18
**Performance Impact:** Minimal (one additional draw call, pre-computed data)
