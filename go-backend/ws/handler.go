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
			ReadBufferSize:  4096,
			WriteBufferSize: 4 * 1024 * 1024,
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

	// Signal to frontend that loading is complete
	metadata := sess.GetMetadata()
	conn.WriteJSON(map[string]interface{}{
		"type":     "loading_complete",
		"frames":   len(frames),
		"metadata": metadata,
	})

	// Playback state — frontend drives frame advancement via seek commands.
	// Backend only responds to commands; no independent frame advancing.
	lastFrameSent := -1
	frameCh := make(chan int, 4) // buffered channel for seek requests

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
			case "seek":
				if frame, ok := cmd["frame"].(float64); ok {
					idx := int(frame)
					if idx < 0 {
						idx = 0
					}
					if idx >= len(frames) {
						idx = len(frames) - 1
					}
					// Non-blocking send — drop stale seeks if buffer full
					select {
					case frameCh <- idx:
					default:
						// Drain old value and send new one
						select {
						case <-frameCh:
						default:
						}
						frameCh <- idx
					}
				}

			case "play":
				h.logger.Debug("playback started (frontend-driven)",
					zap.String("sessionID", sess.ID))
			case "pause":
				h.logger.Debug("playback paused (frontend-driven)",
					zap.String("sessionID", sess.ID))
			}
		}
	}()

	// Main streaming loop — send frames only when frontend requests them
	for {
		select {
		case requestedFrame := <-frameCh:
			if requestedFrame == lastFrameSent {
				continue
			}
			if requestedFrame < 0 || requestedFrame >= len(frames) {
				continue
			}

			frame := frames[requestedFrame]

			frameBytes, err := marshalFrame(&frame)
			if err != nil {
				h.logger.Error("failed to marshal frame",
					zap.Error(err),
					zap.Int("frameIndex", requestedFrame))
				return
			}

			if err := conn.WriteMessage(websocket.BinaryMessage, frameBytes); err != nil {
				h.logger.Info("WebSocket write error",
					zap.Error(err),
					zap.String("sessionID", sess.ID))
				return
			}

			lastFrameSent = requestedFrame

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
