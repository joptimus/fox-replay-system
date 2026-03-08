package telemetry

import "math"

// SavitzkyGolayCoefficients stores precomputed Savitzky-Golay filter coefficients
// These are for window size 7 (looking at 3 points before, current, 3 points after)
// and polynomial order 2 (quadratic fit)
type SavitzkyGolayCoefficients struct {
	WindowSize  int
	PolyOrder   int
	Coefficients []float64
}

// NewSavitzkyGolay7_2 creates a SG filter with window=7, polyorder=2
// This is the filter used in the Python backend
func NewSavitzkyGolay7_2() *SavitzkyGolayCoefficients {
	// These coefficients are mathematically derived
	// Window size 7, polynomial order 2
	// Multiply by 1/21 (sum of coefficients is 21)
	coeffs := []float64{
		-2.0 / 21.0,
		3.0 / 21.0,
		6.0 / 21.0,
		7.0 / 21.0,
		6.0 / 21.0,
		3.0 / 21.0,
		-2.0 / 21.0,
	}

	return &SavitzkyGolayCoefficients{
		WindowSize:  7,
		PolyOrder:   2,
		Coefficients: coeffs,
	}
}

// Apply applies the Savitzky-Golay filter to a data series
// Points at boundaries are kept as-is (no filtering)
func (sg *SavitzkyGolayCoefficients) Apply(data []float64) []float64 {
	if len(data) < sg.WindowSize {
		// Can't filter if not enough points
		return data
	}

	output := make([]float64, len(data))

	// Copy first and last points (can't filter boundaries)
	margin := (sg.WindowSize - 1) / 2 // For window=7, margin=3

	for i := 0; i < margin; i++ {
		output[i] = data[i]
	}
	for i := len(data) - margin; i < len(data); i++ {
		output[i] = data[i]
	}

	// Apply filter to interior points
	for i := margin; i < len(data)-margin; i++ {
		sum := 0.0
		for j := 0; j < sg.WindowSize; j++ {
			sum += sg.Coefficients[j] * data[i-margin+j]
		}
		output[i] = sum
	}

	return output
}

// ApplyToMultipleSeries applies SG filter to multiple time series
// Useful for filtering multiple drivers' telemetry in parallel
func (sg *SavitzkyGolayCoefficients) ApplyToMultipleSeries(
	seriesMap map[string][]float64,
) map[string][]float64 {
	result := make(map[string][]float64)

	for name, series := range seriesMap {
		result[name] = sg.Apply(series)
	}

	return result
}

// SmoothIntervalData applies Savitzky-Golay filter to interval_smooth telemetry
// This is called during frame generation to smooth the gap-to-leader data
func SmoothIntervalData(intervals []float64) []float64 {
	if len(intervals) == 0 {
		return intervals
	}

	sg := NewSavitzkyGolay7_2()
	return sg.Apply(intervals)
}

// SmoothPositionData applies Savitzky-Golay filter to position data
// (discrete values, so filtered result is interpolated to nearest integer)
func SmoothPositionData(positions []int) []int {
	if len(positions) == 0 {
		return positions
	}

	// Convert to float64
	floatPositions := make([]float64, len(positions))
	for i, p := range positions {
		floatPositions[i] = float64(p)
	}

	// Apply filter
	sg := NewSavitzkyGolay7_2()
	smoothed := sg.Apply(floatPositions)

	// Convert back to int (round to nearest)
	result := make([]int, len(smoothed))
	for i, v := range smoothed {
		result[i] = int(math.Round(v))
	}

	return result
}

// ExponentialMovingAverage is an alternative smoothing method
// Used when SG filter is not applicable (e.g., variable-length telemetry)
type ExponentialMovingAverage struct {
	Alpha float64 // Smoothing factor (0.0-1.0, higher = more responsive)
}

// NewEMA creates an exponential moving average filter
// alpha typically 0.1-0.3 (lower = smoother)
func NewEMA(alpha float64) *ExponentialMovingAverage {
	if alpha < 0.0 {
		alpha = 0.0
	}
	if alpha > 1.0 {
		alpha = 1.0
	}
	return &ExponentialMovingAverage{Alpha: alpha}
}

// Apply applies exponential moving average to a series
func (ema *ExponentialMovingAverage) Apply(data []float64) []float64 {
	if len(data) == 0 {
		return data
	}

	output := make([]float64, len(data))
	output[0] = data[0]

	for i := 1; i < len(data); i++ {
		output[i] = ema.Alpha*data[i] + (1.0-ema.Alpha)*output[i-1]
	}

	return output
}

// SmoothSpeedData applies EMA to speed data
// Used for secondary smoothing if needed
func SmoothSpeedData(speeds []float64, alpha float64) []float64 {
	if len(speeds) == 0 {
		return speeds
	}

	ema := NewEMA(alpha)
	return ema.Apply(speeds)
}

// SmoothingConfig contains smoothing parameters
type SmoothingConfig struct {
	EnableSavitzkyGolay bool
	SGWindowSize        int
	SGPolyOrder         int
	EnableEMA           bool
	EMAAlpha            float64 // For secondary smoothing
}

// DefaultSmoothingConfig returns recommended defaults
func DefaultSmoothingConfig() SmoothingConfig {
	return SmoothingConfig{
		EnableSavitzkyGolay: true,
		SGWindowSize:        7,
		SGPolyOrder:         2,
		EnableEMA:           false, // SG is usually sufficient
		EMAAlpha:            0.2,
	}
}

// ValidateSmoothingParameters checks that smoothing params are sensible
func ValidateSmoothingParameters(config SmoothingConfig) bool {
	if config.SGWindowSize < 3 || config.SGWindowSize%2 == 0 {
		return false // Must be odd and >= 3
	}

	if config.SGPolyOrder >= config.SGWindowSize {
		return false // Poly order must be < window size
	}

	if config.EMAAlpha < 0.0 || config.EMAAlpha > 1.0 {
		return false
	}

	return true
}
