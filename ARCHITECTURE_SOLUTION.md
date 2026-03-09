# F1 Race Replay - New Architecture for Speed & Reliability

**Status:** PROPOSED SOLUTION
**Target Performance:** 30-60 seconds to first playable frame (vs. current 10-15 minutes)
**Reliability:** Graceful handling of partial data, API failures, timeouts

---

## Core Principle: Progressive Streaming Instead of Batch Processing

### Current (Problematic):
```
FastF1 API → Python all-drivers → Msgpack → Go all-frames → WebSocket ALL → Frontend
[2-15 min blocked] [2-5 min] [0.5-1 min] [0.5-1 min] [Final jump]
```

### Proposed (Fast & Reliable):
```
FastF1 API          (parallel for 20 drivers)
├─ Driver 1 telemetry → Go frames → WebSocket stream
├─ Driver 2 telemetry → Go frames → WebSocket stream  (concurrent)
├─ Driver 3 telemetry → Go frames → WebSocket stream
└─ ...Driver 20 telemetry → Go frames → WebSocket stream
[30-120s max] [as each arrives] [real-time]

Frontend: Start playback with Driver 1 + 2, more populate as they arrive
```

---

## Architecture Layer 1: New "FastF1 Service" (Python)

**File:** `services/fastf1_service.py` (NEW)

**Purpose:** Parallel driver telemetry fetching with timeout/retry

**Design:**

```python
class FastF1Service:
    def __init__(self, timeout=30, max_retries=2):
        self.timeout = timeout
        self.max_retries = max_retries
        self.session = None

    def load_session_metadata(self, year, round, session_type):
        """
        Load session object (basic info, no telemetry).
        Fast: < 5 seconds
        """
        session = fastf1.get_session(year, round, session_type)
        # Load drivers, results, track info (NOT telemetry yet)
        session.load(weather=True)  # Get weather, not telemetry
        return session

    async def load_driver_telemetry_concurrent(self, session, timeout=30):
        """
        Fetch telemetry for ALL drivers in parallel.

        Yields: (driver_code, telemetry_dict, error)
        as each driver completes.

        Times out individual drivers after 30s, continues with others.
        """
        drivers = session.drivers
        results = asyncio.gather(
            *[
                self._fetch_driver_telemetry_with_retry(session, code)
                for code in drivers
            ],
            return_exceptions=True
        )

        for driver_code, result in zip(drivers, results):
            if isinstance(result, Exception):
                yield (driver_code, None, str(result))
            else:
                yield (driver_code, result, None)

    async def _fetch_driver_telemetry_with_retry(self, session, driver_code, retry=0):
        """
        Fetch single driver's telemetry with timeout.
        Retry on failure (up to max_retries).
        """
        try:
            # Get driver laps
            driver_laps = session.laps[session.laps["Driver"] == driver_code]
            if driver_laps.empty:
                return None

            # Get telemetry with timeout
            async with asyncio.timeout(self.timeout):
                telemetry = await asyncio.to_thread(
                    lambda: driver_laps.get_telemetry()
                )
                return telemetry

        except asyncio.TimeoutError:
            if retry < self.max_retries:
                await asyncio.sleep(2 ** retry)  # Backoff
                return await self._fetch_driver_telemetry_with_retry(
                    session, driver_code, retry + 1
                )
            return None
        except Exception as e:
            if retry < self.max_retries:
                await asyncio.sleep(2 ** retry)
                return await self._fetch_driver_telemetry_with_retry(
                    session, driver_code, retry + 1
                )
            raise
```

**Key improvements:**
- Parallel fetching (asyncio): 16-20 drivers simultaneously
- Per-driver timeout: 30 seconds max
- Retry with backoff: Handles transient failures
- Streaming yields: Caller gets results as they arrive
- Graceful degradation: Missing 1 driver doesn't fail whole session

---

## Architecture Layer 2: New "Frame Streamer" Service (Go)

**File:** `go-backend/services/frame_streamer.go` (NEW)

**Purpose:** Receive driver telemetry as it arrives, generate frames, send to frontend

**Design:**

