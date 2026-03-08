# Go Backend Rewrite: Comprehensive Implementation Plan

**Date:** March 8, 2026
**Status:** Ready for Implementation
**Previous Docs:** [go-rewrite-plan.md](./go-rewrite-plan.md), [current-system.md](./current-system.md)
**Based on:** Full codebase analysis (backend, telemetry, websocket, frontend integration)

---

## Executive Summary

This plan outlines a **pragmatic rewrite** of the Python FastAPI backend in Go for performance improvement and learning.

The target is **10x improvement on cache-hit performance** (3–5s → 0.1–0.3s) by moving frame generation and serving to Go while keeping FastF1 data loading in Python.

**Key constraint:** FastF1 is Python-only; a hybrid architecture is necessary.

**Scope:** This is a personal/side project, so the focus is on **correctness and pragmatic design**, not enterprise-grade operational complexity.

The implementation has **5 phases**:
1. Go server setup + basic frame serving
2. Python bridge + frame generation algorithm
3. Cache format with compression
4. Algorithm porting and validation
5. Integration testing and cutover

---

## System Architecture

### Current (Python)
```
Frontend (React)
    ↓ WebSocket
FastAPI Backend (Python, :8000)
    ├─ REST API endpoints
    ├─ WebSocket frame streaming
    └─ Async/threading coordination
    ↓ Function calls
Shared Data Pipeline (shared/telemetry/f1_data.py)
    ├─ FastF1 session loading
    ├─ Multiprocessing driver extraction
    └─ Frame generation (154,000 iterations)
    ↓ Cache (pickle)
Cache Storage (computed_data/*.pkl)
```

### Target (Hybrid Go + Python)
```
Frontend (React)
    ↓ WebSocket (msgpack + JSON)
Go Server (listening on :8000)
    ├─ REST API endpoints (chi router)
    ├─ WebSocket frame streaming (goroutines)
    ├─ Frame generation algorithm (all in Go)
    └─ Cache reading (msgpack + LZ4)
    ↓ exec.Command (only on cache miss)
    ↓ JSON lines on stdout
Python Data Bridge (subprocess, not HTTP service)
    ├─ FastF1 session.load() via API
    ├─ multiprocessing.Pool driver extraction
    └─ Outputs raw telemetry as JSON lines
    ↓ Writes binary cache file
Cache Storage (computed_data/*.f1cache)
    └─ Read on next request (100-200ms vs 3-5s for pickle)
```

---

## Phase 1: Go Server Scaffolding + Cache Reader

**Goal:** Get a working Go HTTP/WebSocket server that can read and serve cached frames.

**Interim step:** Convert existing Python pickle cache files to msgpack format for testing. Phase 3 will replace this with the `.f1cache` format with LZ4 compression.

### Phase 1.1: Project Setup

**Files created:**
```
go-backend/
├── main.go                    # Entry point, chi router, flag parsing
├── go.mod                     # module f1-replay-go, Go 1.22+
├── go.sum                     # Dependencies lock
├── config/
│   └── config.go              # Port, log level, FastF1 bridge URL config
├── models/
│   ├── frame.go               # Frame, DriverData structs (msgpack tags)
│   ├── session.go             # SessionRequest, SessionResponse
│   └── errors.go              # Error response types
├── api/
│   ├── health.go              # GET /api/health → {status: "ok"}
│   ├── sessions.go            # POST /api/sessions, GET /api/sessions/{id}
│   └── cache.go               # DELETE /api/sessions/cache
├── ws/
│   └── replay.go              # WebSocket handler
├── session/
│   ├── manager.go             # Active sessions map + RWMutex
│   ├── state.go               # Session state machine (INIT/LOADING/READY/ERROR)
│   └── registry.go            # Session factory & lifecycle
├── cache/
│   ├── msgpack_reader.go      # Read pre-serialized msgpack frames
│   └── formats.go             # Frame binary schema definitions
├── middleware/
│   ├── cors.go                # CORS setup (same as Python)
│   └── logging.go             # Request/response logging
├── utils/
│   ├── logger.go              # Structured logging wrapper
│   └── errors.go              # Error handling utilities
└── tests/
    └── frame_reader_test.go   # Unit tests for cache reader
```

**Dependencies to add to go.mod:**
```go
require (
    github.com/go-chi/chi/v5 v5.0.10
    github.com/gorilla/websocket v1.5.0
    github.com/vmihailenco/msgpack/v5 v5.4.1
    github.com/stretchr/testify v1.8.4
    go.uber.org/zap v1.26.0
)
```

### Phase 1.2: Chi Router & Basic Endpoints

**main.go implementation (~80 lines):**
```go
package main

import (
    "flag"
    "fmt"
    "log"
    "net/http"

    "github.com/go-chi/chi/v5"
    "github.com/go-chi/chi/v5/middleware"
)

func main() {
    port := flag.Int("port", 8000, "HTTP server port")
    logLevel := flag.String("log", "info", "Log level")
    pythonBridgeURL := flag.String("python-bridge", "http://localhost:8001", "Python bridge URL")
    flag.Parse()

    r := chi.NewRouter()

    // Middleware
    r.Use(middleware.RequestID)
    r.Use(middleware.RealIP)
    r.Use(middleware.Logger)
    r.Use(middleware.Recoverer)
    r.Use(corsMiddleware())

    // Routes
    r.Get("/api/health", handleHealth)
    r.Post("/api/sessions", handleCreateSession)
    r.Get("/api/sessions/{session_id}", handleGetSession)
    r.Delete("/api/sessions/cache", handleDeleteCache)

    // WebSocket
    r.HandleFunc("/ws/replay/{session_id}", handleReplayWebSocket)

    // Start server
    addr := fmt.Sprintf(":%d", *port)
    log.Printf("Starting server on %s\n", addr)
    if err := http.ListenAndServe(addr, r); err != nil {
        log.Fatal(err)
    }
}
```

