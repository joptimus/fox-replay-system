package tests

import (
	"testing"

	"f1-replay-go/models"
	"f1-replay-go/telemetry"
	"github.com/stretchr/testify/assert"
)

func TestSortPositions(t *testing.T) {
	// Create test frame with drivers
	frame := models.Frame{
		T:   1234.0,
		Lap: 1,
		Drivers: map[string]models.DriverData{
			"NOR": {
				Speed: 250.0,
				Dist:  1000.0,
			},
			"LEC": {
				Speed: 249.0,
				Dist:  900.0,
			},
			"VER": {
				Speed: 251.0,
				Dist:  1100.0,
			},
		},
	}

	// Simple test: sort by distance
	sortedCodes := telemetry.SortPositions(&frame)

	assert.Equal(t, 3, len(sortedCodes), "Should have 3 drivers")
	// VER has highest distance, should be first (position 1)
	assert.Equal(t, "VER", sortedCodes[0])
	assert.Equal(t, "NOR", sortedCodes[1])
	assert.Equal(t, "LEC", sortedCodes[2])
}

func TestSortPositionsWith4Tier(t *testing.T) {
	// Test 4-tier sorting hierarchy
	posRaw1 := 1
	posRaw2 := 2
	gap1 := 0.0
	gap2 := 1.5

	frame := models.Frame{
		T:   1234.0,
		Lap: 1,
		Drivers: map[string]models.DriverData{
			"NOR": {
				PosRaw:         &posRaw1,
				IntervalSmooth: &gap1,
				Speed:          250.0,
				Dist:           1000.0,
				RaceProgress:   0.5,
			},
			"LEC": {
				PosRaw:         &posRaw2,
				IntervalSmooth: &gap2,
				Speed:          249.0,
				Dist:           900.0,
				RaceProgress:   0.4,
			},
		},
	}

	sortedCodes := telemetry.SortPositions(&frame)

	// NOR has pos_raw=1, LEC has pos_raw=2
	// Tier 1 should sort NOR first
	assert.Equal(t, "NOR", sortedCodes[0])
	assert.Equal(t, "LEC", sortedCodes[1])
}

func TestPositionSmoothing(t *testing.T) {
	smoother := telemetry.NewPositionSmoothing()

	// Simulate rapid position changes
	sortedCodes1 := []string{"NOR", "LEC", "VER"}
	sortedCodes2 := []string{"LEC", "NOR", "VER"} // Swap NOR and LEC

	drivers := map[string]models.DriverData{
		"NOR": {Speed: 250.0, Dist: 1000.0},
		"LEC": {Speed: 249.0, Dist: 999.0},
		"VER": {Speed: 251.0, Dist: 1100.0},
	}

	// Apply first order
	result1 := smoother.ApplyHysteresis(sortedCodes1, drivers, 0.0, "1")
	assert.Equal(t, sortedCodes1, result1)

	// Apply second order immediately (should be rejected due to hysteresis)
	result2 := smoother.ApplyHysteresis(sortedCodes2, drivers, 0.5, "1") // 0.5s < 1.0s threshold
	assert.NotEqual(t, sortedCodes2, result2, "Position change should be blocked by hysteresis")

	// Apply after threshold has passed
	result3 := smoother.ApplyHysteresis(sortedCodes2, drivers, 1.5, "1") // 1.5s > 1.0s threshold
	assert.Equal(t, len(result3), 3, "Should have all drivers after threshold")
}

func TestPositionSmoothingUnderSafetyCar(t *testing.T) {
	// Under safety car, threshold should be lower (0.3s instead of 1.0s)
	smoother := telemetry.NewPositionSmoothing()

	sortedCodes1 := []string{"NOR", "LEC"}
	sortedCodes2 := []string{"LEC", "NOR"}

	drivers := map[string]models.DriverData{
		"NOR": {Speed: 100.0, Dist: 1000.0},
		"LEC": {Speed: 100.0, Dist: 999.0},
	}

	// Apply first order
	smoother.ApplyHysteresis(sortedCodes1, drivers, 0.0, "1")

	// Apply second order with safety car (status "4")
	// At t=0.2s, should still be blocked (< 0.3s)
	result := smoother.ApplyHysteresis(sortedCodes2, drivers, 0.2, "4")
	assert.NotEqual(t, sortedCodes2, result, "Should still be blocked at 0.2s")

	// At t=0.35s, should be allowed (> 0.3s)
	result = smoother.ApplyHysteresis(sortedCodes2, drivers, 0.35, "4")
	assert.Equal(t, 2, len(result), "Should allow change after 0.3s under SC")
}

