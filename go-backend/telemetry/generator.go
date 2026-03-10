package telemetry

import (
	"fmt"
	"math"
	"time"

	"f1-replay-go/bridge"
	"f1-replay-go/models"
)

// FrameGenerator orchestrates frame generation from raw telemetry data
type FrameGenerator struct {
	logger interface{} // Would be *zap.Logger in production
}

// NewFrameGenerator creates a new frame generator
func NewFrameGenerator() *FrameGenerator {
	return &FrameGenerator{}
}

// Generate creates frames from raw telemetry payload
func (fg *FrameGenerator) Generate(
	payload *bridge.RawDataPayload,
	sessionType string,
) ([]models.Frame, error) {
	startTime := time.Now()
	fmt.Printf("\n[TIMING] Generate() starting...\n")

	if err := payload.Validate(); err != nil {
		return nil, fmt.Errorf("invalid payload: %w", err)
	}

	// Create uniform timeline at 25 FPS
	t1 := time.Now()
	timeline := CreateTimeline(payload.GlobalTMin, payload.GlobalTMax)
	if len(timeline) == 0 {
		return nil, fmt.Errorf("empty timeline")
	}
	fmt.Printf("[TIMING] CreateTimeline: %.2fs (frames: %d)\n", time.Since(t1).Seconds(), len(timeline))

	// Resample all driver data to timeline
	t2 := time.Now()
	resampledDrivers := make(map[string]*ResampledDriver)
	for code := range payload.Drivers {
		origT := payload.Drivers[code].T
		driverData := map[string]interface{}{
			"x":        payload.Drivers[code].X,
			"y":        payload.Drivers[code].Y,
			"dist":     payload.Drivers[code].Dist,
			"rel_dist": payload.Drivers[code].RelDist,
			"lap":      payload.Drivers[code].Lap,
			"tyre":     payload.Drivers[code].Tyre,
			"speed":    payload.Drivers[code].Speed,
			"gear":     payload.Drivers[code].Gear,
			"drs":      payload.Drivers[code].DRS,
			"throttle": payload.Drivers[code].Throttle,
			"brake":    payload.Drivers[code].Brake,
			"rpm":      payload.Drivers[code].RPM,
		}

		driverStartTime := time.Now()
		resampled, err := ResampleDriverData(code, origT, driverData, timeline)
		driverTime := time.Since(driverStartTime).Seconds()
		if driverTime > 1.0 {
			fmt.Printf("[TIMING]   ResampleDriverData(%s): %.2fs\n", code, driverTime)
		}

		if err != nil {
			return nil, fmt.Errorf("failed to resample driver %s: %w", code, err)
		}

		resampledDrivers[code] = resampled
	}
	fmt.Printf("[TIMING] ResampleAllDrivers: %.2fs (%d drivers)\n", time.Since(t2).Seconds(), len(resampledDrivers))

	// Extract timing data (gap, position)
	t3 := time.Now()
	timingByDriver := make(map[string][]map[string]interface{})
	for code := range payload.Drivers {
		timing := make([]map[string]interface{}, len(timeline))
		for i := 0; i < len(timeline); i++ {
			timing[i] = map[string]interface{}{
				"gap":             getTimingValue(payload.Timing.GapByDriver[code], i),
				"pos_raw":         getTimingValueInt(payload.Timing.PosByDriver[code], i),
				"interval_smooth": getTimingValue(payload.Timing.IntervalSmoothByDriver[code], i),
			}
		}
		timingByDriver[code] = timing
	}
	fmt.Printf("[TIMING] ExtractTimingData: %.2fs\n", time.Since(t3).Seconds())

	// Generate frames
	t4 := time.Now()
	frames := make([]models.Frame, len(timeline))
	totalTrackDistance := estimateTrackDistance(resampledDrivers)

	for i := 0; i < len(timeline); i++ {
		frame := models.Frame{
			FrameIndex: i,
			T:          timeline[i],
			Lap:        getLeaderLap(resampledDrivers, i),
			Drivers:    make(map[string]models.DriverData),
		}

		// Populate driver data for this frame
		for code, driver := range resampledDrivers {
			driverData := models.DriverData{
				X:        driver.X[i],
				Y:        driver.Y[i],
				Speed:    driver.Speed[i],
				Lap:      driver.Lap[i],
				Tyre:     driver.Tyre[i],
				Gear:     driver.Gear[i],
				DRS:      driver.DRS[i],
				Throttle: driver.Throttle[i],
				Brake:    driver.Brake[i],
				RPM:      driver.RPM[i],
				Dist:     driver.Dist[i],
				RelDist:  driver.RelDist[i],
			}
			driverData.RaceProgress = calculateRaceProgress(driverData.Dist, driverData.Lap, totalTrackDistance)

			// Add timing data
			if timing, ok := timingByDriver[code]; ok && i < len(timing) {
				if gap, ok := timing[i]["gap"].(float64); ok {
					driverData.Gap = &gap
				}
				if posRaw, ok := timing[i]["pos_raw"].(int); ok {
					driverData.PosRaw = &posRaw
				}
				if interval, ok := timing[i]["interval_smooth"].(float64); ok {
					driverData.IntervalSmooth = &interval
				}
			}

			frame.Drivers[code] = driverData
		}

		// Calculate position and gaps
		// First assign positions based on distance
		assignPositions(&frame)

		// Then compute gap_to_leader and gap_to_previous
		computeGaps(&frame)

		frames[i] = frame
	}
	fmt.Printf("[TIMING] GenerateFrames (loop): %.2fs (%d frames)\n", time.Since(t4).Seconds(), len(frames))

	// Apply smoothing
	t5 := time.Now()
	trackStatuses := TrackStatusFromFrames(frames)
	fmt.Printf("[TIMING] TrackStatusFromFrames: %.2fs\n", time.Since(t5).Seconds())

	t6 := time.Now()
	ApplyPositionSmoothingToFrames(frames, trackStatuses)
	fmt.Printf("[TIMING] ApplyPositionSmoothingToFrames: %.2fs\n", time.Since(t6).Seconds())

	fmt.Printf("[TIMING] Total Generate(): %.2fs\n\n", time.Since(startTime).Seconds())

	return frames, nil
}

