package cache

import (
	"fmt"
	"os"
	"path/filepath"

	"f1-replay-go/models"
	"github.com/vmihailenco/msgpack/v5"
)

// MsgpackCacheReader reads msgpack-encoded frame caches
type MsgpackCacheReader struct {
	cachePath string
}

// NewMsgpackCacheReader creates a new msgpack cache reader
func NewMsgpackCacheReader(cachePath string) *MsgpackCacheReader {
	return &MsgpackCacheReader{cachePath: cachePath}
}

// ReadFrames reads frames from a msgpack cache file
func (m *MsgpackCacheReader) ReadFrames(filename string) ([]models.Frame, error) {
	filePath := filepath.Join(m.cachePath, filename)

	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open cache file: %w", err)
	}
	defer file.Close()

	dec := msgpack.NewDecoder(file)
	var frames []models.Frame

	if err := dec.Decode(&frames); err != nil {
		return nil, fmt.Errorf("failed to decode msgpack: %w", err)
	}

	return frames, nil
}

// CacheExists checks if a cache file exists
func (m *MsgpackCacheReader) CacheExists(filename string) bool {
	filePath := filepath.Join(m.cachePath, filename)
	_, err := os.Stat(filePath)
	return err == nil
}

// DeleteCache deletes cache files matching a pattern
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

// GetCacheFilename generates a cache filename from session parameters
func GetCacheFilename(year int, roundNum int, sessionType string) string {
	return fmt.Sprintf("%d_r%d_%s_telemetry.msgpack", year, roundNum, sessionType)
}

// ListCaches lists all available cache files
func (m *MsgpackCacheReader) ListCaches() ([]string, error) {
	files, err := os.ReadDir(m.cachePath)
	if err != nil {
		return nil, err
	}

	var caches []string
	for _, f := range files {
		if !f.IsDir() && filepath.Ext(f.Name()) == ".msgpack" {
			caches = append(caches, f.Name())
		}
	}

	return caches, nil
}
