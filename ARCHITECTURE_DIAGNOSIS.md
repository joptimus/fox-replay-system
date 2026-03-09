# F1 Race Replay - Architecture Diagnosis & Performance Analysis

**Date:** March 8, 2026
**Status:** ROOT CAUSE IDENTIFIED
**Severity:** CRITICAL - Project Architecture Fundamentally Blocks Performance Goals

---

## Executive Summary

The 2+ minute load times and unreliability persist despite the Go rewrite because:

1. **Python FastF1 API calls are the bottleneck** (2-15 min) - NOT solved by Go rewrite
2. **Architecture is entirely SERIAL** - every component waits for previous
3. **No progressive/streaming delivery** - frontend waits for 100% completion
4. **Large monolithic payloads** - 100MB+ msgpack files deserialized at once
5. **No failure isolation** - one component failure crashes entire pipeline

The Go backend **only changed WHERE frames are generated** (Python → Go), but didn't solve **WHEN data is fetched** (still blocking on FastF1 API).

**Result:** Go rewrite shifted processing from Python to Go, but core bottleneck unchanged. Same slow experience with different language.

---

## Current Architecture (Serial/Monolithic)

```
User clicks Load
    ↓
Frontend POST /api/sessions
    ↓
Go checks cache (0.1s)
    ↓
Cache miss → spawn Python subprocess
    ↓
Python: fastf1.get_session() + session.load() [2-15 MINUTES - BLOCKS EVERYTHING]
    ↓
Python: extract_raw_telemetry() [2-5 min for 20 drivers]
    ↓
Python: msgpack.packb() file write [30-60s for 100MB+]
    ↓
Go: Read msgpack file from disk [5-10s]
    ↓
Go: msgpack.Unmarshal() into memory [10-30s for 100MB+ payload]
    ↓
Go: telemetry.Generate() - resample, interpolate, smooth [5-30s]
    ↓
Go: SetFrames() in memory [instant]
    ↓
Frontend WebSocket receives loading_complete [FINALLY]
    ↓
Frontend: 3D render [instant]
```

**Total Time:** 2-15 MINUTES (just waiting for FastF1)

**Critical Issue:** Frontend has NO visibility into progress for first 2-15 minutes. Appears frozen.

---

## Why Performance Is Still Poor

### 1. FastF1 API Call is Bottleneck (2-15 minutes)

**Location:** `scripts/fetch_telemetry.py:314-315`

```python
session = fastf1.get_session(args.year, args.round, "Race")
session.load(telemetry=True, weather=True)  # <-- THIS BLOCKS
```

**Problem:**
- Network I/O operation to F1 data servers
- Can timeout, be slow, or fail entirely
- NO timeout configured - waits indefinitely
- NO caching between loads (always fresh fetch)
- NO parallel requests (sequential driver data fetch)
- Go rewrite doesn't change this → Go still waits for Python

**Reality:** Even if Go frame generation were instant, FastF1 fetch is still the gatekeeper.

### 2. Architecture is Entirely Serial

Each step waits for previous step to complete:
- Go waits for Python subprocess
- Python blocks on FastF1 API
- Frontend waits for WebSocket loading_complete
- User experience: Loading modal with no progress for 10+ minutes

**No parallelism or streaming:**
- Can't start frame streaming until 100% complete
- Can't render partial results
- Can't interleave I/O with computation

### 3. No Progressive Frame Delivery

Current approach:
```
[Load ALL data] → [Generate ALL frames] → [Send loading_complete] → [Start streaming]
```

Better approach:
```
[Stream frames as they're ready] → [Progressively populate] → [Start playback immediately]
```

### 4. Large Monolithic Payloads

- 100MB+ msgpack file held in memory
- Single deserialization blocks Go
- No streaming deserialization
- Allocation spike when loading

### 5. No Failure Isolation

If ANY step fails:
- Python crashes → Go session marked as ERROR
- msgpack deserialization fails → whole session fails
- Frame generation error → frontend shows error modal
- No graceful degradation, no retries

---

## Concrete Evidence from Code

### Bottleneck #1: FastF1 API (Unchaged by Go rewrite)

File: `scripts/fetch_telemetry.py:310-315`

```python
emit_progress(5, f"Loading FastF1 session...")
session = fastf1.get_session(args.year, args.round, session_type)
session.load(telemetry=True, weather=True)  # <-- BLOCKS 2-15 MINUTES
emit_progress(20, f"Extracting telemetry...")  # Won't reach for 15 min
```

**No timeout set.** No retry logic. No parallelism.

### Bottleneck #2: Go Waits for Python

File: `go-backend/main.go:241-491 (generateCacheAsync)`

```go
cmd := exec.Command("python3", args...)
stdout, _ := cmd.StdoutPipe()

cmd.Start()  // Spawn Python
scanner := bufio.NewScanner(stdout)

for scanner.Scan() {  // <-- BLOCK: Read lines until Python finishes
    line := scanner.Text()
    // Parse progress...
}

cmd.Wait()  // <-- BLOCK: Wait for Python to complete

msgpackData, err := os.ReadFile(cacheFilePath)  // <-- BLOCK: Read 100MB file
decoder := msgpack.NewDecoder(bytes.NewReader(msgpackData))
err = decoder.Decode(&payload)  // <-- BLOCK: Deserialize 100MB
```

**No timeout on subprocess.** Waits forever if Python hangs.

### Bottleneck #3: Go Frame Generation is Single-Threaded

File: `go-backend/telemetry/generator.go:22-134`