func TestCalculateGaps(t *testing.T) {
	frame := models.Frame{
		T:   1234.0,
		Lap: 1,
		Drivers: map[string]models.DriverData{
			"VER": {
				Position: 1,
				Dist:     5000.0,
				Speed:    250.0, // km/h
			},
			"NOR": {
				Position: 2,
				Dist:     4950.0,
				Speed:    250.0,
			},
			"LEC": {
				Position: 3,
				Dist:     4900.0,
				Speed:    250.0,
			},
		},
	}

	telemetry.CalculateGaps(&frame)

	// VER is leader, gap to leader should be 0
	verGap := frame.Drivers["VER"].GapToLeader
	assert.Equal(t, 0.0, verGap)

	// NOR is 50m behind VER at 250 km/h
	// 250 km/h = 250,000 m/h = 69.44 m/s
	// 50m / 69.44 m/s ≈ 0.72 seconds
	norGap := frame.Drivers["NOR"].GapToLeader
	assert.Greater(t, norGap, 0.0)
	assert.Less(t, norGap, 1.0)

	// NOR gap to VER should be same as gap to leader
	norGapToPrev := frame.Drivers["NOR"].GapToPrevious
	assert.AlmostEqual(t, norGap, norGapToPrev, 0.01)

	// LEC gap to previous (NOR) should be smaller than gap to leader
	lecGapToPrev := frame.Drivers["LEC"].GapToPrevious
	lecGapToLeader := frame.Drivers["LEC"].GapToLeader
	assert.Less(t, lecGapToPrev, lecGapToLeader)
}

func TestRetirementDetection(t *testing.T) {
	tracker := telemetry.NewRetirementTracker()

	// Create frame with driver at 0 speed
	frame := models.Frame{
		T:   0.0,
		Lap: 1,
		Drivers: map[string]models.DriverData{
			"HAM": {
				Speed:    0.0,
				Position: 1,
				Status:   "Active",
			},
		},
	}

	// Update frame multiple times (need 250 consecutive frames to retire)
	for i := 0; i < telemetry.RetirementFrameThreshold+1; i++ {
		frame.T = float64(i) * 0.04 // 25 FPS
		tracker.UpdateFrame(&frame)
	}

	// After threshold, status should be "Retired"
	retired := tracker.GetRetiredDrivers()
	assert.Contains(t, retired, "HAM")

	// Check frame driver status
	hamData := frame.Drivers["HAM"]
	assert.Equal(t, "Retired", hamData.Status)
}

func TestRetirementDetectionInterrupted(t *testing.T) {
	// If driver moves before threshold, counter should reset
	tracker := telemetry.NewRetirementTracker()

	frame := models.Frame{
		T:   0.0,
		Lap: 1,
		Drivers: map[string]models.DriverData{
			"HAM": {
				Speed:    0.0,
				Position: 1,
				Status:   "Active",
			},
		},
	}

	// 100 frames at 0 speed
	for i := 0; i < 100; i++ {
		frame.T = float64(i) * 0.04
		tracker.UpdateFrame(&frame)
	}

	// Driver moves
	frame.Drivers["HAM"] = models.DriverData{
		Speed:    100.0, // Moving again
		Position: 1,
		Status:   "Active",
	}
	tracker.UpdateFrame(&frame)

	// Should not be retired yet (counter reset)
	retired := tracker.GetRetiredDrivers()
	assert.NotContains(t, retired, "HAM")
}

func TestValidatePositionData(t *testing.T) {
	// Valid position data
	validFrame := models.Frame{
		Drivers: map[string]models.DriverData{
			"NOR": {Position: 1},
			"LEC": {Position: 2},
			"VER": {Position: 3},
		},
	}

	err := telemetry.ValidatePositionData(&validFrame)
	assert.NoError(t, err)

	// Invalid: duplicate position
	invalidFrame := models.Frame{
		Drivers: map[string]models.DriverData{
			"NOR": {Position: 1},
			"LEC": {Position: 1}, // Duplicate
		},
	}

	err = telemetry.ValidatePositionData(&invalidFrame)
	assert.Error(t, err)

	// Invalid: negative position
	badPositionFrame := models.Frame{
		Drivers: map[string]models.DriverData{
			"NOR": {Position: -1},
		},
	}

	err = telemetry.ValidatePositionData(&badPositionFrame)
	assert.Error(t, err)
}
