# Leaderboard Debug Guide

**Purpose**: Track and verify driver data consistency across the first 150 frames of playback
**Status**: Active - Real-time frame logging and analysis

---

## Quick Start

### Automatic Debug Reporting

The debug system is **automatically enabled** and will:

1. **Log every frame** for the first 150 frames (6 seconds at 25 FPS)
2. **Detect anomalies** in real-time:
   - Drivers disappearing between frames
   - Drivers reappearing after disappearing
   - Unexpected position changes
   - Driver count inconsistencies
3. **Generate a comprehensive report** at frame 150

### How to View Debug Output

#### Option 1: Chrome DevTools Console (Recommended)

1. Open the F1 Race Replay in your browser
2. Press `F12` to open Developer Tools
3. Click the **Console** tab
4. Load a race session and watch frames advance
5. At frame 150, you'll see:

```
=== Frame 150 Reached - Printing Debug Report ===

🏎️ Leaderboard Debug Report
📊 Frames Analyzed: 150 / 150
✅ Consistency Score: 100.0/100
⚠️  Missing Drivers: 0
...
```

#### Option 2: Browser Console via JavaScript

```javascript
// In browser console
leaderboardDebugger.printReport();

// Or export as JSON
const report = leaderboardDebugger.exportReport();
console.log(JSON.parse(report));
```

#### Option 3: Real-time Monitoring

As frames advance, watch the console for warnings:

```
[Frame 42] ⚠️  DRIVER DISAPPEARED: HAM (was at P3)
[Frame 43] ℹ️  DRIVER REAPPEARED: HAM (now at P4)
[Frame 45] 🔄 LARGE POSITION CHANGE: VER P2 → P1 (Δ1)
```

---

## Understanding the Debug Report

### Report Structure

```
🏎️ Leaderboard Debug Report
├─ 📊 Frames Analyzed: 150 / 150
├─ ✅ Consistency Score: 100.0/100
├─ ⚠️  Missing Drivers: 0
├─ Disappearance Events: 0
└─ Frame Gaps: 0
```

### Metrics Explained

| Metric | Meaning | Ideal Value |
|--------|---------|------------|
| **Frames Analyzed** | Number of frames tracked | 150 |
| **Consistency Score** | 0-100 rating of stability | 100.0 |
| **Missing Drivers** | Count of drivers with gaps | 0 |
| **Disappearance Events** | Total missing + reappeared | 0 |
| **Frame Gaps** | Periods when drivers were missing | 0 |

### Consistency Score Calculation

```
Score = 100 - (disappearance_events / 2) × 5

Examples:
- 0 disappearances → 100.0/100 ✅
- 1 disappearance pair → 97.5/100 ⚠️
- 5 disappearance pairs → 87.5/100 🔴
```

---

## Example: Analyzing a Real Issue

### Scenario: Driver Disappears at Frame 42

**Console Output:**
```
[Frame 42] ⚠️  DRIVER DISAPPEARED: HAM (was at P3)
[Frame 43] ⚠️  DRIVER DISAPPEARED: VER (was at P2)
[Frame 44] ℹ️  DRIVER REAPPEARED: HAM (now at P4)
[Frame 45] ⚠️  DRIVER DISAPPEARED: HAM (was at P4)
```

**Report Shows:**
```
Disappearance Events: 5
├─ Frame 42 (1.68s): HAM P3 - completely_missing
├─ Frame 43 (1.72s): VER P2 - completely_missing
├─ Frame 44 (1.76s): HAM P4 - reappeared
├─ Frame 45 (1.80s): HAM P4 - completely_missing
```

**Analysis:**
- HAM disappeared, reappeared, then disappeared again
- VER also disappeared
- This indicates a problem in the leaderboard sorting logic (likely the PositionSmoothing bug)
- **Action**: Check if fix from commit f4104e2 is applied

---

## Manual API Usage

### Import the Debugger

```typescript
import { leaderboardDebugger } from "../utils/leaderboardDebug";
```

### Log a Frame Manually

```typescript
// In your component or hook
leaderboardDebugger.logFrame(
  frameIndex,  // number (0-150)
  time,        // number (seconds from race start)
  drivers      // Record<string, DriverData>
);
```

### Get Current Report

```typescript
const report = leaderboardDebugger.generateReport();

console.log(`Total frames: ${report.totalFramesAnalyzed}`);
console.log(`Score: ${report.consistencyScore.toFixed(1)}/100`);
console.log(`Missing drivers: ${report.missingDrivers.size}`);

// Access detailed events
report.droppedDriverEvents.forEach(event => {
  console.log(`Frame ${event.frameIndex}: ${event.driverCode} ${event.reason}`);
});
```

### Export Report as JSON

```typescript
const jsonReport = leaderboardDebugger.exportReport();
console.log(jsonReport); // Pretty-printed JSON
```

### Print Formatted Report

```typescript
leaderboardDebugger.printReport(); // Console.group formatted output
```

### Access Frame History

```typescript
const history = leaderboardDebugger.getFrameHistory();

// Iterate through frames
history.forEach((snapshot, frameIndex) => {
  console.log(`Frame ${frameIndex}: ${snapshot.driverCount} drivers`);
  snapshot.driverCodes.forEach(code => {
    console.log(`  ${code} at P${snapshot.positions.get(code)}`);
  });
});
```

### Clear History

```typescript
leaderboardDebugger.clear(); // Reset for next session
```

---

## Real-world Testing Scenarios

### Test 1: Early Race Stability (Frames 0-50)

**What to verify:**
- All drivers present in every frame
- No flickering between positions
- Smooth grid → FIA timing transition

