package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"

	"f1-replay-go/cache"
	"f1-replay-go/models"
	"f1-replay-go/session"
	"f1-replay-go/ws"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"go.uber.org/zap"
)

func main() {
	port := flag.Int("port", 8000, "HTTP server port")
	logLevel := flag.String("log", "info", "Log level")
	pythonBridgeURL := flag.String("python-bridge", "http://localhost:8001", "Python bridge URL")
	cacheDir := flag.String("cache-dir", "../computed_data", "Cache directory path")
	flag.Parse()

	// Initialize logger
	logger, _ := zap.NewProduction()
	if *logLevel == "debug" {
		logger, _ = zap.NewDevelopment()
	}
	defer logger.Sync()

	logger.Info("Starting F1 Race Replay Go backend",
		zap.Int("port", *port),
		zap.String("logLevel", *logLevel),
		zap.String("pythonBridgeURL", *pythonBridgeURL),
		zap.String("cacheDir", *cacheDir),
	)

	// Create cache directory if it doesn't exist
	if err := os.MkdirAll(*cacheDir, 0755); err != nil {
		logger.Fatal("failed to create cache directory", zap.Error(err))
	}

	// Initialize session manager and cache reader
	sessionMgr := session.NewManager(100) // Max 100 concurrent sessions
	cacheReader := cache.NewHybridCacheReader(*cacheDir, logger)
	wsHandler := ws.NewHandler(sessionMgr, logger)

	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware())

	// Routes
	r.Get("/api/health", handleHealth)
	r.Post("/api/sessions", handleCreateSessionRoute(sessionMgr, cacheReader, logger))
	r.Get("/api/sessions/{session_id}", handleGetSessionRoute(sessionMgr, logger))
	r.Delete("/api/sessions/cache", handleDeleteCacheRoute(cacheReader, logger))

	// WebSocket
	r.HandleFunc("/ws/replay/{session_id}", wsHandler.Handle)

	// Start server
	addr := fmt.Sprintf(":%d", *port)
	logger.Info("Server listening", zap.String("addr", addr))
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatal(err)
	}
}

func corsMiddleware() func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// API Handlers

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleCreateSessionRoute(
	sessionMgr *session.Manager,
	cacheReader *cache.HybridCacheReader,
	logger *zap.Logger,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req models.SessionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid request"})
			return
		}

		sessionID := session.GenerateSessionID(req.Year, req.RoundNum, req.SessionType)
		sess, err := sessionMgr.Create(sessionID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		// Check cache first
		if !req.Refresh {
			frames, err := cacheReader.ReadFrames(req.Year, req.RoundNum, req.SessionType)
			if err == nil && len(frames) > 0 {
				logger.Info("Cache hit", zap.Int("year", req.Year), zap.Int("round", req.RoundNum), zap.String("sessionType", req.SessionType))

				sess.SetFrames(frames)
				sess.SetState(models.StateReady)
				sess.SetMetadata(models.SessionMetadata{
					Year:        req.Year,
					Round:       req.RoundNum,
					SessionType: req.SessionType,
					TotalFrames: len(frames),
				})

				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				json.NewEncoder(w).Encode(models.SessionResponse{
					SessionID: sessionID,
					Status:    models.StateReady,
					Metadata: map[string]interface{}{
						"total_frames": len(frames),
					},
				})
				return
			}
		}

		// Cache miss or refresh requested - generate in background
		logger.Info("Cache miss, generating from telemetry",
			zap.String("sessionID", sessionID),
			zap.Int("year", req.Year),
			zap.Int("round", req.RoundNum),
			zap.String("sessionType", req.SessionType),
		)

		sess.SetState(models.StateLoading)

		// Generate cache in background using Python bridge
		go generateCacheAsync(sessionID, req.Year, req.RoundNum, req.SessionType, sess, cacheReader, logger)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(models.SessionResponse{
			SessionID: sessionID,
			Status:    models.StateLoading,
		})
	}
}

func handleGetSessionRoute(
	sessionMgr *session.Manager,
	logger *zap.Logger,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sessionID := chi.URLParam(r, "session_id")
		if sessionID == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "missing session_id"})
			return
		}

		sess, err := sessionMgr.Get(sessionID)
		if err != nil {
			logger.Error("session not found", zap.String("sessionID", sessionID))
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "session not found"})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(models.SessionResponse{
			SessionID: sessionID,
			Status:    sess.GetState(),
			Metadata: map[string]interface{}{
				"total_frames": len(sess.GetFrames()),
			},
		})
	}
}

func handleDeleteCacheRoute(
	cacheReader *cache.HybridCacheReader,
	logger *zap.Logger,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pattern := r.URL.Query().Get("pattern")
		if pattern == "" {
			pattern = "*.msgpack" // Default: delete all msgpack caches
		}

		err := cacheReader.DeleteCaches(pattern)
		if err != nil {
			logger.Error("failed to delete cache", zap.Error(err))
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		logger.Info("cache deleted", zap.String("pattern", pattern))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "cache deleted"})
	}
}

// generateCacheAsync generates telemetry cache using Python script and updates session
func generateCacheAsync(
	sessionID string,
	year int,
	round int,
	sessionType string,
	sess *models.Session,
	cacheReader *cache.HybridCacheReader,
	logger *zap.Logger,
) {
	defer func() {
		if r := recover(); r != nil {
			logger.Error("panic in generateCacheAsync", zap.Any("panic", r))
			sess.SetState(models.StateError)
		}
	}()

	logger.Info("Starting cache generation", zap.String("sessionID", sessionID))

	// Call Python script to generate telemetry (can take 30-60 seconds)
	cmd := exec.Command("python3", "scripts/generate_telemetry.py", fmt.Sprintf("%d", year), fmt.Sprintf("%d", round), sessionType)

	// Capture both stdout and stderr for better error reporting
	output, err := cmd.CombinedOutput()
	if err != nil {
		logger.Error("failed to generate telemetry",
			zap.Error(err),
			zap.String("sessionID", sessionID),
			zap.String("output", string(output)),
		)
		sess.SetState(models.StateError)
		return
	}

	logger.Debug("Python script completed",
		zap.String("sessionID", sessionID),
		zap.Int("output_len", len(output)),
	)

	// Parse Python output
	var result map[string]interface{}
	if err := json.Unmarshal(output, &result); err != nil {
		logger.Error("failed to parse telemetry output",
			zap.Error(err),
			zap.String("sessionID", sessionID),
		)
		sess.SetState(models.StateError)
		return
	}

	status, ok := result["status"].(string)
	if !ok || status != "success" {
		msg := "unknown error"
		if m, ok := result["message"].(string); ok {
			msg = m
		}
		logger.Error("telemetry generation failed",
			zap.String("message", msg),
			zap.String("sessionID", sessionID),
		)
		sess.SetState(models.StateError)
		return
	}

	// Try to load the newly generated cache
	frames, err := cacheReader.ReadFrames(year, round, sessionType)
	if err != nil || len(frames) == 0 {
		logger.Error("failed to load generated cache",
			zap.Error(err),
			zap.String("sessionID", sessionID),
		)
		sess.SetState(models.StateError)
		return
	}

	// Update session with loaded frames
	sess.SetFrames(frames)
	sess.SetMetadata(models.SessionMetadata{
		Year:        year,
		Round:       round,
		SessionType: sessionType,
		TotalFrames: len(frames),
	})
	sess.SetState(models.StateReady)

	logger.Info("cache generation complete",
		zap.String("sessionID", sessionID),
		zap.Int("frames", len(frames)),
	)
}