func estimateTrackDistance(drivers map[string]*ResampledDriver) float64 {
	maxDist := 0.0
	for _, driver := range drivers {
		for i := range driver.Dist {
			if driver.Dist[i] > maxDist {
				maxDist = driver.Dist[i]
			}
		}
	}
	if maxDist <= 0 || math.IsNaN(maxDist) || math.IsInf(maxDist, 0) {
		return 1.0
	}
	return maxDist
}

func calculateRaceProgress(dist float64, lap int, totalTrackDistance float64) float64 {
	if totalTrackDistance <= 0 {
		totalTrackDistance = 1.0
	}
	lapOffset := float64(maxInt(lap-1, 0))
	return lapOffset + (dist / totalTrackDistance)
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// getLeaderLap returns the lap number of the leader at frame index
func getLeaderLap(drivers map[string]*ResampledDriver, i int) int {
	maxLap := 1
	for _, driver := range drivers {
		if i < len(driver.Lap) && driver.Lap[i] > maxLap {
			maxLap = driver.Lap[i]
		}
	}
	return maxLap
}

// getTimingValue safely gets a timing value at index
func getTimingValue(values []float64, index int) float64 {
	if index >= 0 && index < len(values) {
		return values[index]
	}
	return 0.0
}

// getTimingValueInt safely gets an integer timing value at index
func getTimingValueInt(values []int, index int) int {
	if index >= 0 && index < len(values) {
		return values[index]
	}
	return 0
}

// assignPositions assigns position based on distance (simplified version)
// Phase 4 will implement proper position sorting with 4-tier hierarchy
func assignPositions(frame *models.Frame) {
	type driverEntry struct {
		code string
		dist float64
	}

	var drivers []driverEntry
	for code, data := range frame.Drivers {
		drivers = append(drivers, driverEntry{code: code, dist: data.Dist})
	}

	// Simple sort by distance (descending)
	for i := 0; i < len(drivers); i++ {
		for j := i + 1; j < len(drivers); j++ {
			if drivers[j].dist > drivers[i].dist {
				drivers[i], drivers[j] = drivers[j], drivers[i]
			}
		}
	}

	// Assign positions
	for pos, entry := range drivers {
		if data, ok := frame.Drivers[entry.code]; ok {
			data.Position = pos + 1
			frame.Drivers[entry.code] = data
		}
	}
}

// computeGaps calculates gap_to_leader and gap_to_previous for all drivers in a frame
func computeGaps(frame *models.Frame) {
	if len(frame.Drivers) == 0 {
		return
	}

	// Find leader (position 1) distance
	var leaderDist float64
	var prevDist float64

	// Build sorted list by position
	type posEntry struct {
		code string
		pos  int
		dist float64
	}
	var sorted []posEntry
	for code, data := range frame.Drivers {
		sorted = append(sorted, posEntry{code: code, pos: data.Position, dist: data.Dist})
	}

	// Sort by position
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j].pos < sorted[i].pos {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}

	// Calculate gaps
	for i, entry := range sorted {
		if data, ok := frame.Drivers[entry.code]; ok {
			// Gap to leader
			if i == 0 {
				// Leader has 0 gap
				leaderDist = entry.dist
				data.GapToLeader = 0.0
			} else {
				// Gap = leader distance - this driver distance
				gap := leaderDist - entry.dist
				if gap < 0 {
					gap = 0 // Shouldn't happen but protect against it
				}
				data.GapToLeader = gap
			}

			// Gap to previous
			if i == 0 {
				// Leader has no previous
				data.GapToPrevious = 0.0
			} else {
				// Gap = previous driver distance - this driver distance
				gap := prevDist - entry.dist
				if gap < 0 {
					gap = 0
				}
				data.GapToPrevious = gap
			}

			prevDist = entry.dist
			frame.Drivers[entry.code] = data
		}
	}
}