**Expected result:**
```
Frames 0-50:
✅ Consistency Score: 100.0/100
✅ Missing Drivers: 0
✅ Disappearance Events: 0
```

### Test 2: Pit Stop Handling (Frames 100-200)

**What to verify:**
- Drivers in pits don't disappear
- No "ghost" position changes
- Drivers return to correct position after pit

**Expected result:**
```
During pit stops:
✅ Driver present before pit entry
✅ Driver present while in pit (P0 temporarily)
✅ Driver reappears at correct position after exit
```

### Test 3: Safety Car Period (Frames 300-400)

**What to verify:**
- All drivers maintain visibility during bunching
- No position flickering during bunching
- Clean restart with accurate positions

**Expected result:**
```
During safety car:
✅ All drivers present
✅ Positions stable despite bunching
✅ Clean position updates on restart
```

### Test 4: Retirement Handling

**What to verify:**
- Retired driver disappears from active leaderboard
- Doesn't reappear in active section
- Moves to "Retired" section cleanly

**Expected result:**
```
At retirement frame:
✅ Driver moves from active to retired
✅ Never appears in active positions again
✅ Clean transition (no flickering)
```

---

## Advanced: Programmatic Analysis

### Check for Specific Driver

```typescript
const report = leaderboardDebugger.generateReport();

const hamDisappearances = report.droppedDriverEvents.filter(
  e => e.driverCode === 'HAM'
);

if (hamDisappearances.length > 0) {
  console.warn(`HAM had ${hamDisappearances.length} disappearance events`);
  hamDisappearances.forEach(e => {
    console.log(`  Frame ${e.frameIndex}: ${e.reason}`);
  });
}
```

### Find Gaps Longer Than N Frames

```typescript
const longGaps = report.frameGaps.filter(gap => gap.durationFrames > 5);

if (longGaps.length > 0) {
  console.error(`Found ${longGaps.length} gaps longer than 5 frames:`);
  longGaps.forEach(gap => {
    console.error(
      `  ${gap.driverCode}: Frames ${gap.frameStart}-${gap.frameEnd} (${gap.durationFrames} frames)`
    );
  });
}
```

### Generate CSV Report

```typescript
const report = leaderboardDebugger.generateReport();

let csv = "Frame,Time,Driver,Position,Reason\n";
report.droppedDriverEvents.forEach(event => {
  csv += `${event.frameIndex},${event.time.toFixed(2)},${event.driverCode},${event.position},${event.reason}\n`;
});

console.log(csv);
// Copy to clipboard for Excel analysis
```

---

## Troubleshooting

### "No debug output in console"

**Solution:**
1. Make sure you're watching the **Console** tab (not Network, Elements, etc.)
2. Open console BEFORE starting playback
3. Load a race session
4. Wait for frames to advance to 150

### "Report shows high disappearance count"

**What it means:**
- Leaderboard logic has a bug (likely PositionSmoothing)
- Drivers are randomly dropping/reappearing

**Action items:**
1. Check if commit f4104e2 is applied (driver code tracking)
2. Check if commit d8fe142 is applied (retirement tracking)
3. Run the debugging suite to identify which frames have issues
4. File a bug report with the frame numbers

### "Consistency score is 0"

**Critical issue:**
- Major problem in leaderboard calculation
- Almost all drivers are disappearing/reappearing

**Steps to debug:**
```typescript
const report = leaderboardDebugger.generateReport();

// Find first disappearance
const firstEvent = report.droppedDriverEvents[0];
console.log(`First issue at frame ${firstEvent.frameIndex}:`, firstEvent);

// Get frame history near first issue
const history = leaderboardDebugger.getFrameHistory();
const prevFrame = history.get(firstEvent.frameIndex - 1);
const currFrame = history.get(firstEvent.frameIndex);

console.log("Previous frame drivers:", prevFrame?.driverCodes);
console.log("Current frame drivers:", currFrame?.driverCodes);
```

---

## Files Modified for Debugging

- **New**: `frontend/src/utils/leaderboardDebug.ts` - Debug utility class
- **Modified**: `frontend/src/components/Leaderboard.tsx` - Added logging hook

### Disable Debug Logging

To disable debug output (e.g., in production):

```typescript
// In Leaderboard.tsx, comment out:
// React.useEffect(() => {
//   if (!currentFrame || !currentFrame.drivers) return;
//   ...
// }, [currentFrame]);
```

---

## Integration with Backend Logging

The frontend debug utility complements backend logging:

- **Backend** (`debug_telemetry.log`): Logs sorting decisions, frame generation
- **Frontend** (Browser Console): Logs rendering, driver presence, position changes

Together they provide end-to-end visibility:

```
Backend Frame 42:        Frontend Frame 42:
├─ sorted_codes: [...]   ├─ Received drivers: HAM, VER, ...
├─ active_codes: [...]   ├─ Logged to debugger
└─ retired_codes: [...]  └─ (shows consistency check)
```

---

## References

- [DEBUG-ANALYSIS-LEADERBOARD-DISAPPEARING-DRIVERS.md](./DEBUG-ANALYSIS-LEADERBOARD-DISAPPEARING-DRIVERS.md)
- [LEADERBOARD-SUMMARY.md](./plans/LEADERBOARD-SUMMARY.md)
- Commit f4104e2: Position index fix
- Commit d8fe142: Retirement tracking fix

---

## Support

If you encounter issues or get unexpected results:

1. **Save the report**: Copy the JSON output
2. **Save console logs**: Right-click console → Save as
3. **Create an issue** with:
   - The debug report JSON
   - Console logs from frames with issues
   - Session details (race, year, round)

