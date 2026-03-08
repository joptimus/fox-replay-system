package tests

import (
	"os"
	"path/filepath"
	"testing"

	"f1-replay-go/cache"
	"f1-replay-go/models"
	"github.com/stretchr/testify/assert"
)

func TestF1CacheWriteRead(t *testing.T) {
	// Create temporary cache directory
	tmpDir := t.TempDir()

	// Create test frames
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
					Tyre:     0,
					Gear:     3,
					DRS:      0,
				},
				"LEC": {
					X:        -1050.0,
					Y:        -1480.0,
					Speed:    249.0,
					Lap:      1,
					Position: 2,
					Tyre:     0,
					Gear:     3,
					DRS:      0,
				},
			},
		},
		{
			FrameIndex: 1,
			T:          1234.04,
			Lap:        1,
			Drivers: map[string]models.DriverData{
				"NOR": {
					X:        -1046.5,
					Y:        -1475.8,
					Speed:    251.0,
					Lap:      1,
					Position: 1,
					Tyre:     0,
					Gear:     3,
					DRS:      0,
				},
				"LEC": {
					X:        -1050.5,
					Y:        -1480.5,
					Speed:    249.5,
					Lap:      1,
					Position: 2,
					Tyre:     0,
					Gear:     3,
					DRS:      0,
				},
			},
		},
	}

	// Create metadata
	metadata := cache.F1CacheMetadata{
		Year:        2025,
		Round:       1,
		SessionType: "R",
		TotalFrames: len(testFrames),
		TotalLaps:   57,
	}

	// Test write
	writer := cache.NewF1CacheWriter(tmpDir)
	filename := "test_2025_r1_R_telemetry.f1cache"

	err := writer.WriteCache(filename, testFrames, metadata)
	assert.NoError(t, err, "WriteCache should not error")

	// Verify file exists
	filePath := filepath.Join(tmpDir, filename)
	_, err = os.Stat(filePath)
	assert.NoError(t, err, "Cache file should exist")

	// Test read
	reader := cache.NewF1CacheReader(tmpDir)
	readFrames, readMetadata, err := reader.ReadCache(filename)
	assert.NoError(t, err, "ReadCache should not error")

	// Verify frame count
	assert.Equal(t, len(testFrames), len(readFrames), "Should have same number of frames")

	// Verify metadata
	assert.Equal(t, metadata.Year, readMetadata.Year)
	assert.Equal(t, metadata.Round, readMetadata.Round)
	assert.Equal(t, metadata.SessionType, readMetadata.SessionType)
	assert.Equal(t, metadata.TotalFrames, readMetadata.TotalFrames)
	assert.Equal(t, metadata.TotalLaps, readMetadata.TotalLaps)

	// Verify frame data
	frame0 := readFrames[0]
	assert.Equal(t, 0, frame0.FrameIndex)
	assert.Equal(t, 1234.0, frame0.T)
	assert.Equal(t, 1, frame0.Lap)

	norData, ok := frame0.Drivers["NOR"]
	assert.True(t, ok, "Should have NOR driver")
	assert.Equal(t, -1046.2, norData.X)
	assert.Equal(t, 250.5, norData.Speed)
	assert.Equal(t, 1, norData.Position)

	lecData, ok := frame0.Drivers["LEC"]
	assert.True(t, ok, "Should have LEC driver")
	assert.Equal(t, -1050.0, lecData.X)
	assert.Equal(t, 249.0, lecData.Speed)
	assert.Equal(t, 2, lecData.Position)
}

