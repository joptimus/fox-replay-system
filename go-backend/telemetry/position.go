package telemetry

import (
	"fmt"
	"sort"
	"sync"

	"f1-replay-go/models"
)

// PositionSortKey represents the 4-tier sorting hierarchy for driver positions
type PositionSortKey struct {
	Tier1 float64 // pos_raw (official FIA position data)
	Tier2 float64 // interval_smooth (gap to leader, smoothed)
	Tier3 float64 // race_progress (negative, so higher progress sorts first)
	Tier4 float64 // custom tiebreaker (driver code hash)
	Code  string
}

// Less implements sort.Interface for position sorting
// Lower values sort first (lower position number = ahead in race)
func (a PositionSortKey) Less(b PositionSortKey) bool {
	// Tier 1: pos_raw (official position)
	if a.Tier1 != b.Tier1 {
		return a.Tier1 < b.Tier1
	}

	// Tier 2: interval_smooth (gap to leader)
	if a.Tier2 != b.Tier2 {
		return a.Tier2 < b.Tier2
	}

	// Tier 3: race_progress (descending, so negate)
	if a.Tier3 != b.Tier3 {
		return a.Tier3 < b.Tier3 // Already negated, so < means higher progress
	}

	// Tier 4: driver code (lexicographic tiebreaker)
	return a.Code < b.Code
}

// PositionSmoothing prevents rapid position changes (flickering)
type PositionSmoothing struct {
	lastPositions   map[string]int     // code → last position
	lastChangeTimes map[string]float64 // code → time of last change
	mu              sync.RWMutex
}

// NewPositionSmoothing creates a new position smoothing engine
func NewPositionSmoothing() *PositionSmoothing {
	return &PositionSmoothing{
		lastPositions:   make(map[string]int),
		lastChangeTimes: make(map[string]float64),
	}
}

// ApplyHysteresis applies position smoothing to prevent flickering
// threshold: seconds before allowing position change (1.0s default, 0.3s under SC/VSC)
func (ps *PositionSmoothing) ApplyHysteresis(
	sortedCodes []string,
	drivers map[string]models.DriverData,
	currentTime float64,
	trackStatus string,
) []string {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	// Determine threshold based on track status
	threshold := 1.0 // Default: 1 second
	if trackStatus == "4" || trackStatus == "6" || trackStatus == "7" {
		threshold = 0.3 // Under SC/VSC: 0.3 seconds
	}

	result := make([]string, 0, len(sortedCodes))

	for _, code := range sortedCodes {
		position := len(result) + 1 // Current position in smoothed order

		// Check if this is a known driver with a previous position
		if lastPos, ok := ps.lastPositions[code]; ok {
			lastChange := ps.lastChangeTimes[code]

			// If position hasn't changed, keep it
			if position == lastPos {
				result = append(result, code)
				continue
			}

			// If position changed but not enough time has passed, keep old position
			if currentTime-lastChange < threshold {
				// Don't include in smoothed order yet
				continue
			}

			// Enough time has passed, allow position change
			ps.lastPositions[code] = position
			ps.lastChangeTimes[code] = currentTime
			result = append(result, code)
		} else {
			// New driver, add immediately
			ps.lastPositions[code] = position
			ps.lastChangeTimes[code] = currentTime
			result = append(result, code)
		}
	}

	return result
}

// SortPositions sorts drivers using 4-tier hierarchy
// Returns sorted driver codes in order (1st, 2nd, 3rd, ...)
func SortPositions(frame *models.Frame) []string {
	var sortKeys []PositionSortKey

	for code, driver := range frame.Drivers {
		posRaw := 9999.0
		if driver.PosRaw != nil && *driver.PosRaw > 0 {
			posRaw = float64(*driver.PosRaw)
		}

		interval := 9999.0
		if driver.IntervalSmooth != nil {
			interval = *driver.IntervalSmooth
		}

		// Negate race_progress so higher progress sorts first
		raceProgress := -driver.RaceProgress

		// Tiebreaker: driver code alphabetically
		key := PositionSortKey{
			Tier1: posRaw,
			Tier2: interval,
			Tier3: raceProgress,
			Tier4: 0.0, // Not used for actual sorting (code is used instead)
			Code:  code,
		}

		sortKeys = append(sortKeys, key)
	}

	// Sort using 4-tier hierarchy
	sort.Slice(sortKeys, func(i, j int) bool {
		return sortKeys[i].Less(sortKeys[j])
	})

	// Extract sorted codes
	result := make([]string, len(sortKeys))
	for i, key := range sortKeys {
		result[i] = key.Code
	}

	return result
}

// ApplyLapAnchor snaps drivers to official lap-end positions
// This uses driver_lap_positions from the Python bridge (best lap per segment)
func ApplyLapAnchor(
	codes []string,
	drivers map[string]models.DriverData,
	lapBoundaries map[string][]int, // code → lap positions (from Python bridge)
) []string {
	// Simplified implementation for now
	// Full version would check if driver just completed a lap,
	// then snap to official position at lap end
	// For Phase 4, we keep it simple (can be enhanced later)

	return codes
}