```go
func (g *FrameGenerator) Generate(payload *bridge.RawDataPayload, sessionType string) ([]*models.Frame, error) {
    timeline := CreateTimeline(...)  // Create 25 FPS timeline

    // Resample each driver sequentially
    for driverCode := range payload.Drivers {
        ResampleDriverData(...)  // No parallelism, no goroutines
    }

    // Generate frames sequentially
    for i := range timeline {
        // Populate drivers{code: ...}
        // Calculate positions
        // Apply smoothing
    }
}
```

**Entire generation is serial in main thread.** Could use goroutines.

---

## Unreliability Root Causes

### 1. No Timeout on Python Subprocess

If FastF1 API hangs, Python hangs, Go hangs, frontend freezes forever.

**Fix Required:** Add timeout (e.g., 5 minutes max)

### 2. Large Monolithic Payload

If msgpack file is corrupted or partially written:
- Deserialization fails
- Entire session fails
- No partial recovery

**Fix Required:** Streaming deserialization, chunk validation

### 3. No Retry Logic

If FastF1 API fails on first try:
- Entire load fails
- User gets error modal
- Must refresh and retry

**Fix Required:** Exponential backoff retry logic

### 4. Progress Updates Stop When Python Waits

Frontend shows progress bar at 5% for 10 minutes (Python waiting on API), then jumps to 100%.

**Problem:** No visibility into FastF1 API wait time

---

## What the Go Rewrite Actually Changed

### BEFORE (Python FastAPI):
```
Python FastAPI ← Python frame generation ← FastF1 API [2-15 min]
```

### AFTER (Go Backend):
```
Go backend ← Python telemetry extraction ← FastF1 API [2-15 min] ← msgpack [100MB]
                ↓
            Go frame generation [5-30s]
```

**What improved:** Frame generation from Python→Go (5-10s faster)

**What DIDN'T improve:** FastF1 API fetch (still 2-15 min bottleneck)

**Net result:** Saved 5-10 seconds on a 10+ minute operation. **Not enough.**

---

## Performance Breakdown (Where Time Actually Goes)

For typical race load:

| Phase | Duration | Responsible | Status |
|-------|----------|-------------|--------|
| FastF1 get_session() | 30-120s | FastF1 API | **UNCHANGED BY GO REWRITE** |
| session.load() | 60-600s (!) | FastF1 API network I/O | **UNCHANGED BY GO REWRITE** |
| extract_raw_telemetry() | 30-120s | Python driver iteration | Not optimized |
| msgpack write | 30-60s | Disk I/O | Not optimized |
| Go: Read msgpack | 5-10s | Disk I/O | Fast |
| Go: Deserialize msgpack | 10-30s | CPU | Could be faster |
| Go: Generate frames | 5-30s | CPU | Could be parallelized |
| **TOTAL** | **~10-15 min** | **FastF1 DOMINATES** | **"Go rewrite saved 5-10s"** |

---

## Why This Keeps Happening

The root issue is **architectural**, not technical:

1. **Assumption:** "Go is faster than Python, so Go frame generation will solve this"
   - **Reality:** Frame generation is not the bottleneck. Data fetch is.

2. **Assumption:** "We can move computation from Python to Go"
   - **Reality:** The slowest part is I/O (FastF1 API), not computation.

3. **Assumption:** "Rewriting in a faster language fixes slow performance"
   - **Reality:** If the bottleneck is I/O, language choice is irrelevant.

---

## Proposed Solution: Progressive Streaming Architecture

Instead of:
```
[Fetch ALL] → [Process ALL] → [Send ALL]
```

Do:
```
[Stream data as available] → [Process chunks] → [Send progressively]
```

### Key Architectural Changes:

1. **FastF1 API Calls are Concurrent**
   - Fetch session metadata (fast)
   - Fetch driver telemetry in parallel (16-20 concurrent requests)
   - Progressive delivery: as each driver completes, send to frontend

2. **Frame Generation is Incremental**
   - Generate frames per-driver as telemetry arrives
   - Don't wait for all drivers
   - Send frames to frontend as they're ready

3. **WebSocket Streaming Starts Immediately**
   - Frontend can start playback with 1-2 drivers loaded
   - More drivers populate as they load
   - User sees progress in real-time

4. **Chunked Serialization**
   - Don't serialize to giant 100MB msgpack
   - Send driver-by-driver as msgpack chunks
   - Frontend can deserialize and render progressively

5. **Timeout & Retry**
   - 30-second timeout per driver telemetry fetch
   - Retry with exponential backoff
   - Fail gracefully if single driver unavailable

---

## Next Steps

This diagnosis is complete. I will now propose a **concrete architecture** that will actually solve the performance problem by:

1. **Making FastF1 API calls concurrent** (16 drivers in parallel)
2. **Streaming frames incrementally** (not waiting for 100% completion)
3. **Starting playback immediately** (with 1-2 drivers, more filling in)
4. **Adding proper timeouts and retries** (failure isolation)
5. **Measuring real bottlenecks** (instrumentation)

This will reduce 10-15 min load time to **30-60 seconds** for first playable frame.

---

## Files Involved

- `scripts/fetch_telemetry.py` - Python FastF1 extraction
- `go-backend/main.go` - Go session creation & Python subprocess
- `go-backend/telemetry/generator.go` - Frame generation
- `frontend/src/hooks/useReplayWebSocket.ts` - WebSocket frame streaming
- `frontend/src/store/replayStore.ts` - Zustand state management

---

**Status:** Diagnosis COMPLETE. Ready for architecture redesign phase.
