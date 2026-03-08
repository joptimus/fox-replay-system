package ws

import (
	"fmt"
	"net/http"
	"time"

	"f1-replay-go/models"
	"f1-replay-go/session"
	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"github.com/vmihailenco/msgpack/v5"
	"go.uber.org/zap"
)

// Handler handles WebSocket connections for frame streaming
type Handler struct {
	sessionMgr *session.Manager
	logger     *zap.Logger
	upgrader   websocket.Upgrader
}

// NewHandler creates a new WebSocket handler
func NewHandler(sessionMgr *session.Manager, logger *zap.Logger) *Handler {
	return &Handler{
		sessionMgr: sessionMgr,
		logger:     logger,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				// Allow all origins for development
				return true
			},
		},
	}
}

// Handle upgrades HTTP connection to WebSocket and handles frame streaming
func (h *Handler) Handle(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "session_id")

	// Upgrade HTTP → WebSocket
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.logger.Error("websocket upgrade error", zap.Error(err))
		return
	}
	defer conn.Close()

	// Get session
	sess, err := h.sessionMgr.Get(sessionID)
	if err != nil {
		h.logger.Error("session not found", zap.String("sessionID", sessionID), zap.Error(err))
		conn.WriteJSON(map[string]string{
			"type":    "error",
			"message": "session not found",
		})
		return
	}

	h.logger.Info("WebSocket connection established",
		zap.String("sessionID", sessionID),
		zap.String("status", string(sess.GetState())),
	)

	// Start listening for progress updates immediately
	go func() {
		for progressMsg := range sess.ProgressCh {
			if progressMsg != nil {
				conn.WriteJSON(map[string]interface{}{
					"type":     "generation_progress",
					"progress": progressMsg.Pct,
					"message":  progressMsg.Msg,
				})
			}
		}
	}()

	// Wait for session to be ready (cache hit or generation)
	// If currently loading, wait up to 5 minutes for telemetry generation
	maxRetries := 3000 // 300 seconds / 100ms per retry = 3000 retries
	retryCount := 0
	for {
		state := sess.GetState()
		if state == models.StateReady {
			h.logger.Debug("session ready, starting frame stream",
				zap.String("sessionID", sessionID),
				zap.Int("frames", len(sess.GetFrames())),
			)
			break
		}

		if state != models.StateLoading {
			errMsg := fmt.Sprintf("session not ready: %s", state)
			if state == models.StateError {
				if detail := sess.GetLoadingError(); detail != "" {
					errMsg = detail
				}
			}

			h.logger.Warn("session not ready",
				zap.String("sessionID", sessionID),
				zap.String("state", string(state)),
				zap.Int("frames", len(sess.GetFrames())),
				zap.String("error", errMsg),
			)

			conn.WriteJSON(map[string]interface{}{
				"type":    "error",
				"message": errMsg,
			})
			return
		}

		// Still loading, wait a bit and retry
		if retryCount >= maxRetries {
			h.logger.Error("timeout waiting for session to be ready",
				zap.String("sessionID", sessionID),
			)
			conn.WriteJSON(map[string]interface{}{
				"type":    "error",
				"message": "session loading timeout",
			})
			return
		}

		time.Sleep(100 * time.Millisecond)
		retryCount++
	}

	// Phase 2: Stream frames at 60 Hz (to be implemented)
	h.streamFrames60Hz(conn, sess)
}

func (h *Handler) streamFrames60Hz(conn *websocket.Conn, sess *models.Session) {
	frames := sess.GetFrames()
	if len(frames) == 0 {
		h.logger.Error("no frames in session",
			zap.String("sessionID", sess.ID))
		conn.WriteJSON(map[string]string{"type": "error", "message": "no frames"})
		return
	}

	// Send session metadata
	metadata := sess.GetMetadata()
	conn.WriteJSON(map[string]interface{}{
		"type": "session_init",
		"data": map[string]interface{}{
			"total_frames": len(frames),
			"total_laps":   metadata.TotalLaps,
			"year":         metadata.Year,
			"round":        metadata.Round,
		},
	})

	// Signal to frontend that loading is complete
	conn.WriteJSON(map[string]interface{}{
		"type":     "loading_complete",
		"frames":   len(frames),
		"metadata": metadata,
	})

	// Playback control state
	frameIndex := 0.0
	playbackSpeed := 1.0
	isPlaying := false
	lastFrameSent := -1
	ticker := time.NewTicker(time.Second / 60) // 60 Hz
	defer ticker.Stop()

	// Set up non-blocking reads for commands
	conn.SetReadDeadline(time.Time{})
	doneCh := make(chan error, 1)

	go func() {
		for {
			var cmd map[string]interface{}
			if err := conn.ReadJSON(&cmd); err != nil {
				doneCh <- err
				return
			}

			action, _ := cmd["action"].(string)
			switch action {
			case "play":
				isPlaying = true
				if speed, ok := cmd["speed"].(float64); ok {
					playbackSpeed = speed
				}
				h.logger.Debug("playback started",
					zap.String("sessionID", sess.ID),
					zap.Float64("speed", playbackSpeed))

			case "pause":
				isPlaying = false
				h.logger.Debug("playback paused",
					zap.String("sessionID", sess.ID))

			case "seek":
				if frame, ok := cmd["frame"].(float64); ok {
					frameIndex = frame
					lastFrameSent = -1
					h.logger.Debug("seeking",
						zap.String("sessionID", sess.ID),
						zap.Float64("frame", frame))
				}
			}
		}
	}()

	// Main streaming loop
	for {
		select {
		case <-ticker.C:
			// Update frame index based on playback speed
			if isPlaying {
				frameIndex += playbackSpeed * (1.0 / 60.0) * float64(len(frames)) /
					(frames[len(frames)-1].T - frames[0].T)
			}

			// Clamp frame index to valid range
			if frameIndex < 0 {
				frameIndex = 0
			}
			if frameIndex >= float64(len(frames)) {
				frameIndex = float64(len(frames) - 1)
				isPlaying = false // Stop at end
			}

			currentFrame := int(frameIndex)

			// Send frame if index changed
			if currentFrame != lastFrameSent && currentFrame >= 0 && currentFrame < len(frames) {
				frame := frames[currentFrame]

				// Send as binary msgpack (more efficient for large data)
				frameBytes, err := marshalFrame(&frame)
				if err != nil {
					h.logger.Error("failed to marshal frame",
						zap.Error(err),
						zap.Int("frameIndex", currentFrame))
					return
				}

				if err := conn.WriteMessage(websocket.BinaryMessage, frameBytes); err != nil {
					h.logger.Info("WebSocket write error",
						zap.Error(err),
						zap.String("sessionID", sess.ID))
					return
				}

				lastFrameSent = currentFrame
			}

		case err := <-doneCh:
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				h.logger.Error("websocket error",
					zap.Error(err),
					zap.String("sessionID", sess.ID))
			}
			return
		}
	}
}

// marshalFrame converts a Frame to binary msgpack format
func marshalFrame(frame *models.Frame) ([]byte, error) {
	// Keep frontend-compatible field names while encoding true msgpack bytes.
	data := map[string]interface{}{
		"frame_index": frame.FrameIndex,
		"t":           frame.T,
		"lap":         frame.Lap,
		"drivers":     frame.Drivers,
	}
	return msgpack.Marshal(data)
}