```go
type FrameStreamer struct {
    driverChan chan *DriverTelemetry  // Receive telemetry as it arrives
    frameChan chan *models.Frame       // Send frames to WebSocket
    session *models.Session
    sessionID string
}

func (fs *FrameStreamer) Start(ctx context.Context) {
    // Timeline from metadata (known before first telemetry arrives)
    timeline := fs.session.Timeline

    // As each driver's telemetry arrives, generate its frames
    for {
        select {
        case driverTelemetry := <-fs.driverChan:
            if driverTelemetry == nil {
                return  // All drivers complete
            }

            // Generate frames for this ONE driver (fast, ~100ms)
            frames := fs.generateFramesForDriver(driverTelemetry, timeline)

            // Update frames in session (thread-safe)
            fs.session.UpdateDriver(frames)

            // Stream frames to WebSocket (don't wait for all drivers)
            for _, frame := range frames {
                fs.frameChan <- frame
            }

        case <-ctx.Done():
            return
        }
    }
}

func (fs *FrameStreamer) generateFramesForDriver(
    telemetry *DriverTelemetry,
    timeline []float64,
) []*models.Frame {
    // Resample this driver's telemetry to timeline
    // Return frames with position updated
    // Much faster than generating all drivers at once
}
```

**Key improvements:**
- Concurrent frame generation (one goroutine per driver as telemetry arrives)
- Non-blocking: Frames sent to WebSocket immediately
- Incremental updates: Session state updated as drivers complete
- Memory efficient: One driver at a time, not all 100MB at once

---

## Architecture Layer 3: Modified Go Session Creation

**File:** `go-backend/main.go` (MODIFIED)

**Change:** Instead of `generateCacheAsync()` blocking on Python subprocess, spawn parallel fetching:

```go
func handleCreateSessionRoute(...) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // ... cache check ...

        sess.SetState(models.StateLoading)

        // NEW: Start parallel fetching
        go generateSessionProgressively(
            sessionID, req.Year, req.RoundNum, req.SessionType,
            sess, logger,
        )

        // Return immediately with session_id
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(models.SessionResponse{
            SessionID: sessionID,
            Status:    models.StateLoading,
        })
    }
}

func generateSessionProgressively(
    sessionID string,
    year, round int,
    sessionType string,
    sess *models.Session,
    logger *zap.Logger,
) {
    // 1. Load session metadata from Python (fast, < 5s)
    metadata := callPythonService("load_session_metadata", year, round, sessionType)
    sess.SetMetadata(metadata)

    // 2. Create frame streamer
    frameStreamer := NewFrameStreamer(sess)
    go frameStreamer.Start(context.Background())

    // 3. Call Python FastF1 service with streaming
    //    Python sends driver telemetry as it's fetched (parallel)
    streamingAPI := NewStreamingPythonAPI()
    for driverCode, telemetry, err := range streamingAPI.LoadDriversConcurrent(...) {
        if err != nil {
            logger.Error("failed to fetch driver", zap.String("driver", driverCode))
            continue  // Skip this driver, continue with others
        }

        // Send telemetry to frame streamer
        frameStreamer.driverChan <- telemetry

        // Update progress
        sess.ProgressCh <- ProgressMessage{
            Pct: percentage,
            Msg: fmt.Sprintf("Loaded %s", driverCode),
        }
    }

    // 4. All drivers complete
    close(frameStreamer.driverChan)

    // 5. Set final state
    sess.SetState(models.StateReady)
    sess.ProgressCh <- ProgressMessage{Pct: 100, Msg: "Complete"}
}
```

**Key improvements:**
- Non-blocking: Session API returns immediately
- Progressive: Each driver's frames sent as soon as ready
- Fault-tolerant: One driver's failure doesn't affect others
- Visible progress: Frontend gets actual % progress, not stuck at 5%

---

## Architecture Layer 4: Frontend Progressive Loading

**File:** `frontend/src/hooks/useReplayWebSocket.ts` (MODIFIED)

**Change:** Handle progressive frame delivery

