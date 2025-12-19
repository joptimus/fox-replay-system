# WebSocket Reliability & Development Workflow Design

## Problem Statement

The F1 Race Replay application suffers from three interconnected reliability issues:

1. **WebSocket Connection Instability** - Connections repeatedly reconnect/disconnect during initial load, especially after data processing completes
2. **Silent Failures** - When things break (serialization, data issues), the connection just closes without clear error messages
3. **Difficult Development Workflow** - Hot reload causes stale state issues, requiring complete process kills and restarts

## Root Causes

### Connection Instability
- WebSocket connection stays open for up to 5 minutes while waiting for session data to load, with no feedback to client
- Msgpack serialization failures happen silently and crash the connection
- No graceful error messaging—connection just closes
- Frontend auto-reconnects, creating an infinite loop if the problem persists

### Missing Visibility
- No logging of frame serialization or when serialization fails
- No logging of data sizes or potential message size limit issues
- No timing information on session load duration
- Scattered logging that doesn't show the full picture

### Hot Reload Issues
- In-memory session cache (`active_sessions`) persists broken state across restarts
- Frontend dev reload can't connect to old session IDs
- No session cleanup/timeout mechanism
- No way to explicitly kill a session

## Solution Design

### Phase 1: Logging & Visibility

Add structured logging at four critical points:

1. **Session Creation & Loading**
   - Log when data starts loading
   - Log total frames generated and load duration
   - Log any errors during load

2. **Frame Serialization**
   - Log when frames are being packed into msgpack
   - Detect and log serialization errors (data type issues, size limits)
   - Log frame data sizes

3. **WebSocket Sending**
   - Log when frames are sent successfully
   - Log sending failures with error details
   - Track frame send latency

4. **Connection Lifecycle**
   - Log connection open/close events with timestamps
   - Log timeout events with clear messaging
   - Log client disconnects vs. server-initiated closes

### Phase 2: Connection Stability & Error Recovery

1. **Status Messages During Load**
   - While waiting for data, send periodic "loading" status updates
   - Client can display progress feedback instead of silence
   - Clear indication to frontend that connection is healthy

2. **Graceful Serialization Error Handling**
   - Catch msgpack encoding failures
   - Log the error and affected frame
   - Skip the bad frame and continue streaming (don't crash connection)
   - Send error status to client so it knows data is incomplete

3. **Frame Validation Before Sending**
   - Validate frame data structure before msgpack encoding
   - Detect incompatible types (numpy arrays, complex objects) before they break serialization
   - Log validation failures with details

4. **Clear Timeout Messaging**
   - If session load exceeds timeout, send explicit error message
   - Include details: what was being loaded, how long it took, what failed
   - Close connection cleanly after error

5. **Client-Side Exponential Backoff**
   - Instead of immediate reconnect, wait 1s, then 2s, then 4s, etc.
   - Prevents hammering server if problem is persistent
   - Show user that reconnection is in progress

### Phase 3: Development Workflow & Session Management

1. **Session Lifecycle Management**
   - Sessions timeout after 5 minutes of inactivity
   - Cleanup removes session from `active_sessions` dict
   - Prevents stale state corruption

2. **Kill Session Endpoint**
   - Add `POST /api/sessions/{session_id}/kill` endpoint
   - Frontend can explicitly close session when unmounting or reloading
   - Gracefully closes WebSocket connection
   - Clears session from active cache

3. **Backend Shutdown Handling**
   - Gracefully close all active sessions on shutdown
   - Free resources and close WebSocket connections properly
   - Prevents port binding issues on restart

4. **Debug Status Endpoint**
   - Add `GET /api/debug/sessions` endpoint
   - Shows all active sessions with:
     - Load status and timing
     - Frame count and data size
     - Any errors
     - Last activity timestamp
   - Useful for diagnosing stuck sessions

5. **Improved Process Management**
   - Update npm start script to handle graceful shutdown
   - Ensure old processes fully released before starting new ones
   - Clear stale session state on backend startup

## Implementation Order

### Phase 1: Logging (Quick wins for visibility)
- Add logging to session loading in `F1ReplaySession`
- Add logging to frame serialization in `serialize_frame_msgpack`
- Add logging to WebSocket send operations in `handle_replay_websocket`
- Add timing information throughout

### Phase 2: Stability (Fix actual issues)
- Add status message sending during session load
- Wrap serialization in try/catch with graceful error handling
- Add frame validation before sending
- Improve timeout messaging
- Add exponential backoff to frontend reconnection logic

### Phase 3: Workflow (Quality of life)
- Add session timeout cleanup
- Add kill session endpoint
- Add debug status endpoint
- Improve graceful shutdown

## Success Criteria

✅ Reconnection loops stop—connection stays open or closes cleanly with clear reason
✅ Data flows consistently without random disconnections mid-playback
✅ Can restart backend, frontend auto-reconnects without manual kill/restart
✅ Can see exactly where failures happen via logs
✅ Development iteration cycle improves significantly
✅ First run for new sessions still works but with better feedback
✅ Frame streaming is reliable enough for consistent playback

## Data Structures & Key Changes

### Frame Serialization Logging
```
[Frame] Serializing frame 42/1500 (2.8%)
[Frame] Frame size: 4.2KB, drivers: 20, msgpack size: 4156 bytes
[Frame] Sent frame 42 (4.2KB) in 2.1ms
```

### Session Loading Logging
```
[Session] Starting load for 2025_1_R (cache: hit|miss)
[Session] Generated 1500 frames in 12.4s
[Session] Session ready: 1500 frames, 6.2MB total
```

### WebSocket Status Messages
```json
{"type": "status", "message": "Loading telemetry...", "progress": 45}
{"type": "status", "message": "Processing frames...", "progress": 85}
{"type": "ready", "frames": 1500}
```

### Error Handling
```json
{"type": "error", "message": "Frame serialization failed at frame 42", "frame": 42}
{"type": "warning", "message": "Session load timeout after 300s"}
```

## Timeline & Effort

- **Phase 1**: 2-3 hours (straightforward logging additions)
- **Phase 2**: 3-4 hours (error handling and client-side logic)
- **Phase 3**: 2-3 hours (endpoints and cleanup logic)

Total estimated effort: 7-10 hours spread across multiple sessions.
