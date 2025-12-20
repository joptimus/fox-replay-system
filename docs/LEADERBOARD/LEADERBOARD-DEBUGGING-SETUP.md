# Leaderboard Debugging Setup - Quick Reference

**Automated Frame-by-Frame Tracking for First 150 Frames**

---

## 🚀 What Was Added

### New Debug Utility
**File**: `frontend/src/utils/leaderboardDebug.ts`

A comprehensive debugging class that:
- ✅ Logs every frame for the first 150 frames (6 seconds @ 25 FPS)
- ✅ Detects driver disappearances/reappearances in real-time
- ✅ Tracks position changes and count inconsistencies
- ✅ Generates detailed reports with JSON export
- ✅ Calculates consistency scores (0-100)

### Integration in Leaderboard
**File**: `frontend/src/components/Leaderboard.tsx`

Added automatic logging that:
- Logs frame data on every frame update
- Generates comprehensive report at frame 150
- Exports as JSON for analysis
- Shows warnings for anomalies in console

---

## 📊 How to Use

### Step 1: Start a Race Replay
```bash
node dev.js
```

### Step 2: Open Browser DevTools
```
F12 → Console tab
```

### Step 3: Load a Race Session
- Select a year, round, and session type
- Press Play
- Watch frames advance

### Step 4: View Debug Output at Frame 150

The system automatically prints:
```
=== Frame 150 Reached - Printing Debug Report ===

🏎️ Leaderboard Debug Report
📊 Frames Analyzed: 150 / 150
✅ Consistency Score: 100.0/100
⚠️  Missing Drivers: 0

Disappearance Events: 0
Frame Gaps: 0

📋 Debug Logs:
(last 20 log entries shown)
```

---

## 🔍 Real-time Console Warnings

As frames advance, watch for warnings:

```
[Frame 0] Frame data received: 20 drivers
[Frame 23] 🔄 LARGE POSITION CHANGE: HAM P3 → P4 (Δ1)
[Frame 42] ⚠️  DRIVER DISAPPEARED: VER (was at P2)
[Frame 43] ℹ️  DRIVER REAPPEARED: VER (now at P3)
[Frame 150] ===== Debug Report Complete =====
```

---

## 📈 Interpreting Results

### Green Flag ✅
```
✅ Consistency Score: 100.0/100
⚠️  Missing Drivers: 0
Disappearance Events: 0
```
→ **Perfect!** Leaderboard is stable.

### Yellow Flag ⚠️
```
✅ Consistency Score: 95.0/100
⚠️  Missing Drivers: 1 (HAM)
Disappearance Events: 2
```
→ **Minor issue**: 1 driver had 1 disappearance/reappearance pair.

### Red Flag 🔴
```
✅ Consistency Score: 75.0/100
⚠️  Missing Drivers: 5+
Disappearance Events: 20+
```
→ **Critical**: Multiple drivers disappearing. Check for PositionSmoothing bug.

---

## 🛠️ Advanced Usage

### View Report Manually
```javascript
// In browser console
leaderboardDebugger.printReport();
```

### Export as JSON
```javascript
// In browser console
const report = leaderboardDebugger.exportReport();
console.log(report);
// Copy to file for analysis
```

### Analyze Specific Driver
```javascript
const report = JSON.parse(leaderboardDebugger.exportReport());
const hamIssues = report.droppedDriverEvents.filter(e => e.driverCode === 'HAM');
console.log(`HAM disappearances:`, hamIssues);
```

### Check Frame History
```javascript
const history = leaderboardDebugger.getFrameHistory();
history.forEach((snapshot, frame) => {
  console.log(`Frame ${frame}: ${snapshot.driverCount} drivers`);
});
```

---

## 📋 What Gets Logged

### Per-Frame Tracking
- Frame index and time
- Driver codes present
- Driver count
- Position assignments
- Anomalies detected

### Anomaly Detection
- **Disappearances**: Drivers present in frame N but missing in frame N+1
- **Reappearances**: Drivers missing then present again
- **Position Changes**: Large jumps (>2 positions in one frame)
- **Count Inconsistencies**: Unexpected changes in driver count

---

## 🔧 Customization

### Change Frame Limit (Default: 150)

Edit `frontend/src/utils/leaderboardDebug.ts`:
```typescript
private maxFramesToTrack: number = 150; // Change to desired frame count
```

### Enable Console Logging During Playback

Edit `frontend/src/utils/leaderboardDebug.ts`:
```typescript
constructor(enableConsoleLogging: boolean = false) {
  this.enableConsoleLogging = true; // Change to true
}
```

Or toggle in browser:
```javascript
leaderboardDebugger.enableConsoleLogging = true;
```

### Disable Debug Entirely

Comment out the effect in `frontend/src/components/Leaderboard.tsx`:
```typescript
// React.useEffect(() => {
//   if (!currentFrame || !currentFrame.drivers) return;
//   ...
// }, [currentFrame]);
```

---

## 📚 Documentation

- **Detailed Guide**: [LEADERBOARD-DEBUG-GUIDE.md](./LEADERBOARD-DEBUG-GUIDE.md)
- **Analysis Document**: [DEBUG-ANALYSIS-LEADERBOARD-DISAPPEARING-DRIVERS.md](./DEBUG-ANALYSIS-LEADERBOARD-DISAPPEARING-DRIVERS.md)
- **Bug Fix Details**: See commits f4104e2 and d8fe142

---

## ✅ Verification Checklist

Use this for each race you test:

- [ ] Started playback successfully
- [ ] No console errors during first 150 frames
- [ ] Consistency score at frame 150 is 100.0/100
- [ ] Missing drivers count is 0
- [ ] No disappearance events logged
- [ ] Frame gaps list is empty
- [ ] All drivers visible in leaderboard every frame

---

## 🐛 If You Find Issues

1. **Screenshot the report** at frame 150
2. **Copy the JSON** export for analysis
3. **Note the frame numbers** where drivers disappeared
4. **File a bug** with:
   - Debug report JSON
   - Console log screenshot
   - Race details (year, round, session)
   - Browser/OS info

---

## 📂 Files Added/Modified

```
frontend/src/
├── utils/
│   └── leaderboardDebug.ts          (NEW - Debug utility)
└── components/
    └── Leaderboard.tsx              (MODIFIED - Added logging)

docs/
├── LEADERBOARD-DEBUG-GUIDE.md           (NEW - Detailed guide)
├── LEADERBOARD-DEBUGGING-SETUP.md       (NEW - This file)
└── DEBUG-ANALYSIS-LEADERBOARD-DISAPPEARING-DRIVERS.md (Previously created)
```

---

## 🎯 Next Steps

1. **Run a test session** with the debug tools active
2. **Check the report** at frame 150
3. **If issues found**, use the detailed guide to investigate
4. **Report findings** with debug data

---

**Status**: Active debugging enabled ✅
**Location**: Browser console during playback
**Coverage**: First 150 frames (6 seconds)
**Output**: Automatic at frame 150 + real-time warnings
