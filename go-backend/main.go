package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"f1-replay-go/bridge"
	"f1-replay-go/cache"
	"f1-replay-go/models"
	"f1-replay-go/session"
	"f1-replay-go/telemetry"
	"f1-replay-go/ws"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/vmihailenco/msgpack/v5"
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

	// Telemetry comparison endpoints (proxy to Python scripts)
	r.Post("/api/telemetry/sectors", handlePythonTelemetry("scripts/get_sector_times.py", logger))
	r.Post("/api/telemetry/laps", handlePythonTelemetry("scripts/get_lap_telemetry.py", logger))

	// FastF1 tester page and API
	r.Get("/api/tester/fastf1.html", handleStaticFile("backend/static/fastf1.html"))
	r.Get("/api/debug/fastf1-test", handleFastF1DebugTest(logger))

	// WebSocket
	r.HandleFunc("/ws/replay/{session_id}", wsHandler.Handle)

	// Start server with graceful shutdown
	addr := fmt.Sprintf(":%d", *port)
	srv := &http.Server{Addr: addr, Handler: r}

	// Listen for shutdown signals in background
	shutdownCh := make(chan os.Signal, 1)
	signal.Notify(shutdownCh, os.Interrupt, syscall.SIGTERM)

	go func() {
		sig := <-shutdownCh
		logger.Info("Shutdown signal received, stopping server...", zap.String("signal", sig.String()))

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			logger.Error("Server forced to shutdown", zap.Error(err))
		}
	}()

	logger.Info("Server listening", zap.String("addr", addr))
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logger.Fatal("Server failed", zap.Error(err))
	}

	logger.Info("Server stopped")
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
			frames, cacheMeta, err := cacheReader.ReadFrames(req.Year, req.RoundNum, req.SessionType)
			if err == nil && len(frames) > 0 {
				logger.Info("Cache hit", zap.Int("year", req.Year), zap.Int("round", req.RoundNum), zap.String("sessionType", req.SessionType))

				// Get total laps from cache metadata, or compute from frames
				totalLaps := 0
				if cacheMeta != nil {
					totalLaps = cacheMeta.TotalLaps
				}
				if totalLaps == 0 {
					for _, frame := range frames {
						if frame.Lap > totalLaps {
							totalLaps = frame.Lap
						}
					}
				}

				sess.SetFrames(frames)
				sess.SetState(models.StateReady)
				meta := models.SessionMetadata{
					Year:        req.Year,
					Round:       req.RoundNum,
					SessionType: req.SessionType,
					TotalFrames: len(frames),
					TotalLaps:   totalLaps,
				}
				if cacheMeta != nil {
					meta.DriverNumbers = cacheMeta.DriverNumbers
					meta.DriverTeams = cacheMeta.DriverTeams
					meta.DriverColors = cacheMeta.DriverColors
					meta.TrackStatuses = cacheMeta.TrackStatuses
					meta.TrackGeometry = cacheMeta.TrackGeometry
					meta.RaceStartTime = cacheMeta.RaceStartTime
					meta.WeatherData = cacheMeta.WeatherData
					meta.RaceControlMessages = cacheMeta.RaceControlMessages
					meta.QualiSegments = cacheMeta.QualiSegments
				}
				sess.SetMetadata(meta)

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
		go generateCacheAsync(sessionID, req.Year, req.RoundNum, req.SessionType, req.Refresh, sess, cacheReader, logger)

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
	refresh bool,
	sess *models.Session,
	cacheReader *cache.HybridCacheReader,
	logger *zap.Logger,
) {
	const maxStderrLines = 30
	const maxStdoutLineBytes = 512 * 1024 * 1024 // 512MB JSON line budget for large telemetry payloads
	const maxStderrLineBytes = 1 * 1024 * 1024   // 1MB per stderr line

	defer func() {
		if r := recover(); r != nil {
			logger.Error("panic in generateCacheAsync", zap.Any("panic", r))
			sess.SetLoadingError(fmt.Sprintf("panic during cache generation: %v", r))
			sess.SetState(models.StateError)
		}
		close(sess.ProgressCh)
	}()

	logger.Info("Starting cache generation",
		zap.String("sessionID", sessionID),
		zap.Int("year", year),
		zap.Int("round", round),
		zap.String("sessionType", sessionType),
	)

	// Call Python FastF1 extractor (raw telemetry payload only)
	args := []string{"scripts/fetch_telemetry.py", fmt.Sprintf("%d", year), fmt.Sprintf("%d", round), sessionType}
	if refresh {
		args = append(args, "--refresh")
	}
	logger.Info("Executing Python extractor",
		zap.Strings("args", args),
	)
	cmd := exec.Command("python3", args...)

	// Get stdout pipe to read output as it streams
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		logger.Error("failed to get stdout pipe", zap.Error(err), zap.String("sessionID", sessionID))
		sess.SetState(models.StateError)
		return
	}
	stderr, _ := cmd.StderrPipe()

	// Start the command
	if err := cmd.Start(); err != nil {
		logger.Error("failed to start telemetry generation", zap.Error(err), zap.String("sessionID", sessionID))
		sess.SetState(models.StateError)
		return
	}

	go func() {
		var mu sync.Mutex
		stderrLines := make([]string, 0, maxStderrLines)

		errScanner := bufio.NewScanner(stderr)
		errScanner.Buffer(make([]byte, 64*1024), maxStderrLineBytes)
		for errScanner.Scan() {
			line := errScanner.Text()
			mu.Lock()
			stderrLines = append(stderrLines, line)
			if len(stderrLines) > maxStderrLines {
				stderrLines = stderrLines[len(stderrLines)-maxStderrLines:]
			}
			mu.Unlock()

			logger.Debug("python extractor stderr",
				zap.String("sessionID", sessionID),
				zap.String("line", line),
			)
		}

		// Attach collected stderr lines to session error if process fails later.
		mu.Lock()
		if len(stderrLines) > 0 {
			sess.SetLoadingError(strings.Join(stderrLines, " | "))
		}
		mu.Unlock()
	}()

	// Read output line by line and stream progress
	// (Python now writes large data payloads to msgpack file instead of stdout)
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64*1024), 10*1024*1024) // 10MB max line size
	var cacheFilePath string

	for scanner.Scan() {
		line := scanner.Text()
		if len(line) == 0 {
			continue
		}

		var msg map[string]interface{}
		if err := json.Unmarshal([]byte(line), &msg); err != nil {
			logger.Debug("failed to parse line", zap.String("line", line), zap.Error(err))
			continue
		}

		msgType, _ := msg["type"].(string)

		if msgType == "progress" {
			// Send progress update to WebSocket
			message := ""
			if m, ok := msg["msg"].(string); ok {
				message = m
			} else if m, ok := msg["message"].(string); ok {
				message = m
			}
			if message != "" {
				if strings.HasPrefix(message, "ERROR:") {
					sess.SetLoadingError(message)
				}
				pct := 0
				if rawPct, ok := msg["pct"]; ok {
					switch v := rawPct.(type) {
					case float64:
						pct = int(v)
					case int:
						pct = v
					}
				}
				sess.ProgressCh <- &models.ProgressMessage{
					Pct: pct,
					Msg: message,
				}
				logger.Debug("telemetry progress",
					zap.String("message", message),
					zap.Int("pct", pct),
					zap.String("sessionID", sessionID),
				)
			}
		} else if msgType == "completion" {
			// Python wrote data to msgpack file
			if file, ok := msg["cache_file"].(string); ok {
				cacheFilePath = file
				logger.Info("telemetry cache file ready", zap.String("path", cacheFilePath))
			}
		} else if msgType == "error" {
			if errMsg, ok := msg["message"].(string); ok {
				sess.SetLoadingError(errMsg)
				logger.Error("python extractor error", zap.String("error", errMsg))
			}
		}
	}

	if err := scanner.Err(); err != nil {
		logger.Error("error reading scanner", zap.Error(err), zap.String("sessionID", sessionID))
		sess.SetLoadingError(fmt.Sprintf("extractor output read error: %v", err))
		sess.SetState(models.StateError)
		return
	}

	// Wait for command to finish
	if err := cmd.Wait(); err != nil {
		errMsg := sess.GetLoadingError()
		if errMsg == "" {
			errMsg = fmt.Sprintf("extractor process failed: %v", err)
			sess.SetLoadingError(errMsg)
		}
		logger.Error("failed to extract telemetry",
			zap.Error(err),
			zap.String("sessionID", sessionID),
			zap.String("extractorError", errMsg),
		)
		sess.SetState(models.StateError)
		return
	}

	if cacheFilePath == "" {
		logger.Error("no cache file from extractor", zap.String("sessionID", sessionID))
		sess.SetLoadingError("extractor did not create cache file")
		sess.SetState(models.StateError)
		return
	}

	// Read msgpack file written by Python
	sess.ProgressCh <- &models.ProgressMessage{Pct: 85, Msg: "Reading telemetry cache..."}
	msgpackData, err := os.ReadFile(cacheFilePath)
	if err != nil {
		logger.Error("failed to read msgpack cache", zap.Error(err), zap.String("sessionID", sessionID))
		sess.SetLoadingError(fmt.Sprintf("failed to read cache file: %v", err))
		sess.SetState(models.StateError)
		return
	}

	// Deserialize msgpack payload
	var payload bridge.RawDataPayload
	decoder := msgpack.NewDecoder(bytes.NewReader(msgpackData))
	decoder.SetCustomStructTag("json")
	err = decoder.Decode(&payload)
	if err != nil {
		logger.Error("failed to unmarshal msgpack", zap.Error(err), zap.String("sessionID", sessionID))
		sess.SetLoadingError(fmt.Sprintf("failed to deserialize telemetry: %v", err))
		sess.SetState(models.StateError)
		return
	}

	rawPayload := &payload
	if rawPayload == nil {
		logger.Error("msgpack payload is nil", zap.String("sessionID", sessionID))
		sess.SetLoadingError("telemetry payload is empty")
		sess.SetState(models.StateError)
		return
	}

	sess.ProgressCh <- &models.ProgressMessage{Pct: 92, Msg: "Generating frames in Go..."}
	generator := telemetry.NewFrameGenerator(logger)
	frames, err := generator.Generate(rawPayload, sessionType)
	if err != nil || len(frames) == 0 {
		logger.Error("go frame generation failed",
			zap.Error(err),
			zap.String("sessionID", sessionID),
		)
		if err != nil {
			sess.SetLoadingError(fmt.Sprintf("go frame generation failed: %v", err))
		} else {
			sess.SetLoadingError("go frame generation produced zero frames")
		}
		sess.SetState(models.StateError)
		return
	}

	trackStatusMaps := make([]map[string]interface{}, len(rawPayload.TrackStatuses))
	for i, ts := range rawPayload.TrackStatuses {
		trackStatusMaps[i] = map[string]interface{}{
			"status":     ts.Status,
			"message":    ts.Message,
			"start_time": ts.StartTime,
			"end_time":   ts.EndTime,
		}
	}

	raceControlMaps := make([]map[string]interface{}, len(rawPayload.RaceControlMessages))
	for i, rcm := range rawPayload.RaceControlMessages {
		raceControlMaps[i] = map[string]interface{}{
			"time":           rcm.Time,
			"category":       rcm.Category,
			"message":        rcm.Message,
			"flag":           rcm.Flag,
			"scope":          rcm.Scope,
			"sector":         rcm.Sector,
			"racing_number":  rcm.RacingNumber,
			"lap":            rcm.Lap,
			"status":         rcm.Status,
		}
	}

	trackGeometry := map[string]interface{}{}
	if rawPayload.TrackGeometry != nil && len(rawPayload.TrackGeometry) > 0 {
		trackGeometry = rawPayload.TrackGeometry
	}

	weatherData := map[string]interface{}{}
	if rawPayload.WeatherData != nil && len(rawPayload.WeatherData) > 0 {
		for key, val := range rawPayload.WeatherData {
			weatherData[key] = val
		}
	}

	var raceStartTime *float64
	if rawPayload.RaceStartTimeAbsolute > 0 {
		raceStartTime = &rawPayload.RaceStartTimeAbsolute
	}

	cacheMeta := cache.F1CacheMetadata{
		Year:                year,
		Round:               round,
		SessionType:         sessionType,
		TotalFrames:         len(frames),
		TotalLaps:           rawPayload.TotalLaps,
		DriverNumbers:       rawPayload.DriverNumbers,
		DriverTeams:         rawPayload.DriverTeams,
		DriverColors:        rawPayload.DriverColors,
		TrackStatuses:       trackStatusMaps,
		TrackGeometry:       trackGeometry,
		RaceStartTime:       raceStartTime,
		WeatherData:         weatherData,
		RaceControlMessages: raceControlMaps,
		QualiSegments:       rawPayload.QualiSegments,
	}
	if writeErr := cacheReader.WriteFrames(year, round, sessionType, frames, cacheMeta); writeErr != nil {
		logger.Warn("failed to write f1cache", zap.Error(writeErr), zap.String("sessionID", sessionID))
	} else if cacheFilePath != "" {
		os.Remove(cacheFilePath)
	}

	sessionMeta := models.SessionMetadata{
		Year:                year,
		Round:               round,
		SessionType:         sessionType,
		TotalLaps:           rawPayload.TotalLaps,
		TotalFrames:         len(frames),
		DriverNumbers:       rawPayload.DriverNumbers,
		DriverTeams:         rawPayload.DriverTeams,
		DriverColors:        rawPayload.DriverColors,
		TrackStatuses:       trackStatusMaps,
		TrackGeometry:       trackGeometry,
		RaceStartTime:       raceStartTime,
		WeatherData:         weatherData,
		RaceControlMessages: raceControlMaps,
		QualiSegments:       rawPayload.QualiSegments,
	}

	// Update session with generated frames
	sess.SetFrames(frames)
	sess.SetMetadata(sessionMeta)
	sess.SetState(models.StateReady)

	logger.Info("cache generation complete",
		zap.String("sessionID", sessionID),
		zap.Int("frames", len(frames)),
	)
}

