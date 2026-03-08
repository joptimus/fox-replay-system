package tests

import (
	"os"
	"path/filepath"
	"testing"

	"f1-replay-go/cache"
	"f1-replay-go/models"
	"github.com/stretchr/testify/assert"
	"github.com/vmihailenco/msgpack/v5"
)

func TestMsgpackCacheReader(t *testing.T) {
	// Create temporary cache directory
	tmpDir := t.TempDir()

	// Create a test cache file
	testFrames := []models.Frame{
		{
			FrameIndex: 0,
			T:          1234.0,
			Lap:        1,
			Drivers: map[string]models.DriverData{
				"NOR": {
					X:        -1046.2,
					Y:        -1475.7,
					Speed:    250.5,
					Lap:      1,
					Position: 1,
				},
			},
		},
		{
			FrameIndex: 1,
			T:          1234.04,
			Lap:        1,
			Drivers: map[string]models.DriverData{
				"NOR": {
					X:        -1050.0,
					Y:        -1480.0,
					Speed:    251.0,
					Lap:      1,
					Position: 1,
				},
			},
		},
	}

	// Write test frames to msgpack file
	testFilename := "test_telemetry.msgpack"
	testFilePath := filepath.Join(tmpDir, testFilename)

	file, err := os.Create(testFilePath)
	assert.NoError(t, err)
	defer file.Close()

	enc := msgpack.NewEncoder(file)
	err = enc.Encode(testFrames)
	assert.NoError(t, err)

	// Test cache reader
	reader := cache.NewMsgpackCacheReader(tmpDir)

	// Test CacheExists
	exists := reader.CacheExists(testFilename)
	assert.True(t, exists, "Cache file should exist")

	// Test ReadFrames
	frames, err := reader.ReadFrames(testFilename)
	assert.NoError(t, err)
	assert.Equal(t, len(testFrames), len(frames), "Should have same number of frames")

	// Validate frame structure
	assert.Equal(t, 0, frames[0].FrameIndex)
	assert.Equal(t, 1234.0, frames[0].T)
	assert.Equal(t, 1, frames[0].Lap)
	assert.Greater(t, len(frames[0].Drivers), 0, "Frame should have drivers")

	// Validate driver data
	norData, ok := frames[0].Drivers["NOR"]
	assert.True(t, ok, "Should have NOR driver data")
	assert.Equal(t, -1046.2, norData.X)
	assert.Equal(t, 250.5, norData.Speed)

	// Test GetCacheFilename
	filename := cache.GetCacheFilename(2025, 1, "R")
	assert.Equal(t, "2025_r1_R_telemetry.msgpack", filename)

	// Test DeleteCache
	err = reader.DeleteCache("test_*.msgpack")
	assert.NoError(t, err)

	// Verify file was deleted
	exists = reader.CacheExists(testFilename)
	assert.False(t, exists, "Cache file should be deleted")
}

func TestGetCacheFilename(t *testing.T) {
	tests := []struct {
		year        int
		round       int
		sessionType string
		expected    string
	}{
		{2025, 1, "R", "2025_r1_R_telemetry.msgpack"},
		{2025, 12, "Q", "2025_r12_Q_telemetry.msgpack"},
		{2024, 22, "S", "2024_r22_S_telemetry.msgpack"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			result := cache.GetCacheFilename(tt.year, tt.round, tt.sessionType)
			assert.Equal(t, tt.expected, result)
		})
	}
}