```typescript
export function useReplayWebSocket(sessionId: string) {
    useEffect(() => {
        const ws = new WebSocket(`ws://localhost:8000/ws/replay/${sessionId}`);

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === "session_init") {
                // Metadata available, can start UI
                setSessionReady(true);
                setTotalFrames(data.total_frames);
            }

            if (data.type === "driver_ready") {
                // One driver's frames are ready
                setDriverReady(data.driver_code);  // Update store
                // Leaderboard can now show this driver
            }

            if (data.type === "frame") {
                // NEW: Individual frame, not giant batch
                updateCurrentFrame(data.frame);
                // Can start playback immediately with 1 driver
            }

            if (data.type === "loading_complete") {
                // All drivers loaded
                setIsLoadingComplete(true);
            }
        };
    }, [sessionId]);

    return { /* ... */ };
}
```

**Frontend behavior:**
```
T+0s:   User clicks "Load Race"
T+2s:   Session metadata loads → UI shows "Loading: 5%"
T+3s:   Driver 1 telemetry → Frames generated → WebSocket sends → Frontend renders → USER SEES CAR #1
T+8s:   Driver 2-5 load → More cars visible in 3D and leaderboard
T+30s:  Drivers 6-10 load → Half the grid visible
T+45s:  All 20 drivers loaded → Full grid → User can play from start

vs. current:
T+0s:   User clicks "Load Race"
T+10s:  Still loading... (API waiting)
T+15s:  Still loading...
T+20s:  Finally loaded, frontend renders (user sees all 20 cars at once)
```

---

## Architecture Layer 5: Data Flow Diagram

### Current (Sequential):
```
Frontend
  ↓ POST /api/sessions
Go Backend
  ↓ Check cache (miss)
  ↓ Spawn Python
Python Subprocess
  ↓ fastf1.get_session() [BLOCKED 2-15 min on FastF1 API]
  ↓ extract all drivers sequentially
  ↓ msgpack.packb() large file
  ↓ Write to disk
  ↓ Exit subprocess
Go Backend (continued)
  ↓ Read 100MB msgpack file
  ↓ msgpack.Unmarshal() [10-30s]
  ↓ Generate all frames [5-30s]
  ↓ Send loading_complete
Frontend (finally)
  ↓ Open WebSocket
  ↓ Receive all frames
  ↓ Render
```

### New (Progressive/Parallel):
```
Frontend
  ↓ POST /api/sessions
Go Backend
  ↓ Check cache (miss)
  ↓ Spawn Python service
  ↓ Return session_id immediately
  ↓ (spawn async task)

Async Task (parallel):
Python Service (concurrent)
  ├─ Driver 1: fastf1 API → telemetry [2-3s] → Go
  ├─ Driver 2: fastf1 API → telemetry [2-3s] → Go  (parallel)
  ├─ Driver 3: fastf1 API → telemetry [2-3s] → Go
  └─ ...all 20 drivers simultaneously
     (Timeout any driver taking > 30s)

Go Backend (as each driver arrives):
  ├─ Receive Driver 1 telemetry [T+2s]
  ├─ Generate Driver 1 frames [T+2.1s]
  ├─ Send to WebSocket [T+2.2s]
  ├─ Receive Driver 2 telemetry [T+2.5s]
  ├─ Generate Driver 2 frames [T+2.6s]
  ├─ Send to WebSocket [T+2.7s]
  └─ ...repeat for all drivers
     Total: ~30-60s to have all 20 drivers

Frontend (opens WebSocket immediately):
  ├─ Receives Driver 1 frames [T+2s] → Renders car #1 → USER SEES ACTION
  ├─ Receives Driver 2 frames [T+2.5s] → Renders car #2
  ├─ ... more cars appear progressively
  └─ Receives all frames [T+60s] → Full grid visible
     User can START PLAYBACK AT T+2s with 1 car, not T+15min
