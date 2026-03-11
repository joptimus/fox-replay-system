package cache

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"f1-replay-go/models"
	"github.com/pierrec/lz4/v4"
	"github.com/vmihailenco/msgpack/v5"
)

const (
	// .f1cache format constants
	F1CacheMagic   = "F1CR" // 4 bytes magic number
	F1CacheVersion = 1      // 1 byte version
)

// F1CacheMetadata stores session-level information in the cache file
type F1CacheMetadata struct {
	Year          int                         `json:"year"`
	Round         int                         `json:"round"`
	SessionType   string                      `json:"session_type"`
	TotalFrames   int                         `json:"total_frames"`
	TotalLaps     int                         `json:"total_laps"`
	DriverNumbers map[string]string           `json:"driver_numbers,omitempty"`
	DriverTeams   map[string]string           `json:"driver_teams,omitempty"`
	DriverColors  map[string][3]int           `json:"driver_colors,omitempty"`
	TrackStatuses []map[string]interface{}    `json:"track_statuses,omitempty"`
	TrackGeometry map[string]interface{}      `json:"track_geometry,omitempty"`
	RaceStartTime *float64                    `json:"race_start_time,omitempty"`
	WeatherData   map[string]interface{}      `json:"weather_data,omitempty"`
	QualiSegments map[string]interface{}      `json:"quali_segments,omitempty"`
}

// F1CacheWriter writes frames to .f1cache format (binary + LZ4 compression)
type F1CacheWriter struct {
	cachePath string
}

// F1CacheReader reads frames from .f1cache format
type F1CacheReader struct {
	cachePath string
}

// NewF1CacheWriter creates a new F1 cache writer
func NewF1CacheWriter(cachePath string) *F1CacheWriter {
	return &F1CacheWriter{cachePath: cachePath}
}

// NewF1CacheReader creates a new F1 cache reader
func NewF1CacheReader(cachePath string) *F1CacheReader {
	return &F1CacheReader{cachePath: cachePath}
}

// WriteCache writes frames to a .f1cache file with LZ4 compression
func (w *F1CacheWriter) WriteCache(
	filename string,
	frames []models.Frame,
	metadata F1CacheMetadata,
) error {
	if len(frames) == 0 {
		return fmt.Errorf("cannot write cache with no frames")
	}

	filePath := filepath.Join(w.cachePath, filename)

	// Create a buffer to hold compressed data
	var compressedBuf bytes.Buffer

	// Write header
	compressedBuf.WriteString(F1CacheMagic)
	compressedBuf.WriteByte(F1CacheVersion)

	// Write metadata as JSON
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	// Write metadata length (4 bytes, little-endian)
	metadataLen := uint32(len(metadataJSON))
	binary.Write(&compressedBuf, binary.LittleEndian, metadataLen)
	compressedBuf.Write(metadataJSON)

	// Encode frames to msgpack
	frameData := new(bytes.Buffer)
	enc := msgpack.NewEncoder(frameData)
	if err := enc.Encode(frames); err != nil {
		return fmt.Errorf("failed to encode frames: %w", err)
	}

	// Compress frame data with LZ4
	compressionBuf := new(bytes.Buffer)
	zw := lz4.NewWriter(compressionBuf)
	if _, err := zw.Write(frameData.Bytes()); err != nil {
		return fmt.Errorf("failed to compress frames: %w", err)
	}
	if err := zw.Close(); err != nil {
		return fmt.Errorf("failed to close compressor: %w", err)
	}

	// Write compressed frame data length (4 bytes, little-endian)
	compressedFrameLen := uint32(compressionBuf.Len())
	binary.Write(&compressedBuf, binary.LittleEndian, compressedFrameLen)
	compressedBuf.Write(compressionBuf.Bytes())

	// Write to file
	if err := os.WriteFile(filePath, compressedBuf.Bytes(), 0644); err != nil {
		return fmt.Errorf("failed to write cache file: %w", err)
	}

	return nil
}

