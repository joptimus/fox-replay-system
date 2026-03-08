package telemetry

import (
	"fmt"
	"math"
)

const (
	FPS = 25
	DT  = 1.0 / FPS // 0.04 seconds between frames
)

// CreateTimeline creates a uniform timeline from global_t_min to global_t_max at FPS Hz
func CreateTimeline(globalTMin, globalTMax float64) []float64 {
	if globalTMin >= globalTMax {
		return []float64{}
	}

	numFrames := int(math.Ceil((globalTMax-globalTMin)/DT)) + 1
	timeline := make([]float64, numFrames)

	for i := 0; i < numFrames; i++ {
		timeline[i] = globalTMin + float64(i)*DT
	}

	return timeline
}

// ResampleFloat64 resamples a float64 series using linear interpolation
// xp: original time points
// fp: original values
// x: target time points (usually the timeline)
func ResampleFloat64(x, xp, fp []float64) ([]float64, error) {
	if len(xp) == 0 || len(fp) == 0 {
		return nil, fmt.Errorf("empty input arrays")
	}

	if len(xp) != len(fp) {
		return nil, fmt.Errorf("xp and fp must have same length")
	}

	result := make([]float64, len(x))

	for i, t := range x {
		result[i] = linearInterpFloat64(t, xp, fp)
	}

	return result, nil
}

// ResampleInt resamples an int series using step interpolation
// xp: original time points
// fp: original values
// x: target time points (usually the timeline)
func ResampleInt(x, xp []float64, fp []int) ([]int, error) {
	if len(xp) == 0 || len(fp) == 0 {
		return nil, fmt.Errorf("empty input arrays")
	}

	if len(xp) != len(fp) {
		return nil, fmt.Errorf("xp and fp must have same length")
	}

	result := make([]int, len(x))

	for i, t := range x {
		result[i] = stepInterpInt(t, xp, fp)
	}

	return result, nil
}

// linearInterpFloat64 performs linear interpolation for a single point
func linearInterpFloat64(t float64, xp, fp []float64) float64 {
	// Handle out of bounds
	if t <= xp[0] {
		return fp[0]
	}
	if t >= xp[len(xp)-1] {
		return fp[len(fp)-1]
	}

	// Binary search for insertion point
	j := 0
	for j < len(xp)-1 && xp[j+1] < t {
		j++
	}

	// Linear interpolation
	x0, x1 := xp[j], xp[j+1]
	y0, y1 := fp[j], fp[j+1]

	if x1 == x0 {
		return y0 // Avoid division by zero
	}

	alpha := (t - x0) / (x1 - x0)
	return y0 + alpha*(y1-y0)
}

// stepInterpInt performs step interpolation for a single point
// Returns the value at the most recent sample before or at time t
func stepInterpInt(t float64, xp []float64, fp []int) int {
	// Handle out of bounds
	if t <= xp[0] {
		return fp[0]
	}
	if t >= xp[len(xp)-1] {
		return fp[len(fp)-1]
	}

	// Binary search for insertion point
	j := 0
	for j < len(xp)-1 && xp[j+1] < t {
		j++
	}

	return fp[j]
}

// ResampledDriver contains resampled telemetry for a single driver
type ResampledDriver struct {
	Code     string
	T        []float64
	X        []float64
	Y        []float64
	Dist     []float64
	RelDist  []float64
	Lap      []int
	Tyre     []int
	Speed    []float64
	Gear     []int
	DRS      []int
	Throttle []float64
	Brake    []float64
	RPM      []int
	Gap      []float64
	PosRaw   []int
	Interval []float64
}