```

---

## Implementation Roadmap

### Phase 1: FastF1 Service Refactor (Python)
- Create `services/fastf1_service.py` with async parallel fetching
- Add timeout/retry logic per driver
- Emit progress updates as each driver completes
- **Time:** 2-3 hours
- **Files:** New file + modify `scripts/fetch_telemetry.py`

### Phase 2: Frame Streamer Service (Go)
- Create `go-backend/services/frame_streamer.go` for incremental generation
- Modify `main.go` to use streaming instead of batch
- Update progress messages to show driver-by-driver progress
- **Time:** 2-3 hours
- **Files:** New files + modify `main.go`

### Phase 3: WebSocket Protocol Update (Go)
- Modify `go-backend/ws/handler.go` to send frames incrementally
- Add new message types: `driver_ready`, `frame`, `loading_complete`
- **Time:** 1 hour
- **Files:** Modify `ws/handler.go`

### Phase 4: Frontend Progressive Loading (React)
- Update `useReplayWebSocket.ts` to handle streaming frames
- Modify leaderboard to show drivers as they load
- Update loading modal to show driver-by-driver progress
- **Time:** 2-3 hours
- **Files:** Modify React hooks and components

### Phase 5: Testing & Optimization
- Load test with real FastF1 data
- Measure actual improvements
- Fine-tune timeouts and retry logic
- **Time:** 2-3 hours

**Total Effort:** ~10-12 hours
**Expected Outcome:** 10-15 min → 30-60 sec to first playable frame

---

## Performance Guarantees

### Before:
- User waits 10-15 minutes before seeing anything
- If FastF1 API slow, they wait entire 15 minutes
- Single driver failure = entire session fails
- No visibility into what's happening

### After:
- User sees first car in 2-3 seconds
- Full grid in 30-60 seconds
- Single driver failure = that driver skipped, session continues
- Real-time progress: "Loaded: Driver 1, 2, 3..."

### For 2026 Season (when FastF1 data available):
- All current improvements apply immediately
- No code changes needed
- Just slower FastF1 API is replaced with faster data source

---

## Risk Analysis

### Risk: "What if Frontend receives frames for drivers not yet in session.metadata?"
- **Mitigation:** Frontend validates driver against metadata before rendering
- **Impact:** Low - frame includes driver code, frontend checks membership

### Risk: "What if Python crashes partway through?"
- **Current:** Entire session fails
- **New:** Partial drivers load, user can playback with 10 cars instead of 20
- **Mitigation:** Graceful degradation

### Risk: "What if Go runs out of memory holding partial frames?"
- **Current:** Single 100MB deserialization can spike memory
- **New:** Streaming incremental updates, memory stays bounded
- **Mitigation:** Memory efficient, bounded by single driver at a time

### Risk: "Won't this complicate the code?"
- **Reality:** Yes, adds complexity. But complexity is WORTHWHILE given 10-15x speed improvement
- **Mitigation:** Well-documented services, clear separation of concerns

---

## Alternative Considered: Caching Layer

**Option:** Pre-compute and cache all races

**Problem:**
- 2024 + 2025 = 48 races × 20 drivers × 5-100MB per race = TERABYTES
- Can't cache all history
- New races not available until day after race

**Conclusion:** Doesn't solve the core problem (user waiting for first load).

---

## Alternative Considered: API Gateway

**Option:** Use F1-TV API instead of FastF1

**Problem:**
- F1-TV not public API, unclear licensing
- No official Python library
- Different data format, would require major rewrite

**Conclusion:** Out of scope, keep FastF1

---

## What Gets Cached After This?

After implementing progressive streaming:

1. **First-time load:** 30-60 seconds (Python makes FastF1 calls)
2. **Subsequent loads:** < 1 second (frames in `.f1cache`)
3. **2026 data arrives:** Speeds up automatically (faster FastF1 source)

No code changes needed for caching improvements.

---

## Success Metrics

- [ ] First playable frame: < 3 seconds
- [ ] Full grid loaded: < 60 seconds
- [ ] All races cache hit: < 1 second
- [ ] Reliability: Handle 90% of races successfully (1-2 driver failures acceptable)
- [ ] User satisfaction: Loading modal shows actual progress

---

## Files to Modify/Create

### New Files:
- `services/fastf1_service.py` - Parallel FastF1 fetching
- `go-backend/services/frame_streamer.go` - Progressive frame generation
- `go-backend/services/streaming_api.go` - Python communication

### Modified Files:
- `go-backend/main.go` - Use streaming instead of batch
- `go-backend/ws/handler.go` - Send frames progressively
- `frontend/src/hooks/useReplayWebSocket.ts` - Handle streaming
- `frontend/src/components/LoadingModal.tsx` - Show driver progress
- `frontend/src/store/replayStore.ts` - Track loaded drivers

### Unchanged:
- Cache layer (can reuse existing msgpack or .f1cache)
- 3D visualization (no changes needed)
- Playback controls (no changes needed)

---

## Conclusion

The current problem: **Frontend waits 10-15 minutes for the slowest step (FastF1 API), which architecture doesn't parallelize.**

The solution: **Make FastF1 API calls parallel (16-20 concurrent), stream frames as they arrive, let user start playback in 2-3 seconds instead of 15 minutes.**

This is a **well-defined, achievable architecture** that will deliver the speed improvements promised by the Go rewrite.

Ready to implement when you approve.