func handleStaticFile(relativePath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, relativePath)
	}
}

func handleFastF1DebugTest(logger *zap.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		year := r.URL.Query().Get("year")
		roundNum := r.URL.Query().Get("round_num")
		sessionType := r.URL.Query().Get("session_type")
		method := r.URL.Query().Get("method")
		driverCode := r.URL.Query().Get("driver_code")

		if year == "" || roundNum == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "year and round_num are required"})
			return
		}
		if sessionType == "" {
			sessionType = "R"
		}
		if method == "" {
			method = "load_session"
		}

		noCache := r.URL.Query().Get("no_cache")

		args := []string{"scripts/fastf1_debug_test.py"}
		if noCache == "true" || noCache == "1" {
			args = append(args, "--no-cache")
		}
		args = append(args, year, roundNum, sessionType, method)
		if driverCode != "" {
			args = append(args, driverCode)
		}

		cmd := exec.Command("python3", args...)
		var stdout, stderr bytes.Buffer
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr

		logger.Info("Running FastF1 debug test",
			zap.String("method", method),
			zap.String("year", year),
			zap.String("round", roundNum),
		)

		if err := cmd.Run(); err != nil {
			logger.Error("FastF1 debug test failed", zap.Error(err), zap.String("stderr", stderr.String()))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("Script failed: %s", stderr.String())})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write(stdout.Bytes())
	}
}