// ResampleDriverData resamples all telemetry for a driver to target timeline
func ResampleDriverData(
	code string,
	originalT []float64,
	driver map[string]interface{},
	timeline []float64,
) (*ResampledDriver, error) {
	// Extract arrays from map. Accept both typed slices and generic []interface{}.
	getFloat64Slice := func(key string) []float64 {
		if raw, ok := driver[key]; ok {
			switch v := raw.(type) {
			case []float64:
				return v
			case []int:
				result := make([]float64, len(v))
				for i := range v {
					result[i] = float64(v[i])
				}
				return result
			case []interface{}:
				result := make([]float64, len(v))
				for i, val := range v {
					switch fv := val.(type) {
					case float64:
						result[i] = fv
					case int:
						result[i] = float64(fv)
					}
				}
				return result
			}
		}
		return []float64{}
	}

	getIntSlice := func(key string) []int {
		if raw, ok := driver[key]; ok {
			switch v := raw.(type) {
			case []int:
				return v
			case []float64:
				result := make([]int, len(v))
				for i := range v {
					result[i] = int(v[i])
				}
				return result
			case []interface{}:
				result := make([]int, len(v))
				for i, val := range v {
					switch fv := val.(type) {
					case float64:
						result[i] = int(fv)
					case int:
						result[i] = fv
					}
				}
				return result
			}
		}
		return []int{}
	}

	// Extract original data
	x := getFloat64Slice("x")
	y := getFloat64Slice("y")
	dist := getFloat64Slice("dist")
	relDist := getFloat64Slice("rel_dist")
	lap := getIntSlice("lap")
	tyre := getIntSlice("tyre")
	speed := getFloat64Slice("speed")
	gear := getIntSlice("gear")
	drs := getIntSlice("drs")
	throttle := getFloat64Slice("throttle")
	brake := getFloat64Slice("brake")
	rpm := getIntSlice("rpm")

	checkLenFloat := func(name string, arr []float64) error {
		if len(arr) != len(originalT) {
			return fmt.Errorf("%s length mismatch: got %d, expected %d", name, len(arr), len(originalT))
		}
		return nil
	}
	checkLenInt := func(name string, arr []int) error {
		if len(arr) != len(originalT) {
			return fmt.Errorf("%s length mismatch: got %d, expected %d", name, len(arr), len(originalT))
		}
		return nil
	}

	if err := checkLenFloat("x", x); err != nil {
		return nil, fmt.Errorf("driver %s invalid telemetry: %w", code, err)
	}
	if err := checkLenFloat("y", y); err != nil {
		return nil, fmt.Errorf("driver %s invalid telemetry: %w", code, err)
	}
	if err := checkLenFloat("dist", dist); err != nil {
		return nil, fmt.Errorf("driver %s invalid telemetry: %w", code, err)
	}
	if err := checkLenFloat("rel_dist", relDist); err != nil {
		return nil, fmt.Errorf("driver %s invalid telemetry: %w", code, err)
	}
	if err := checkLenInt("lap", lap); err != nil {
		return nil, fmt.Errorf("driver %s invalid telemetry: %w", code, err)
	}
	if err := checkLenInt("tyre", tyre); err != nil {
		return nil, fmt.Errorf("driver %s invalid telemetry: %w", code, err)
	}
	if err := checkLenFloat("speed", speed); err != nil {
		return nil, fmt.Errorf("driver %s invalid telemetry: %w", code, err)
	}
	if err := checkLenInt("gear", gear); err != nil {
		return nil, fmt.Errorf("driver %s invalid telemetry: %w", code, err)
	}
	if err := checkLenInt("drs", drs); err != nil {
		return nil, fmt.Errorf("driver %s invalid telemetry: %w", code, err)
	}
	if err := checkLenFloat("throttle", throttle); err != nil {
		return nil, fmt.Errorf("driver %s invalid telemetry: %w", code, err)
	}
	if err := checkLenFloat("brake", brake); err != nil {
		return nil, fmt.Errorf("driver %s invalid telemetry: %w", code, err)
	}
	if err := checkLenInt("rpm", rpm); err != nil {
		return nil, fmt.Errorf("driver %s invalid telemetry: %w", code, err)
	}

	// Resample all telemetry
	resampledX, err := ResampleFloat64(timeline, originalT, x)
	if err != nil {
		return nil, fmt.Errorf("failed resampling x for %s: %w", code, err)
	}
	resampledY, err := ResampleFloat64(timeline, originalT, y)
	if err != nil {
		return nil, fmt.Errorf("failed resampling y for %s: %w", code, err)
	}
	resampledDist, err := ResampleFloat64(timeline, originalT, dist)
	if err != nil {
		return nil, fmt.Errorf("failed resampling dist for %s: %w", code, err)
	}
	resampledRelDist, err := ResampleFloat64(timeline, originalT, relDist)
	if err != nil {
		return nil, fmt.Errorf("failed resampling rel_dist for %s: %w", code, err)
	}
	resampledLap, err := ResampleInt(timeline, originalT, lap)
	if err != nil {
		return nil, fmt.Errorf("failed resampling lap for %s: %w", code, err)
	}
	resampledTyre, err := ResampleInt(timeline, originalT, tyre)
	if err != nil {
		return nil, fmt.Errorf("failed resampling tyre for %s: %w", code, err)
	}
	resampledSpeed, err := ResampleFloat64(timeline, originalT, speed)
	if err != nil {
		return nil, fmt.Errorf("failed resampling speed for %s: %w", code, err)
	}
	resampledGear, err := ResampleInt(timeline, originalT, gear)
	if err != nil {
		return nil, fmt.Errorf("failed resampling gear for %s: %w", code, err)
	}
	resampledDRS, err := ResampleInt(timeline, originalT, drs)
	if err != nil {
		return nil, fmt.Errorf("failed resampling drs for %s: %w", code, err)
	}
	resampledThrottle, err := ResampleFloat64(timeline, originalT, throttle)
	if err != nil {
		return nil, fmt.Errorf("failed resampling throttle for %s: %w", code, err)
	}
	resampledBrake, err := ResampleFloat64(timeline, originalT, brake)
	if err != nil {
		return nil, fmt.Errorf("failed resampling brake for %s: %w", code, err)
	}
	resampledRPM, err := ResampleInt(timeline, originalT, rpm)
	if err != nil {
		return nil, fmt.Errorf("failed resampling rpm for %s: %w", code, err)
	}

	return &ResampledDriver{
		Code:     code,
		T:        timeline,
		X:        resampledX,
		Y:        resampledY,
		Dist:     resampledDist,
		RelDist:  resampledRelDist,
		Lap:      resampledLap,
		Tyre:     resampledTyre,
		Speed:    resampledSpeed,
		Gear:     resampledGear,
		DRS:      resampledDRS,
		Throttle: resampledThrottle,
		Brake:    resampledBrake,
		RPM:      resampledRPM,
	}, nil
}
