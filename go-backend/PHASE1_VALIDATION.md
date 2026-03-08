# Phase 1: Validation Checklist

**Date:** March 8, 2026
**Phase:** Go Server Scaffolding + Msgpack Cache Reader
**Status:** Ready for Go Compilation & Testing

## Deliverables

### ✅ Project Structure Created
- [x] Directory scaffold: `config/`, `models/`, `api/`, `ws/`, `session/`, `cache/`, `middleware/`, `utils/`, `tests/`
- [x] `go.mod` with dependencies (chi, websocket, msgpack, zap, testify)
- [x] Main entry point: `main.go`
- [x] README.md with setup and architecture

### ✅ Chi Router & Endpoints
- [x] `main.go` implements chi router
- [x] Middleware: RequestID, RealIP, Logger, Recoverer, CORS
- [x] Routes:
  - [x] `GET /api/health` → `{status: "ok"}`
  - [x] `POST /api/sessions` → Create/check cache hit
  - [x] `GET /api/sessions/{session_id}` → Get session status
  - [x] `DELETE /api/sessions/cache` → Clear cache
  - [x] `ws://localhost:8000/ws/replay/{session_id}` → WebSocket upgrade

### ✅ Session Management
- [x] `session/manager.go` - Session lifecycle (Create, Get, Delete, Exists, List, Count)
- [x] Thread-safe with RWMutex
- [x] Auto-cleanup of sessions older than 1 hour
- [x] Session state machine (INIT, LOADING, READY, ERROR)
- [x] Session metadata storage

### ✅ Data Models
- [x] `models/types.go` - All data structures:
  - [x] SessionState enum
  - [x] SessionRequest/Response structs
  - [x] Frame struct (with msgpack tags for serialization)
  - [x] DriverData struct (all fields from Python backend)
  - [x] Session with thread-safe getters/setters
  - [x] SessionMetadata for year, round, session_type, totals
- [x] All types properly tagged for msgpack encoding

### ✅ Msgpack Cache Reader
- [x] `cache/reader.go` - MsgpackCacheReader implementation:
  - [x] `ReadFrames(filename)` → deserialize msgpack frames
  - [x] `CacheExists(filename)` → check file existence
  - [x] `DeleteCache(pattern)` → delete matching files
  - [x] `GetCacheFilename(year, round, sessionType)` → generate standard names
  - [x] `ListCaches()` → list available cache files
- [x] Error handling for missing/corrupted files

### ✅ WebSocket Handler
- [x] `ws/handler.go` - WebSocket handler:
  - [x] HTTP → WebSocket upgrade with configurable buffer sizes
  - [x] Allow-all CORS origin (dev setting, secure in production)
  - [x] Session lookup and state validation
  - [x] Error responses for missing/not-ready sessions
  - [x] Stub for 60 Hz frame streaming (Phase 2)

### ✅ API Endpoint Implementation
- [x] `handleCreateSessionRoute()` - Creates session, checks cache first
  - [x] Cache hit → return frames immediately
  - [x] Cache miss → return LOADING state (Phase 2 will load)
  - [x] Proper error handling for invalid requests
- [x] `handleGetSessionRoute()` - Retrieve session status
  - [x] Session lookup with error handling
- [x] `handleDeleteCacheRoute()` - Delete cache with pattern support
  - [x] Default pattern `*.msgpack` if not specified

### ✅ Unit Tests
- [x] `tests/cache_reader_test.go`:
  - [x] `TestMsgpackCacheReader()` - Read/write msgpack frames
  - [x] `TestGetCacheFilename()` - Filename generation
  - [x] Validates frame structure, driver data
  - [x] Tests cache deletion

### ✅ Documentation
- [x] `README.md` - Architecture, setup, API endpoints
- [x] Code comments on public functions
- [x] Error handling documented

## Pre-Compilation Checklist

Before running `go build`:

- [ ] Go 1.22+ installed (`go version`)
- [ ] Dependencies downloaded (`go mod download`)
- [ ] No syntax errors in Go code (can validate with `go vet ./...`)
- [ ] All imports resolvable

## Compilation & Testing (Requires Go)

Once Go is installed, run:

```bash
cd go-backend
go mod tidy
go build -o f1-replay-go .
go test ./tests -v
go run . --port 8000
```

Expected test output:
```
TestMsgpackCacheReader: PASS
TestGetCacheFilename: PASS
---
ok      f1-replay-go/tests      0.123s
```

Expected runtime output:
```
{"level":"info","msg":"Starting F1 Race Replay Go backend","port":8000,"logLevel":"info"}
{"level":"info","msg":"Server listening","addr":":8000"}
```

## API Validation (After Compilation)

```bash
# Health check
curl http://localhost:8000/api/health
# Expected: {"status":"ok"}

# Create session (assumes 2025_r1_R_telemetry.msgpack exists in computed_data/)
curl -X POST http://localhost:8000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"year": 2025, "round_num": 1, "session_type": "R", "refresh": false}'

# Expected (cache hit): {"session_id":"2025_r1_R_...","status":"READY","metadata":{...}}
# Or (cache miss): {"session_id":"2025_r1_R_...","status":"LOADING"}
```

## Known Limitations (Phase 1)

- WebSocket frame streaming is stubbed (returns "ready" message)
- Frame generation algorithm not implemented (in Go)
- Python bridge not integrated (Phase 2)
- No compression (LZ4 added in Phase 3)
- No sophisticated caching strategy (simple file existence check)

## Next Steps (Phase 2)

1. Implement Python telemetry bridge (`scripts/fetch_telemetry.py`)
2. Add frame generation algorithm in Go
3. Implement 60 Hz WebSocket streaming loop
4. Integrate Python bridge subprocess management
5. Relay progress messages via WebSocket

## Files Summary

| File | Lines | Purpose |
|------|-------|---------|
| `main.go` | 160 | Entry point, chi router, endpoints |
| `models/types.go` | 150+ | Data structures (Frame, Session, etc.) |
| `session/manager.go` | 120+ | Session lifecycle management |
| `cache/reader.go` | 80+ | Msgpack cache reading |
| `ws/handler.go` | 90+ | WebSocket handler (stub) |
| `tests/cache_reader_test.go` | 120+ | Unit tests for cache reader |
| `go.mod` | 20 | Module definition |
| `README.md` | 80+ | Documentation |

**Total Go Code: ~730 lines**

---

**Phase 1 Completion Status:** All deliverables implemented. Ready for Go compilation and Phase 2 (Python bridge + frame generation).
