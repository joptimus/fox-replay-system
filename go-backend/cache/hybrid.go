package cache

import (
	"fmt"

	"f1-replay-go/models"
	"go.uber.org/zap"
)

// HybridCacheReader supports both old msgpack and new f1cache formats
type HybridCacheReader struct {
	cachePath        string
	msgpackReader    *MsgpackCacheReader
	f1cacheReader    *F1CacheReader
	f1cacheWriter    *F1CacheWriter
	logger            *zap.Logger
}

// NewHybridCacheReader creates a hybrid cache reader supporting both formats
func NewHybridCacheReader(cachePath string, logger *zap.Logger) *HybridCacheReader {
	return &HybridCacheReader{
		cachePath:     cachePath,
		msgpackReader: NewMsgpackCacheReader(cachePath),
		f1cacheReader: NewF1CacheReader(cachePath),
		f1cacheWriter: NewF1CacheWriter(cachePath),
		logger:        logger,
	}
}

// ReadFrames tries to read from .f1cache first, falls back to .msgpack
func (h *HybridCacheReader) ReadFrames(year, round int, sessionType string) ([]models.Frame, error) {
	// Try new .f1cache format first
	f1cacheFilename := GetF1CacheFilename(year, round, sessionType)
	if h.f1cacheReader.F1CacheExists(f1cacheFilename) {
		h.logger.Info("Loading from .f1cache",
			zap.String("filename", f1cacheFilename))

		frames, _, err := h.f1cacheReader.ReadCache(f1cacheFilename)
		if err == nil {
			h.logger.Info("Loaded from .f1cache successfully",
				zap.String("filename", f1cacheFilename),
				zap.Int("frames", len(frames)))
			return frames, nil
		}

		// If .f1cache is corrupted, log and fall through
		h.logger.Warn("Failed to read .f1cache, trying fallback",
			zap.Error(err),
			zap.String("filename", f1cacheFilename))
	}

	// Fall back to old .msgpack format
	msgpackFilename := GetCacheFilename(year, round, sessionType)
	if h.msgpackReader.CacheExists(msgpackFilename) {
		h.logger.Info("Loading from .msgpack (legacy format)",
			zap.String("filename", msgpackFilename))

		frames, err := h.msgpackReader.ReadFrames(msgpackFilename)
		if err != nil {
			h.logger.Error("Failed to read .msgpack cache",
				zap.Error(err),
				zap.String("filename", msgpackFilename))
			return nil, err
		}

		h.logger.Info("Loaded from .msgpack successfully",
			zap.String("filename", msgpackFilename),
			zap.Int("frames", len(frames)))

		// Optionally: migrate to new format in background
		go h.migrateToF1Cache(year, round, sessionType, frames)

		return frames, nil
	}

	return nil, fmt.Errorf("no cache found for %d R%d %s", year, round, sessionType)
}

// WriteFrames writes frames to new .f1cache format
func (h *HybridCacheReader) WriteFrames(
	year, round int,
	sessionType string,
	frames []models.Frame,
	metadata F1CacheMetadata,
) error {
	filename := GetF1CacheFilename(year, round, sessionType)

	h.logger.Info("Writing cache to .f1cache",
		zap.String("filename", filename),
		zap.Int("frames", len(frames)))

	if err := h.f1cacheWriter.WriteCache(filename, frames, metadata); err != nil {
		h.logger.Error("Failed to write .f1cache",
			zap.Error(err),
			zap.String("filename", filename))
		return err
	}

	h.logger.Info("Cache written to .f1cache successfully",
		zap.String("filename", filename))

	return nil
}

// migrateToF1Cache migrates old msgpack cache to new f1cache format (background)
func (h *HybridCacheReader) migrateToF1Cache(
	year, round int,
	sessionType string,
	frames []models.Frame,
) {
	metadata := F1CacheMetadata{
		Year:        year,
		Round:       round,
		SessionType: sessionType,
		TotalFrames: len(frames),
		TotalLaps:   0,
	}

	// Calculate total laps from frames
	maxLap := 0
	for _, frame := range frames {
		if frame.Lap > maxLap {
			maxLap = frame.Lap
		}
	}
	metadata.TotalLaps = maxLap

	if err := h.WriteFrames(year, round, sessionType, frames, metadata); err != nil {
		h.logger.Warn("Failed to migrate to .f1cache",
			zap.Error(err),
			zap.Int("year", year),
			zap.Int("round", round),
			zap.String("sessionType", sessionType))
	} else {
		h.logger.Info("Migrated to .f1cache successfully",
			zap.Int("year", year),
			zap.Int("round", round),
			zap.String("sessionType", sessionType))
	}
}

// DeleteCaches deletes both .f1cache and .msgpack files matching a pattern
func (h *HybridCacheReader) DeleteCaches(pattern string) error {
	// Delete .f1cache files
	if err := h.f1cacheWriter.DeleteF1Caches(pattern + ".f1cache"); err != nil {
		h.logger.Error("Failed to delete .f1cache files", zap.Error(err))
		return err
	}

	// Delete old .msgpack files
	if err := h.msgpackReader.DeleteCache(pattern + ".msgpack"); err != nil {
		h.logger.Error("Failed to delete .msgpack files", zap.Error(err))
		return err
	}

	return nil
}