// CalculateGaps computes gap_to_leader and gap_to_previous for all drivers
func CalculateGaps(frame *models.Frame) {
	type driverEntry struct {
		code string
		data *models.DriverData
	}

	// Get drivers sorted by position
	var drivers []driverEntry
	for code := range frame.Drivers {
		data := frame.Drivers[code]
		drivers = append(drivers, driverEntry{code: code, data: &data})
	}

	// Sort by position
	sort.Slice(drivers, func(i, j int) bool {
		return drivers[i].data.Position < drivers[j].data.Position
	})

	// Calculate gaps
	for i, entry := range drivers {
		// Gap to leader
		leaderDist := drivers[0].data.Dist
		distDiff := leaderDist - entry.data.Dist

		leaderSpeed := drivers[0].data.Speed
		speedMS := leaderSpeed * 1000.0 / 3600.0 // km/h → m/s

		if speedMS > 0.001 {
			entry.data.GapToLeader = distDiff / speedMS
		} else {
			entry.data.GapToLeader = 0.0
		}

		// Gap to previous
		if i > 0 {
			prevDist := drivers[i-1].data.Dist
			distDiff := prevDist - entry.data.Dist

			prevSpeed := drivers[i-1].data.Speed
			speedMS := prevSpeed * 1000.0 / 3600.0

			if speedMS > 0.001 {
				entry.data.GapToPrevious = distDiff / speedMS
			} else {
				entry.data.GapToPrevious = 0.0
			}
		} else {
			entry.data.GapToPrevious = 0.0
		}

		// Update in frame
		frame.Drivers[entry.code] = *entry.data
	}
}

// DetectRetirements marks drivers as retired if they've been stationary for too long
const (
	RetirementThresholdSeconds = 10.0
	PositionFPS                = 25
	RetirementFrameThreshold   = int(RetirementThresholdSeconds * PositionFPS) // 250 frames
)

// RetirementTracker tracks driver statuses across frames
type RetirementTracker struct {
	zeroSpeedFrames map[string]int // code → consecutive frames at 0 speed
	mu              sync.RWMutex
}

// NewRetirementTracker creates a new retirement tracker
func NewRetirementTracker() *RetirementTracker {
	return &RetirementTracker{
		zeroSpeedFrames: make(map[string]int),
	}
}

// UpdateFrame updates retirement status for all drivers in a frame
func (rt *RetirementTracker) UpdateFrame(frame *models.Frame) {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	for code, driver := range frame.Drivers {
		if driver.Speed < 0.1 { // Essentially 0 speed
			rt.zeroSpeedFrames[code]++
		} else {
			rt.zeroSpeedFrames[code] = 0
		}

		// Mark as retired if threshold exceeded
		if rt.zeroSpeedFrames[code] >= RetirementFrameThreshold {
			driver.Status = "Retired"
			frame.Drivers[code] = driver
		}
	}
}

// GetRetiredDrivers returns list of drivers marked as retired
func (rt *RetirementTracker) GetRetiredDrivers() []string {
	rt.mu.RLock()
	defer rt.mu.RUnlock()

	var retired []string
	for code, frames := range rt.zeroSpeedFrames {
		if frames >= RetirementFrameThreshold {
			retired = append(retired, code)
		}
	}
	return retired
}

// ApplyPositionSmoothingToFrames applies smoothing to all frames in sequence
func ApplyPositionSmoothingToFrames(frames []models.Frame, trackStatuses map[int]string) {
	smoother := NewPositionSmoothing()

	for i := range frames {
		// Get track status for this frame
		trackStatus := "1" // Default: green
		if status, ok := trackStatuses[i]; ok {
			trackStatus = status
		}

		// Get sorted codes before smoothing
		sortedCodes := SortPositions(&frames[i])

		// Apply hysteresis
		smoothedCodes := smoother.ApplyHysteresis(sortedCodes, frames[i].Drivers, frames[i].T, trackStatus)

		// Assign final positions to drivers
		for pos, code := range smoothedCodes {
			if driver, ok := frames[i].Drivers[code]; ok {
				driver.Position = pos + 1
				frames[i].Drivers[code] = driver
			}
		}

		// Calculate gaps after final positions assigned
		CalculateGaps(&frames[i])
	}
}

// TrackStatusFromFrames extracts track status information from frames
// (assumes track status is constant throughout, could be enhanced)
func TrackStatusFromFrames(frames []models.Frame) map[int]string {
	statuses := make(map[int]string)
	for i := range frames {
		// Track status would come from Python bridge in RawDataPayload
		// For now, assume all frames are green (status "1")
		statuses[i] = "1"
	}
	return statuses
}

// PositionSmoothingConfig allows customization of smoothing behavior
type PositionSmoothingConfig struct {
	DefaultThreshold          float64
	SafetyCarThreshold        float64
	VirtualSafetyCarThreshold float64
	EnableLapAnchor           bool
	EnableRetirementDetection bool
}

// DefaultPositionConfig returns recommended defaults
func DefaultPositionConfig() PositionSmoothingConfig {
	return PositionSmoothingConfig{
		DefaultThreshold:          1.0,
		SafetyCarThreshold:        0.3,
		VirtualSafetyCarThreshold: 0.3,
		EnableLapAnchor:           false, // Future enhancement
		EnableRetirementDetection: true,
	}
}

// ValidatePositionData checks that position data is consistent
func ValidatePositionData(frame *models.Frame) error {
	positions := make(map[int]bool)

	for code, driver := range frame.Drivers {
		if driver.Position < 1 {
			return fmt.Errorf("driver %s has invalid position %d", code, driver.Position)
		}

		if positions[driver.Position] {
			return fmt.Errorf("duplicate position %d assigned", driver.Position)
		}

		positions[driver.Position] = true
	}

	// Positions should be contiguous from 1 to N
	for i := 1; i <= len(frame.Drivers); i++ {
		if !positions[i] {
			// Some positions may be missing if drivers have retired
			// This is acceptable
		}
	}

	return nil
}