func TestF1CacheCompressionBenefit(t *testing.T) {
	// This test demonstrates compression benefits
	tmpDir := t.TempDir()

	// Create many frames to show compression benefit
	testFrames := make([]models.Frame, 1000)
	for i := 0; i < 1000; i++ {
		frame := models.Frame{
			FrameIndex: i,
			T:          1234.0 + float64(i)*0.04,
			Lap:        1 + i/100,
			Drivers:    make(map[string]models.DriverData),
		}

		// Add 20 drivers per frame
		for j := 0; j < 20; j++ {
			code := []string{"VER", "HAM", "NOR", "LEC", "RUS", "ALO", "PIA", "STR",
				"GAS", "HUL", "BOT", "ZHO", "MAG", "TSU", "OCO", "ARB", "COL",
				"SAR", "ODE", "DEV"}[j%20]

			frame.Drivers[code] = models.DriverData{
				X:        float64(j) * 10,
				Y:        float64(i) * 5,
				Speed:    200.0 + float64(j),
				Lap:      1 + i/100,
				Position: j + 1,
				Tyre:     0,
				Gear:     3,
				DRS:      0,
				RPM:      9000 + j*100,
			}
		}

		testFrames[i] = frame
	}

	metadata := cache.F1CacheMetadata{
		Year:        2025,
		Round:       1,
		SessionType: "R",
		TotalFrames: len(testFrames),
		TotalLaps:   57,
	}

	// Write and check file size
	writer := cache.NewF1CacheWriter(tmpDir)
	filename := "compression_test.f1cache"

	err := writer.WriteCache(filename, testFrames, metadata)
	assert.NoError(t, err)

	filePath := filepath.Join(tmpDir, filename)
	info, err := os.Stat(filePath)
	assert.NoError(t, err)

	compressedSize := info.Size()

	// Read back and verify
	reader := cache.NewF1CacheReader(tmpDir)
	readFrames, _, err := reader.ReadCache(filename)
	assert.NoError(t, err)
	assert.Equal(t, len(testFrames), len(readFrames))

	// Log compression ratio for reference
	t.Logf("Compressed file size: %d bytes for %d frames with 20 drivers each", compressedSize, len(testFrames))
	t.Logf("Average size per frame: %.1f bytes", float64(compressedSize)/float64(len(testFrames)))
}

func TestF1CacheFilenameGeneration(t *testing.T) {
	tests := []struct {
		year        int
		round       int
		sessionType string
		expected    string
	}{
		{2025, 1, "R", "2025_r1_R_telemetry.f1cache"},
		{2025, 12, "Q", "2025_r12_Q_telemetry.f1cache"},
		{2024, 22, "S", "2024_r22_S_telemetry.f1cache"},
		{2025, 5, "SQ", "2025_r5_SQ_telemetry.f1cache"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			result := cache.GetF1CacheFilename(tt.year, tt.round, tt.sessionType)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestF1CacheCorruption(t *testing.T) {
	// Test that corrupted cache files are handled gracefully
	tmpDir := t.TempDir()

	// Write some garbage to a file with .f1cache extension
	corruptFilename := "corrupt.f1cache"
	filePath := filepath.Join(tmpDir, corruptFilename)
	err := os.WriteFile(filePath, []byte("corrupted data here"), 0644)
	assert.NoError(t, err)

	// Try to read corrupted cache
	reader := cache.NewF1CacheReader(tmpDir)
	_, _, err = reader.ReadCache(corruptFilename)
	assert.Error(t, err, "Should error on corrupted cache")
	assert.Contains(t, err.Error(), "magic")
}

func TestF1CacheVersionCheck(t *testing.T) {
	// Test that version mismatches are detected
	tmpDir := t.TempDir()

	// Write a cache file with wrong version
	badVersionFilename := "bad_version.f1cache"
	filePath := filepath.Join(tmpDir, badVersionFilename)

	// Write magic + wrong version
	data := []byte("F1CR")
	data = append(data, 99) // Wrong version

	err := os.WriteFile(filePath, data, 0644)
	assert.NoError(t, err)

	// Try to read with wrong version
	reader := cache.NewF1CacheReader(tmpDir)
	_, _, err = reader.ReadCache(badVersionFilename)
	assert.Error(t, err, "Should error on wrong version")
	assert.Contains(t, err.Error(), "version")
}