// ReadCache reads frames from a .f1cache file with LZ4 decompression
func (r *F1CacheReader) ReadCache(filename string) ([]models.Frame, *F1CacheMetadata, error) {
	filePath := filepath.Join(r.cachePath, filename)

	// Read file
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read cache file: %w", err)
	}

	buf := bytes.NewReader(data)

	// Read and verify magic
	magic := make([]byte, 4)
	if _, err := buf.Read(magic); err != nil {
		return nil, nil, fmt.Errorf("failed to read magic: %w", err)
	}
	if string(magic) != F1CacheMagic {
		return nil, nil, fmt.Errorf("invalid cache magic: expected %s, got %s", F1CacheMagic, string(magic))
	}

	// Read and verify version
	version := make([]byte, 1)
	if _, err := buf.Read(version); err != nil {
		return nil, nil, fmt.Errorf("failed to read version: %w", err)
	}
	if version[0] != F1CacheVersion {
		return nil, nil, fmt.Errorf("unsupported cache version: %d", version[0])
	}

	// Read metadata
	var metadataLen uint32
	if err := binary.Read(buf, binary.LittleEndian, &metadataLen); err != nil {
		return nil, nil, fmt.Errorf("failed to read metadata length: %w", err)
	}

	metadataJSON := make([]byte, metadataLen)
	if _, err := buf.Read(metadataJSON); err != nil {
		return nil, nil, fmt.Errorf("failed to read metadata: %w", err)
	}

	metadata := &F1CacheMetadata{}
	if err := json.Unmarshal(metadataJSON, metadata); err != nil {
		return nil, nil, fmt.Errorf("failed to unmarshal metadata: %w", err)
	}

	// Read compressed frame data length
	var compressedFrameLen uint32
	if err := binary.Read(buf, binary.LittleEndian, &compressedFrameLen); err != nil {
		return nil, nil, fmt.Errorf("failed to read compressed frame length: %w", err)
	}

	compressedFrameData := make([]byte, compressedFrameLen)
	if _, err := buf.Read(compressedFrameData); err != nil {
		return nil, nil, fmt.Errorf("failed to read compressed frames: %w", err)
	}

	// Decompress frames
	decompressedBuf := new(bytes.Buffer)
	zr := lz4.NewReader(bytes.NewReader(compressedFrameData))
	if _, err := io.Copy(decompressedBuf, zr); err != nil {
		return nil, nil, fmt.Errorf("failed to decompress frames: %w", err)
	}

	// Decode frames from msgpack
	var frames []models.Frame
	dec := msgpack.NewDecoder(decompressedBuf)
	if err := dec.Decode(&frames); err != nil {
		return nil, nil, fmt.Errorf("failed to decode frames: %w", err)
	}

	return frames, metadata, nil
}

// GetF1CacheFilename generates a .f1cache filename from session parameters
func GetF1CacheFilename(year int, roundNum int, sessionType string) string {
	return fmt.Sprintf("%d_r%d_%s_telemetry.f1cache", year, roundNum, sessionType)
}

// F1CacheExists checks if a .f1cache file exists
func (r *F1CacheReader) F1CacheExists(filename string) bool {
	filePath := filepath.Join(r.cachePath, filename)
	_, err := os.Stat(filePath)
	return err == nil
}

// DeleteF1Caches deletes .f1cache files matching a pattern
func (w *F1CacheWriter) DeleteF1Caches(pattern string) error {
	matches, err := filepath.Glob(filepath.Join(w.cachePath, pattern))
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

// ListF1Caches lists all available .f1cache files
func (r *F1CacheReader) ListF1Caches() ([]string, error) {
	files, err := os.ReadDir(r.cachePath)
	if err != nil {
		return nil, err
	}

	var caches []string
	for _, f := range files {
		if !f.IsDir() && filepath.Ext(f.Name()) == ".f1cache" {
			caches = append(caches, f.Name())
		}
	}

	return caches, nil
}

// MigrateFromMsgpack converts old .msgpack cache files to new .f1cache format
func (w *F1CacheWriter) MigrateFromMsgpack(
	msgpackFilename string,
	f1cacheFilename string,
	metadata F1CacheMetadata,
	msgpackReader *MsgpackCacheReader,
) error {
	// Read msgpack cache
	frames, err := msgpackReader.ReadFrames(msgpackFilename)
	if err != nil {
		return fmt.Errorf("failed to read msgpack cache: %w", err)
	}

	// Write as f1cache
	return w.WriteCache(f1cacheFilename, frames, metadata)
}