// handlePythonTelemetry creates a handler that runs a Python script for telemetry comparison data.
// The request body must have: year, round_num, session_type, driver_codes, lap_numbers.
func handlePythonTelemetry(scriptPath string, logger *zap.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Year        int      `json:"year"`
			RoundNum    int      `json:"round_num"`
			SessionType string   `json:"session_type"`
			DriverCodes []string `json:"driver_codes"`
			LapNumbers  []int    `json:"lap_numbers"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
			return
		}

		if len(req.DriverCodes) == 0 || len(req.LapNumbers) == 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "driver_codes and lap_numbers are required"})
			return
		}

		// Build comma-separated lists
		driverCodesStr := strings.Join(req.DriverCodes, ",")
		lapNumbersStr := make([]string, len(req.LapNumbers))
		for i, ln := range req.LapNumbers {
			lapNumbersStr[i] = fmt.Sprintf("%d", ln)
		}
		lapsStr := strings.Join(lapNumbersStr, ",")

		cmd := exec.Command("python3", scriptPath,
			fmt.Sprintf("%d", req.Year),
			fmt.Sprintf("%d", req.RoundNum),
			req.SessionType,
			driverCodesStr,
			lapsStr,
		)

		var stdout, stderr bytes.Buffer
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr

		logger.Info("Running telemetry script",
			zap.String("script", scriptPath),
			zap.Int("year", req.Year),
			zap.Int("round", req.RoundNum),
			zap.Strings("drivers", req.DriverCodes),
		)

		if err := cmd.Run(); err != nil {
			logger.Error("telemetry script failed",
				zap.String("script", scriptPath),
				zap.Error(err),
				zap.String("stderr", stderr.String()),
			)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("Failed to get telemetry data: %s", stderr.String())})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write(stdout.Bytes())
	}
}