**Session models (models/session.go, ~60 lines):**
```go
type SessionState string

const (
    StateInit      SessionState = "INIT"
    StateLoading   SessionState = "LOADING"
    StateReady     SessionState = "READY"
    StateError     SessionState = "ERROR"
)

type SessionRequest struct {
    Year        int    `json:"year"`
    RoundNum    int    `json:"round_num"`
    SessionType string `json:"session_type"` // "R", "S", "Q", "SQ"
    Refresh     bool   `json:"refresh"`
}

type SessionResponse struct {
    SessionID       string                 `json:"session_id"`
    Status          SessionState           `json:"status"`
    LoadingProgress int                    `json:"progress"`
    LoadingError    string                 `json:"error,omitempty"`
    Metadata        map[string]interface{} `json:"metadata,omitempty"`
}
```

**Session manager (session/manager.go, ~100 lines):**
```go
type Manager struct {
    mu       sync.RWMutex
    sessions map[string]*Session
    maxSize  int
}

func NewManager(maxSessions int) *Manager {
    return &Manager{
        sessions: make(map[string]*Session),
        maxSize:  maxSessions,
    }
}

func (m *Manager) Create(sessionID string) (*Session, error) {
    m.mu.Lock()
    defer m.mu.Unlock()

    if len(m.sessions) >= m.maxSize {
        return nil, ErrTooManySessions
    }

    s := &Session{
        ID:    sessionID,
        State: StateInit,
    }
    m.sessions[sessionID] = s
    return s, nil
}

func (m *Manager) Get(sessionID string) (*Session, error) {
    m.mu.RLock()
    defer m.mu.RUnlock()

    s, ok := m.sessions[sessionID]
    if !ok {
        return nil, ErrSessionNotFound
    }
    return s, nil
}

func (m *Manager) Delete(sessionID string) {
    m.mu.Lock()
    defer m.mu.Unlock()
    delete(m.sessions, sessionID)
}
```

### Phase 1.3: Msgpack Cache Reader

**cache/msgpack_reader.go (~150 lines):**
```go
type MsgpackCacheReader struct {
    cachePath string
}

func NewMsgpackCacheReader(cachePath string) *MsgpackCacheReader {
    return &MsgpackCacheReader{cachePath: cachePath}
}

func (m *MsgpackCacheReader) ReadFrames(filename string) ([]Frame, error) {
    filePath := filepath.Join(m.cachePath, filename)

    file, err := os.Open(filePath)
    if err != nil {
        return nil, fmt.Errorf("failed to open cache file: %w", err)
    }
    defer file.Close()

    dec := msgpack.NewDecoder(file)
    var frames []Frame

    if err := dec.Decode(&frames); err != nil {
        return nil, fmt.Errorf("failed to decode msgpack: %w", err)
    }

    return frames, nil
}

func (m *MsgpackCacheReader) CacheExists(filename string) bool {
    filePath := filepath.Join(m.cachePath, filename)
    _, err := os.Stat(filePath)
    return err == nil
}

func (m *MsgpackCacheReader) DeleteCache(pattern string) error {
    matches, err := filepath.Glob(filepath.Join(m.cachePath, pattern))
    if err != nil {
        return err
    }

    for _, match := range matches {
        if err := os.Remove(match); err != nil {
            return err
        }
    }

    return nil
}
```

### Phase 1.4: WebSocket Handler (Stub)

**ws/replay.go (~200 lines, Phase 2 will expand):**
```go
type WebSocketHandler struct {
    cacheReader *cache.MsgpackCacheReader
    sessionMgr  *session.Manager
}

func (h *WebSocketHandler) Handle(w http.ResponseWriter, r *http.Request) {
    sessionID := chi.URLParam(r, "session_id")

    // Upgrade HTTP → WebSocket
    conn, err := websocket.Upgrade(w, r, nil, 1024, 1024)
    if err != nil {
        h.logger.Error("upgrade error", zap.Error(err))
        return
    }
    defer conn.Close()

    // Get session
    sess, err := h.sessionMgr.Get(sessionID)
    if err != nil {
        conn.WriteJSON(map[string]string{"type": "error", "message": "session not found"})
        return
    }

    // Phase 1: Wait for session to be ready (cache hit)
    if sess.State != session.StateReady {
        conn.WriteJSON(map[string]string{"type": "error", "message": "session not ready"})
        return
    }

    // Phase 2: Stream frames at 60 Hz (to be implemented)
    h.streamFrames60Hz(conn, sess)
}

func (h *WebSocketHandler) streamFrames60Hz(conn *websocket.Conn, sess *session.Session) {
    // TODO: Phase 2
}
```

### Phase 1.5: API Endpoints

**api/sessions.go (create, get, ~120 lines):**
```go
func HandleCreateSession(sessionMgr *session.Manager, cacheReader *cache.MsgpackCacheReader) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        var req SessionRequest
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
            http.Error(w, "invalid request", http.StatusBadRequest)
            return
        }

        sessionID := generateSessionID(req.Year, req.RoundNum, req.SessionType)

        // Check cache first
        cacheFilename := fmt.Sprintf("%d_r%d_%s_telemetry.msgpack", req.Year, req.RoundNum, req.SessionType)
        if cacheReader.CacheExists(cacheFilename) && !req.Refresh {
            sess, _ := sessionMgr.Create(sessionID)
            sess.SetFrames(cacheReader.ReadFrames(cacheFilename))
            sess.SetState(session.StateReady)

            json.NewEncoder(w).Encode(SessionResponse{
                SessionID: sessionID,
                Status:    session.StateReady,
            })
            return
        }

        // Phase 2: Trigger Python bridge
        sess, _ := sessionMgr.Create(sessionID)
        sess.SetState(session.StateLoading)

        json.NewEncoder(w).Encode(SessionResponse{
            SessionID: sessionID,
            Status:    session.StateLoading,
        })
    }
}
```

### Phase 1.6: Test & Validation

**goals:**
- ✅ Go server starts and listens on :8000
- ✅ `/api/health` returns `{status: "ok"}`
- ✅ Msgpack cache reader loads pre-serialized frames correctly
- ✅ Frame struct marshaling/unmarshaling works
- ✅ WebSocket connection accepts (but doesn't stream yet)

**test file (tests/cache_reader_test.go, ~80 lines):**
```go
func TestMsgpackCacheReader(t *testing.T) {
    reader := cache.NewMsgpackCacheReader("./computed_data")

    exists := reader.CacheExists("2025_r1_R_telemetry.msgpack")
    assert.True(t, exists, "Cache file should exist")

    frames, err := reader.ReadFrames("2025_r1_R_telemetry.msgpack")
    assert.NoError(t, err)
    assert.Greater(t, len(frames), 0, "Should have frames")

    // Validate frame structure
    frame := frames[0]
    assert.Greater(t, len(frame.Drivers), 0, "Frame should have drivers")
}
```

**Phase 1 Deliverables:**
- ✅ Go binary runs and serves HTTP on :8000
- ✅ Msgpack cache reading works (verified with existing .msgpack files)
- ✅ Session manager stores active sessions
- ✅ WebSocket connection upgrade works (stub handler)
- ✅ Error handling and logging in place
- ✅ CORS configured to match Python backend

---

## Phase 2: Python Bridge + Go Frame Generator

**Goal:** Implement subprocess management for Python bridge and complete frame generation algorithm in Go.

### Phase 2.1: Python Bridge Protocol

**File: scripts/fetch_telemetry.py (new, ~600 lines)**

This is a standalone Python script that:
1. Takes `year round session_type [--refresh]` arguments
2. Loads FastF1 session
3. Extracts telemetry via multiprocessing
4. Outputs JSON-lines to stdout
5. Does NOT generate frames (Go does that)

**Bridge output schema (newline-delimited JSON):**
```json
{"type":"progress","progress":{"pct":10,"msg":"Loading FastF1 session..."}}
{"type":"progress","progress":{"pct":30,"msg":"Extracting telemetry for 20 drivers..."}}
{"type":"progress","progress":{"pct":50,"msg":"Processing timing data..."}}
{"type":"data","data":{
  "global_t_min":1234.5,
  "global_t_max":8234.5,
  "drivers":{
    "NOR":{
      "t":[1234.5,1234.54,...],
      "x":[-1046.2,...],
      "y":[-1475.7,...],
      "dist":[0.0,...],
      "rel_dist":[0.0,...],
      "lap":[1,1,2,...],
      "tyre":[0,0,0,...],
      "speed":[0.0,...],
      "gear":[2,2,...],
      "drs":[0,0,...],
      "throttle":[18.0,...],
      "brake":[0.0,...],
      "rpm":[9504,...]
    }
  },
  "timing":{
    "gap_by_driver":{"NOR":[0.0,...]},
    "pos_by_driver":{"NOR":[1,1,...]},
    "interval_smooth_by_driver":{"NOR":[0.0,...]},
    "abs_timeline":[1234.5,...]
  },
  "track_statuses":[{"status":"1","start_time":1240.0,"end_time":7800.0}],
  "driver_colors":{"NOR":[255,128,0]},
  "driver_lap_positions":{"NOR":[1,2,1,...]},
  "driver_numbers":{"NOR":"4"},
  "driver_teams":{"NOR":"mclaren"},
  "weather_times":[1234.5,...],
  "weather_data":{
    "track_temp":[38.5,...],
    "air_temp":[28.0,...],
    "humidity":[45.0,...],
    "wind_speed":[3.2,...],
    "wind_direction":[180.0,...],
    "rainfall":[0.0,...]
  },
  "race_start_time_absolute":1238.5,
  "total_laps":57,
  "track_geometry_telemetry":{"x":[...],"y":[...]}
}}}
```

**Implementation strategy:**
- Extract pure data extraction from current `f1_data.py`
- Keep multiprocessing as-is (it works)
- Output raw arrays (no frame generation)
- Allow Python to output progress (Go will relay via WebSocket)

### Phase 2.2: Bridge Management (Go)

**bridge/python.go (~250 lines):**
```go
type PythonBridge struct {
    scriptPath string
    logger     *zap.Logger
}

type BridgeOutput struct {
    Type    string    `json:"type"` // "progress" or "data"
    Progress *ProgressMessage `json:"progress,omitempty"`
    Data    *RawDataPayload  `json:"data,omitempty"`
}

type ProgressMessage struct {
    Pct int    `json:"pct"`
    Msg string `json:"msg"`
}

type RawDataPayload struct {
    GlobalTMin           float64                       `json:"global_t_min"`
    GlobalTMax           float64                       `json:"global_t_max"`
    Drivers              map[string]RawDriverData     `json:"drivers"`
    Timing               TimingData                   `json:"timing"`
    TrackStatuses        []TrackStatus                `json:"track_statuses"`
    DriverColors         map[string][3]int            `json:"driver_colors"`
    DriverLapPositions   map[string][]int             `json:"driver_lap_positions"`
    DriverNumbers        map[string]string            `json:"driver_numbers"`
    DriverTeams          map[string]string            `json:"driver_teams"`
    WeatherTimes         []float64                    `json:"weather_times"`
    WeatherData          map[string][]float64         `json:"weather_data"`
    RaceStartTimeAbsolute float64                     `json:"race_start_time_absolute"`
    TotalLaps            int                          `json:"total_laps"`
    TrackGeometry        TrackGeometryData            `json:"track_geometry_telemetry"`
}

type RawDriverData struct {
    T        []float64 `json:"t"`
    X        []float64 `json:"x"`
    Y        []float64 `json:"y"`
    Dist     []float64 `json:"dist"`
    RelDist  []float64 `json:"rel_dist"`
    Lap      []int     `json:"lap"`
    Tyre     []int     `json:"tyre"`
    Speed    []float64 `json:"speed"`
    Gear     []int     `json:"gear"`
    DRS      []int     `json:"drs"`
    Throttle []float64 `json:"throttle"`
    Brake    []float64 `json:"brake"`
    RPM      []int     `json:"rpm"`
}

func (b *PythonBridge) Execute(ctx context.Context, year int, round int, sessionType string, refresh bool) (*RawDataPayload, <-chan *ProgressMessage, error) {
    progressCh := make(chan *ProgressMessage, 10)

    cmd := exec.CommandContext(ctx, "python3", b.scriptPath,
        strconv.Itoa(year),
        strconv.Itoa(round),
        sessionType,
    )
    if refresh {
        cmd.Args = append(cmd.Args, "--refresh")
    }

    stdout, err := cmd.StdoutPipe()
    if err != nil {
        return nil, nil, err
    }

    if err := cmd.Start(); err != nil {
        return nil, nil, err
    }

    // Read JSON lines from stdout synchronously
    var finalData *RawDataPayload
    scanner := bufio.NewScanner(stdout)

    for scanner.Scan() {
        line := scanner.Bytes()
        var output BridgeOutput
        if err := json.Unmarshal(line, &output); err != nil {
            b.logger.Error("failed to unmarshal bridge output", zap.Error(err))
            continue
        }

        if output.Type == "progress" {
            progressCh <- output.Progress
        } else if output.Type == "data" {
            finalData = output.Data
        }
    }
    close(progressCh)

    // Wait for process to finish
    if err := cmd.Wait(); err != nil {
        return nil, nil, fmt.Errorf("python bridge failed: %w", err)
    }

    return finalData, progressCh, nil
}
```

### Phase 2.3: Frame Generation in Go

**telemetry/frames.go (~400 lines)**

This is the core algorithm — porting `get_race_telemetry()` frame loop from Python to Go.

**Key functions:**
```go
// Main frame generator
func GenerateFrames(rawData *RawDataPayload, sessionType string) ([]Frame, error)

// Timeline creation and resampling
func CreateTimeline(globalTMin, globalTMax float64) []float64

func ResampleChannel(timeline, tOrig, valuesOrig []float64) []float64

// Race progress normalization
func ComputeRaceProgress(
    distData map[string][]float64,
    raceStartIdx int,
) map[string][]float64

// Main frame loop
func buildFrames(
    timeline []float64,
    globalTMin float64,
    resampledData map[string]ResampledDriver,
    timingData map[string][]interface{},
    raceProgress map[string][]float64,
    driverColors map[string][3]int,
) []Frame
```

**Frame generation loop (pseudocode):**
```go
frames := make([]Frame, len(timeline))

for i := 0; i < len(timeline); i++ {
    frame := Frame{
        FrameIndex: i,
        T:          timeline[i],
        Lap:        leaderLap,
        Drivers:    make(map[string]DriverData),
    }

    // Extract scalar values for each driver
    for code, driverData := range resampledData {
        frame.Drivers[code] = DriverData{
            X:           driverData.X[i],
            Y:           driverData.Y[i],
            Speed:       driverData.Speed[i],
            Lap:         driverData.Lap[i],
            Tyre:        driverData.Tyre[i],
            Gear:        driverData.Gear[i],
            DRS:         driverData.DRS[i],
            Throttle:    driverData.Throttle[i],
            Brake:       driverData.Brake[i],
            RPM:         driverData.RPM[i],
            Dist:        driverData.Dist[i],
            RelDist:     driverData.RelDist[i],
            RaceProgress: raceProgress[code][i],
            LapTime:     &driverData.LapTime[i],
            Sector1:     &driverData.Sector1[i],
            Sector2:     &driverData.Sector2[i],
            Sector3:     &driverData.Sector3[i],
            Status:      driverStatus[code][i],
        }
    }

    // Inject FIA timing data (pos_raw, gap, interval_smooth)
    for code, timing := range timingData {
        if driverData, ok := frame.Drivers[code]; ok {
            driverData.PosRaw = &timing[i].PosRaw
            driverData.Gap = &timing[i].Gap
            driverData.IntervalSmooth = &timing[i].IntervalSmooth
        }
    }

    // Sort by 4-tier hierarchy and apply hysteresis
    sortedCodes := sortByHybridKey(frame.Drivers)
    smoothedCodes := positionSmoother.Apply(sortedCodes, frame.Drivers, timeline[i], trackStatus[i])

    // Assign final positions
    for j, code := range smoothedCodes {
        frame.Drivers[code].Position = j + 1
    }

    // Calculate gap_to_previous, gap_to_leader
    calculateGaps(frame)

    frames[i] = frame

    // Emit progress every 500 frames
    if i % 500 == 0 {
        progress := int((float64(i) / float64(len(timeline))) * 100)
        progressCh <- &ProgressMessage{Pct: progress, Msg: fmt.Sprintf("Generating frame %d/%d", i, len(timeline))}
    }
}

return frames
```

### Phase 2.4: Interpolation Functions

**telemetry/interpolate.go (~150 lines):**
```go
// Linear interpolation (replaces np.interp)
func LinearInterp(timeline, xp, fp []float64) []float64 {
    if len(xp) == 0 || len(fp) == 0 || len(xp) != len(fp) {
        return []float64{} // Error case
    }

    out := make([]float64, len(timeline))
    j := 0

    for i, t := range timeline {
        // Advance j until xp[j+1] >= t
        for j < len(xp)-1 && xp[j+1] < t {
            j++
        }

        if j == 0 && t < xp[0] {
            // Before first point
            out[i] = fp[0]
        } else if j >= len(xp)-1 {
            // After last point
            out[i] = fp[len(fp)-1]
        } else {
            // Interpolate between j and j+1
            alpha := (t - xp[j]) / (xp[j+1] - xp[j])
            out[i] = fp[j] + alpha*(fp[j+1]-fp[j])
        }
    }

    return out
}

// Step interpolation (for gear, tyre, lap)
func StepInterp(timeline, xp []float64, fp []int) []int {
    out := make([]int, len(timeline))
    j := 0

    for i, t := range timeline {
        for j < len(xp)-1 && xp[j+1] < t {
            j++
        }

        if j == 0 && t < xp[0] {
            out[i] = fp[0]
        } else if j >= len(xp)-1 {
            out[i] = fp[len(fp)-1]
        } else {
            // Use value at j (step, not linear)
            if t < xp[j+1] {
                out[i] = fp[j]
            } else {
                out[i] = fp[j+1]
            }
        }
    }

    return out
}
```

### Phase 2.5: Session Manager Expansion

Update `session/session.go` to handle loading state transitions:

```go
type Session struct {
    ID              string
    State           SessionState
    Frames          []Frame
    Metadata        SessionMetadata
    mu              sync.RWMutex
    progressCh      chan *ProgressMessage
    errorCh         chan error
}

func (s *Session) LoadData(ctx context.Context, bridge *PythonBridge, year, round int, sessionType string) error {
    s.SetState(StateLoading)

    rawData, progressCh, err := bridge.Execute(ctx, year, round, sessionType, false)
    if err != nil {
        s.SetState(StateError)
        return err
    }

    // Relay progress to WebSocket connections
    go func() {
        for progress := range progressCh {
            s.progressCh <- progress
        }
    }()

    // Generate frames
    frames, err := GenerateFrames(rawData, sessionType)
    if err != nil {
        s.SetState(StateError)
        return err
    }

    s.SetFrames(frames)
    s.SetState(StateReady)
    return nil
}

func (s *Session) SetState(state SessionState) {
    s.mu.Lock()
    defer s.mu.Unlock()
    s.State = state
}

func (s *Session) SubscribeProgress() <-chan *ProgressMessage {
    return s.progressCh
}
```

### Phase 2.6: WebSocket Streaming (60 Hz Loop)

Expand `ws/replay.go`:

```go
func (h *WebSocketHandler) streamFrames60Hz(conn *websocket.Conn, sess *session.Session) {
    frames := sess.GetFrames()
    ticker := time.NewTicker(time.Second / 60) // 60 Hz
    defer ticker.Stop()

    cmdChan := readCmdChan(conn) // Start command reader once before loop

    frameIndex := 0.0
    playbackSpeed := 1.0
    isPlaying := false
    lastFrameSent := -1

    for {
        select {
        case <-ticker.C:
            // Update frame index
            if isPlaying {
                frameIndex += playbackSpeed * (1.0 / 60.0) * 25.0
            }

            // Send new frame if index changed
            currentFrame := int(frameIndex)
            if currentFrame != lastFrameSent && currentFrame >= 0 && currentFrame < len(frames) {
                frameBytes, err := msgpack.Marshal(frames[currentFrame])
                if err != nil {
                    h.logger.Error("marshal error", zap.Error(err))
                    return
                }

                if err := conn.WriteMessage(websocket.BinaryMessage, frameBytes); err != nil {
                    return
                }

                lastFrameSent = currentFrame
            }

        case cmd := <-cmdChan:
            if cmd == nil {
                // Connection closed
                return
            }

            action, _ := cmd["action"].(string)
            switch action {
            case "play":
                isPlaying = true
                if speed, ok := cmd["speed"].(float64); ok {
                    playbackSpeed = speed
                }
            case "pause":
                isPlaying = false
            case "seek":
                if frame, ok := cmd["frame"].(float64); ok {
                    frameIndex = frame
                    lastFrameSent = -1
                }
            }
        }
    }
}

// readCmdChan starts a goroutine to read commands from the WebSocket.
// It sends commands down the channel as they arrive, nil when connection closes.
func readCmdChan(conn *websocket.Conn) <-chan map[string]interface{} {
    ch := make(chan map[string]interface{})
    go func() {
        defer close(ch)
        for {
            var cmd map[string]interface{}
            if err := conn.ReadJSON(&cmd); err != nil {
                if !websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNoStatusReceived) {
                    // Log unexpected errors, but don't spam on normal close
                    if err != nil {
                        // Only log if not a timeout/deadline
                        _, isDeadline := err.(net.Error)
                        if !isDeadline {
                            // logger.Error("read error", zap.Error(err))
                        }
                    }
                }
                return
            }
            ch <- cmd
        }
    }()
    return ch
}
```

### Phase 2.7: Test & Validation

**Tests to write:**
- ✅ Linear interpolation matches NumPy (golden file comparison)
- ✅ Step interpolation for gear/tyre
- ✅ Race progress normalization
- ✅ Frame generation produces correct number of frames
- ✅ WebSocket 60 Hz loop sends frames at correct rate
- ✅ Position sorting produces correct leaderboard

**Validation script (tests/validate_phase2.sh):**
```bash
# Start Python bridge in background
python3 scripts/fetch_telemetry.py 2025 1 R > /tmp/bridge_output.jsonl

# Load output in Go test
go test ./telemetry -run TestFrameGeneration -v

# Compare frame counts with Python version
echo "Python: $(wc -l /tmp/bridge_output.jsonl) lines"
echo "Expected: ~154,000 frames for 2025 R1"
```

**Phase 2 Deliverables:**
- ✅ Python bridge script outputs raw telemetry as JSON lines
- ✅ Go reads JSON lines and deserializes RawDataPayload
- ✅ Frame generation produces correct number of frames
- ✅ Frames contain all required driver data
- ✅ WebSocket sends binary msgpack frames at 60 Hz
- ✅ Playback controls (play, pause, seek) work
- ✅ Progress messages relay to WebSocket
- ✅ Unit tests pass for interpolation and frame generation

---

## Phase 3: Go-Native Cache Format

**Goal:** Create a simple binary cache format (`.f1cache`) with LZ4 compression.

### Phase 3.1: Cache Format Design

**`.f1cache` binary format (simple):**
```
[LZ4-compressed msgpack of []Frame]
```

That's it. The frame array is marshalled to msgpack, compressed with LZ4, written to file. File naming encodes metadata: `computed_data/{year}_{round}_{session_type}.f1cache`

**Cache invalidation:** If the format ever changes, delete `computed_data/` and let new caches rebuild. No migration tooling needed.

### Phase 3.2: Cache Reader/Writer

Simple functions in `cache/cache.go`:

```go
// Write cache: serialize frames to msgpack, compress with LZ4, write file
func WriteCache(filename string, frames []Frame) error {
    // Marshal frames to msgpack
    frameBytes, err := msgpack.Marshal(frames)
    if err != nil {
        return err
    }

    // Compress with LZ4
    compressed := make([]byte, lz4.CompressBlockBound(len(frameBytes)))
    compressedSize, err := lz4.CompressBlock(frameBytes, compressed, nil)
    if err != nil {
        return err
    }

    // Write to file
    return os.WriteFile(filename, compressed[:compressedSize], 0644)
}

// Read cache: read file, decompress, unmarshal
func ReadCache(filename string) ([]Frame, error) {
    compressed, err := os.ReadFile(filename)
    if err != nil {
        return nil, err
    }

    // Decompress with LZ4
    decompressed := make([]byte, 10*1024*1024) // 10MB buffer
    frameCount, err := lz4.UncompressBlock(compressed, decompressed)
    if err != nil {
        return nil, err
    }

    // Unmarshal frames
    var frames []Frame
    err = msgpack.Unmarshal(decompressed[:frameCount], &frames)
    return frames, err
}
```

Error handling: If cache corrupted or can't decompress, log error and rebuild from Python bridge.

### Phase 3.3: Session Integration

Simple cache loading in session creation endpoint:

```go
// Check for existing cache
if frames, err := ReadCache(cacheFilename); err == nil {
    // Cache hit: use it
    session.SetFrames(frames)
    session.SetState(StateReady)
    return
}

// Cache miss: trigger Python bridge
session.SetState(StateLoading)
go session.LoadFromPythonBridge(...)
```

If cache is corrupted or can't be decompressed, log error and rebuild from Python bridge.

**Phase 3 Deliverables:**
- ✅ `.f1cache` binary format with LZ4 compression
- ✅ Cache read/write functions
- ✅ Cache loading in session creation
- ✅ Error handling (corrupted cache triggers rebuild)

---

## Phase 4: Algorithm Ports

**Goal:** Port remaining algorithms from Python to ensure data-for-data parity. Validate with golden file testing.

### Phase 4.1: Savitzky-Golay Smoothing

**telemetry/savitzky_golay.go (~100 lines):**
```go
// Fixed coefficients for window=7, polyorder=2
var SavgolCoeffs7_2 = []float64{
    -2.0 / 21,
    3.0 / 21,
    6.0 / 21,
    7.0 / 21,
    6.0 / 21,
    3.0 / 21,
    -2.0 / 21,
}

func ApplySavitzkyGolay(data []float64) []float64 {
    if len(data) < 7 {
        return data // Can't smooth if less than window size
    }

    output := make([]float64, len(data))

    // Edge cases: keep first 3 and last 3 values as-is
    copy(output[0:3], data[0:3])
    copy(output[len(data)-3:], data[len(data)-3:])

    // Main loop
    for i := 3; i < len(data)-3; i++ {
        sum := 0.0
        for j := 0; j < 7; j++ {
            sum += SavgolCoeffs7_2[j] * data[i-3+j]
        }
        output[i] = sum
    }

    return output
}
```

**Bridge modification:** Move SG filter to Go (eliminate Python dependency):

Update `scripts/fetch_telemetry.py` to skip SG filtering, let Go do it on `interval_smooth_by_driver`.

### Phase 4.2: Position Sorting (4-Tier System)

**telemetry/position.go (~400 lines):**
```go
type SortKey struct {
    PosVal        float64
    IntervalVal   float64
    NegRaceProgress float64
}

func SortKeyHybrid(code string, driver DriverData) SortKey {
    posVal := 9999.0
    if driver.PosRaw != nil && *driver.PosRaw > 0 {
        posVal = float64(*driver.PosRaw)
    }

    intervalVal := 9999.0
    if driver.IntervalSmooth != nil {
        intervalVal = *driver.IntervalSmooth
    }

    return SortKey{
        PosVal:          posVal,
        IntervalVal:     intervalVal,
        NegRaceProgress: -driver.RaceProgress,
    }
}

func (a SortKey) Less(b SortKey) bool {
    if a.PosVal != b.PosVal {
        return a.PosVal < b.PosVal
    }
    if a.IntervalVal != b.IntervalVal {
        return a.IntervalVal < b.IntervalVal
    }
    return a.NegRaceProgress < b.NegRaceProgress
}

// PositionSmoothing: Prevent flickering with hysteresis
// Tracks when each driver last changed position, enforces minimum time before next change
type PositionSmoothing struct {
    lastChange  map[string]float64 // code → last change time
    mu          sync.RWMutex
}

// Apply filters position changes to prevent single-frame flickers
// Returns only drivers whose position is "allowed" to change at currentTime
// (i.e., enough time has elapsed since their last position change)
func (ps *PositionSmoothing) Apply(codes []string, drivers map[string]DriverData, currentTime float64, trackStatus string) []string {
    ps.mu.Lock()
    defer ps.mu.Unlock()

    threshold := 1.0 // Default: 1 second
    if trackStatus == "4" || trackStatus == "6" || trackStatus == "7" {
        threshold = 0.3 // Safety car / VSC: shorter threshold (0.3 seconds)
    }

    result := []string{}
    for _, code := range codes {
        if lastChange, ok := ps.lastChange[code]; ok {
            // Only allow this position if threshold time has elapsed since last change
            if currentTime-lastChange >= threshold {
                result = append(result, code)
                ps.lastChange[code] = currentTime
            }
            // Otherwise skip this driver (keep their old position)
        } else {
            // First position change for this driver - always allow
            result = append(result, code)
            ps.lastChange[code] = currentTime
        }
    }

    return result
}

// ApplyLapAnchor: Snap positions to official lap-end ordering (DEFERRED)
// TODO: Phase 4+ feature - detect lap boundaries and use DriverLapPosition for exact snap
// For now, this is handled implicitly by FIA stream data (pos_raw)
func ApplyLapAnchor(codes []string, drivers map[string]DriverData, lapBoundaries map[string][]int) []string {
    return codes // Placeholder - implemented by FIA stream data in current approach
}
```

### Phase 4.3: Gap Calculation

**telemetry/gaps.go (~100 lines):**
```go
func CalculateGaps(frame *Frame) {
    drivers := frame.Drivers
    var driverCodes []string
    for code := range drivers {
        driverCodes = append(driverCodes, code)
    }

    // Sort by position
    sort.Slice(driverCodes, func(i, j int) bool {
        return drivers[driverCodes[i]].Position < drivers[driverCodes[j]].Position
    })

    // Calculate gaps
    for i, code := range driverCodes {
        driver := drivers[code]

        // Gap to leader
        leaderDist := drivers[driverCodes[0]].Dist
        distDiff := leaderDist - driver.Dist

        leaderSpeed := drivers[driverCodes[0]].Speed
        speedMS := leaderSpeed * 1000 / 3600 // km/h → m/s

        if speedMS > 0 {
            driver.GapToLeader = distDiff / speedMS
        } else {
            driver.GapToLeader = 0
        }

        // Gap to previous
        if i > 0 {
            prevCode := driverCodes[i-1]
            prevDist := drivers[prevCode].Dist
            distDiff := prevDist - driver.Dist

            prevSpeed := drivers[prevCode].Speed
            speedMS := prevSpeed * 1000 / 3600

            if speedMS > 0 {
                driver.GapToPrevious = distDiff / speedMS
            } else {
                driver.GapToPrevious = 0
            }
        } else {
            driver.GapToPrevious = 0
        }

        drivers[code] = driver
    }
}
```

### Phase 4.4: Retirement Detection

**telemetry/retirement.go (~80 lines):**
```go
const (
    RetirementThreshold = 10.0         // seconds at 0 speed
    FramesPerSecond     = 25
    RetirementFrames    = int(RetirementThreshold * FramesPerSecond) // 250
)

func DetectRetirements(frames []Frame) {
    zeroSpeedFrames := make(map[string]int)
    retired := make(map[string]bool)

    for i := range frames {
        frame := &frames[i]
        for code, driver := range frame.Drivers {
            if driver.Speed == 0 {
                zeroSpeedFrames[code]++
            } else {
                zeroSpeedFrames[code] = 0
            }

            // Mark as retired if 250+ consecutive frames at 0 speed
            if zeroSpeedFrames[code] >= RetirementFrames {
                retired[code] = true
            }

            // Update status string
            if retired[code] {
                driver.Status = "Retired"
                frame.Drivers[code] = driver
            }
        }
    }
}
```

### Phase 4.5: Track Geometry Construction

**telemetry/track_geometry.go (~200 lines):**

Port of `build_track_from_example_lap()`:

```go
type TrackGeometry struct {
    CenterlineX []float64
    CenterlineY []float64
    InnerX      []float64
    InnerY      []float64
    OuterX      []float64
    OuterY      []float64
    XMin, XMax  float64
    YMin, YMax  float64
    Sector      []int // Sector membership for each point
}

func BuildTrackGeometry(telemetryX, telemetryY []float64, trackWidth float64) *TrackGeometry {
    // Create centerline from telemetry
    centerlineX, centerlineY := smoothCenterline(telemetryX, telemetryY)

    // Compute perpendicular normals via central differences
    normals := computeNormals(centerlineX, centerlineY)

    // Offset by track_width/2 to create inner/outer boundaries
    innerX, innerY := offsetBoundary(centerlineX, centerlineY, normals, -trackWidth/2)
    outerX, outerY := offsetBoundary(centerlineX, centerlineY, normals, trackWidth/2)

    // Compute bounding box
    xMin, xMax := min(innerX), max(outerX)
    yMin, yMax := min(innerY), max(outerY)

    return &TrackGeometry{
        CenterlineX: centerlineX,
        CenterlineY: centerlineY,
        InnerX:      innerX,
        InnerY:      innerY,
        OuterX:      outerX,
        OuterY:      outerY,
        XMin:        xMin,
        XMax:        xMax,
        YMin:        yMin,
        YMax:        yMax,
    }
}

func computeNormals(x, y []float64) [][]float64 {
    // Central differences for gradient
    normals := make([][]float64, len(x))

    for i := 1; i < len(x)-1; i++ {
        dx := (x[i+1] - x[i-1]) / 2
        dy := (y[i+1] - y[i-1]) / 2

        // Perpendicular normal
        length := math.Sqrt(dx*dx + dy*dy)
        normals[i] = []float64{-dy / length, dx / length}
    }

    normals[0] = normals[1]
    normals[len(x)-1] = normals[len(x)-2]

    return normals
}
```

### Phase 4.6: Testing & Validation

Test algorithms against Python reference. For one 2025 race session, load with Python and Go backends and compare:
- Frame count matches
- First/middle/last frame driver positions match
- Position sorting order matches

Simple validation:
```bash
# Run Python backend on :8000, Go on :8001
# For session 2025 R1:

# Python: generate frames
python3 -c "from shared.telemetry.f1_data import get_race_telemetry; ..."

# Go: generate frames
./f1-replay-go --test-session 2025 1 R

# Compare frame outputs (position, speed, lap for 5 drivers at 3 timepoints)
```

If frames match, algorithms are correct.

**Phase 4 Deliverables:**
- ✅ Savitzky-Golay filter (SG 7/2) ported and tested
- ✅ Position sorting (4-tier hierarchy) ported
- ✅ PositionSmoothing hysteresis logic ported
- ✅ Gap calculation (gap_to_leader, gap_to_previous) ported
- ✅ Retirement detection (10s at 0 speed) ported
- ✅ Track geometry construction ported
- ✅ Golden file testing confirms parity with Python
- ✅ All algorithms validated against reference data

---

## Phase 5: Full Parity + Cutover

**Goal:** Finish remaining work, validate end-to-end, and switch to Go as primary backend.

### Phase 5.1: Python Microservice for FastF1 Queries

Some endpoints still need FastF1:
- `GET /api/seasons/{year}/rounds` (list rounds)
- `GET /api/seasons/{year}/sprints`
- `POST /api/telemetry/laps` (raw lap telemetry)
- `POST /api/telemetry/sectors`

**scripts/fastf1_api.py (new, ~150 lines):**
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import fastf1

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/seasons/{year}/rounds")
async def get_rounds(year: int):
    schedule = fastf1.get_event_schedule(year)
    return schedule.to_dict("records")

@app.get("/api/seasons/{year}/sprints")
async def get_sprints(year: int):
    schedule = fastf1.get_event_schedule(year)
    sprints = schedule[schedule["EventFormat"] == "SprintFormat"]
    return sprints.to_dict("records")

@app.post("/api/telemetry/laps")
async def get_lap_telemetry(year: int, round_num: int, driver_codes: list[str]):
    session = fastf1.get_session(year, round_num, "R").load()
    # ... extract lap telemetry
    return {...}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
```

**Go reverse proxy (in main.go):**
```go
// Reverse proxy for FastF1 endpoints
httpClient := &http.Client{Timeout: 30 * time.Second}

r.Get("/api/seasons/{year}/rounds", func(w http.ResponseWriter, r *http.Request) {
    url := fmt.Sprintf("http://127.0.0.1:8001/api/seasons/%s/rounds", chi.URLParam(r, "year"))
    proxyRequest(httpClient, w, r, url)
})

r.Get("/api/seasons/{year}/sprints", func(w http.ResponseWriter, r *http.Request) {
    url := fmt.Sprintf("http://127.0.0.1:8001/api/seasons/%s/sprints", chi.URLParam(r, "year"))
    proxyRequest(httpClient, w, r, url)
})

func proxyRequest(client *http.Client, w http.ResponseWriter, r *http.Request, targetURL string) {
    req, _ := http.NewRequest(r.Method, targetURL, r.Body)
    resp, _ := client.Do(req)
    defer resp.Body.Close()

    for k, v := range resp.Header {
        w.Header()[k] = v
    }
    w.WriteHeader(resp.StatusCode)
    io.Copy(w, resp.Body)
}
```

### Phase 5.2: dev.js Update

**scripts/dev.js (modified):**
```javascript
const { spawn } = require("child_process");
const path = require("path");

function startServices() {
  console.log("Starting F1 Race Replay services...\n");

  // 1. Go backend on :8000
  const goBinary = path.join(__dirname, "../go-backend/f1-replay-go");
  const goServer = spawn(goBinary, ["--port", "8000"], {
    stdio: "inherit"
  });

  // 2. Python FastF1 microservice on :8001 (internal-only)
  const pythonMicroservice = spawn("python3",
    [path.join(__dirname, "../scripts/fastf1_api.py")],
    { stdio: "inherit" }
  );

  // 3. Vite frontend on :5173
  const frontend = spawn("npm", ["run", "dev"], {
    cwd: path.join(__dirname, "../frontend"),
    stdio: "inherit"
  });

  // Handle shutdown
  process.on("SIGINT", () => {
    goServer.kill();
    pythonMicroservice.kill();
    frontend.kill();
    process.exit(0);
  });
}

startServices();
```

### Phase 5.3: Integration Testing

Test the complete system:
1. Load a race session with Go backend
2. Verify playback (play, pause, seek) works
3. Check frame data is correct (compare position/speed with Python)
4. Test with 2–3 different session types (race, sprint, qualifying)

If all work, proceed to cutover. If issues, debug and fix.

### Phase 5.4: Update dev.js

Modify `scripts/dev.js` to start Go backend instead of Python:
```bash
# Start: go-backend binary, python fastf1 microservice, vite frontend
./go-backend/f1-replay-go &
python3 scripts/fastf1_api.py &
npm run dev -C frontend &
```

### Phase 5.5: Remove Old Python Backend (Optional)

After confirming Go works, can archive the old Python backend:
```bash
git mv backend docs/archive/python-backend
```

**Phase 5 Deliverables:**
- ✅ Integration testing complete
- ✅ dev.js updated for Go
- ✅ Go backend primary (or Python archived)

---

## Key Validation Points

**Before Phase 2:** Verify Python bridge subprocess pattern works with JSON-line output.

**Before Phase 3:** Validate msgpack frame encoding works with real frontend (test Frame encode/decode).

**Before Phase 4:** Confirm one 2025 race session produces identical frames to Python version.

**Before Cutover:** Test playback with 2-3 different session types (race, sprint, qualifying).

---

## Success Criteria

The rewrite is successful if:
- ✅ Frames generated by Go match Python output (golden file test)
- ✅ WebSocket playback works (play, pause, seek)
- ✅ Cache hit loads in <500ms (vs 3–5s Python)
- ✅ Frontend plays without errors

---

## References

- [go-rewrite-plan.md](./go-rewrite-plan.md) — Original proposal
- [current-system.md](./current-system.md) — System architecture
- [CLAUDE.md](../../CLAUDE.md) — Project guidelines
- [shared/telemetry/f1_data.py](../../shared/telemetry/f1_data.py) — Algorithms to port

---

**Plan Created:** March 8, 2026
**Approach:** Pragmatic rewrite focused on correctness and performance, not enterprise-grade operational complexity.
