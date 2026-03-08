package tests

import (
	"math"
	"testing"

	"f1-replay-go/telemetry"
	"github.com/stretchr/testify/assert"
)

func TestSavitzkyGolayBasic(t *testing.T) {
	// Test basic Savitzky-Golay filtering
	sg := telemetry.NewSavitzkyGolay7_2()

	// Create test data: straight line with noise
	data := []float64{1.0, 1.1, 0.9, 1.0, 1.1, 0.9, 1.0, 1.1, 0.9, 1.0}

	result := sg.Apply(data)

	// Should have same length
	assert.Equal(t, len(data), len(result))

	// First 3 points should be unchanged (boundary)
	assert.Equal(t, data[0], result[0])
	assert.Equal(t, data[1], result[1])
	assert.Equal(t, data[2], result[2])

	// Middle points should be smoother
	// Expected: filter should reduce noise
	// Original min/max: 0.9 - 1.1 (range 0.2)
	// Filtered should have smaller range
	minVal := result[3]
	maxVal := result[3]
	for i := 3; i < 7; i++ {
		minVal = math.Min(minVal, result[i])
		maxVal = math.Max(maxVal, result[i])
	}

	assert.Less(t, maxVal-minVal, 0.15, "Filtered data should have less noise")
}

func TestSavitzkyGolayEdgeCases(t *testing.T) {
	sg := telemetry.NewSavitzkyGolay7_2()

	// Test with empty data
	empty := []float64{}
	result := sg.Apply(empty)
	assert.Equal(t, 0, len(result))

	// Test with too few points (< window size)
	short := []float64{1.0, 2.0, 3.0}
	result = sg.Apply(short)
	assert.Equal(t, short, result, "Should return unchanged if too few points")

	// Test with constant data
	constant := []float64{5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0}
	result = sg.Apply(constant)
	for _, v := range result {
		assert.Equal(t, 5.0, v, "Should preserve constant data")
	}
}

func TestSavitzkyGolayRamp(t *testing.T) {
	// Test with linear ramp data
	sg := telemetry.NewSavitzkyGolay7_2()

	// Create linear ramp: 0, 1, 2, 3, 4, 5, ...
	data := make([]float64, 20)
	for i := 0; i < 20; i++ {
		data[i] = float64(i)
	}

	result := sg.Apply(data)

	// Filtered ramp should be close to original ramp
	// (SG filter preserves polynomials up to order 2)
	for i := 3; i < 17; i++ {
		assert.AlmostEqual(t, data[i], result[i], 0.1,
			"Filtered ramp should match original at position %d", i)
	}
}

func TestExponentialMovingAverage(t *testing.T) {
	// Test exponential moving average
	ema := telemetry.NewEMA(0.3)

	// Test data: step function
	data := []float64{0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0}

	result := ema.Apply(data)

	// First value should be unchanged
	assert.Equal(t, 0.0, result[0])

	// Should gradually approach step value
	assert.Less(t, result[0], result[1], "EMA should increase")
	assert.Less(t, result[1], result[2], "EMA should continue increasing")
	assert.Less(t, result[2], result[3], "EMA should approach step")
}

func TestEMABoundary(t *testing.T) {
	// Test EMA with boundary values
	emaZero := telemetry.NewEMA(0.0)
	data := []float64{1.0, 2.0, 3.0, 4.0}

	result := emaZero.Apply(data)

	// Alpha=0 means no smoothing (keep original)
	assert.Equal(t, result, data)

	emaOne := telemetry.NewEMA(1.0)
	result = emaOne.Apply(data)

	// Alpha=1 means follow data exactly
	assert.Equal(t, result, data)

	emaOutOfBound := telemetry.NewEMA(1.5)
	// Should clamp to 1.0
	result = emaOutOfBound.Apply(data)
	assert.Equal(t, result, data)
}

func TestSmoothSpeedData(t *testing.T) {
	// Test speed smoothing
	speeds := []float64{100.0, 101.0, 99.5, 100.0, 102.0}

	result := telemetry.SmoothSpeedData(speeds, 0.2)

	// Should have same length
	assert.Equal(t, len(speeds), len(result))

	// First value unchanged
	assert.Equal(t, speeds[0], result[0])

	// Should be smoother (less variation)
	assert.Equal(t, 5, len(result))
}

func TestSmoothingConfigValidation(t *testing.T) {
	// Valid config
	validConfig := telemetry.SmoothingConfig{
		EnableSavitzkyGolay: true,
		SGWindowSize:        7,
		SGPolyOrder:         2,
		EnableEMA:           false,
		EMAAlpha:            0.2,
	}

	assert.True(t, telemetry.ValidateSmoothingParameters(validConfig))

	// Invalid: even window size
	invalidConfig := telemetry.SmoothingConfig{
		SGWindowSize: 8,
		SGPolyOrder:  2,
	}
	assert.False(t, telemetry.ValidateSmoothingParameters(invalidConfig))

	// Invalid: too small window
	invalidConfig = telemetry.SmoothingConfig{
		SGWindowSize: 1,
		SGPolyOrder:  2,
	}
	assert.False(t, telemetry.ValidateSmoothingParameters(invalidConfig))

	// Invalid: polyorder >= windowsize
	invalidConfig = telemetry.SmoothingConfig{
		SGWindowSize: 5,
		SGPolyOrder:  5,
	}
	assert.False(t, telemetry.ValidateSmoothingParameters(invalidConfig))

	// Invalid: EMA alpha out of bounds
	invalidConfig = telemetry.SmoothingConfig{
		EMAAlpha: 1.5,
	}
	assert.False(t, telemetry.ValidateSmoothingParameters(invalidConfig))
}

func TestDefaultSmoothingConfig(t *testing.T) {
	config := telemetry.DefaultSmoothingConfig()

	assert.True(t, config.EnableSavitzkyGolay)
	assert.Equal(t, 7, config.SGWindowSize)
	assert.Equal(t, 2, config.SGPolyOrder)
	assert.False(t, config.EnableEMA)
	assert.Equal(t, 0.2, config.EMAAlpha)

	// Should be valid
	assert.True(t, telemetry.ValidateSmoothingParameters(config))
}

func TestSGMultipleSeries(t *testing.T) {
	sg := telemetry.NewSavitzkyGolay7_2()

	seriesMap := map[string][]float64{
		"series1": {1.0, 1.1, 0.9, 1.0, 1.1, 0.9, 1.0, 1.1, 0.9, 1.0},
		"series2": {2.0, 2.1, 1.9, 2.0, 2.1, 1.9, 2.0, 2.1, 1.9, 2.0},
		"series3": {3.0, 3.1, 2.9, 3.0, 3.1, 2.9, 3.0, 3.1, 2.9, 3.0},
	}

	result := sg.ApplyToMultipleSeries(seriesMap)

	// Should have same keys
	assert.Equal(t, len(seriesMap), len(result))

	// Each series should be filtered
	for key, original := range seriesMap {
		assert.Equal(t, len(original), len(result[key]))
	}
}

func TestSmoothPositionData(t *testing.T) {
	// Test filtering discrete position data
	positions := []int{1, 1, 2, 1, 1, 2, 2, 1, 1}

	result := telemetry.SmoothPositionData(positions)

	// Should be same length
	assert.Equal(t, len(positions), len(result))

	// Filtered positions should be integer
	for _, p := range result {
		assert.True(t, p >= 1 && p <= 2, "Position should be valid")
	}
}

// BenchmarkSavitzkyGolay benchmarks the SG filter performance
func BenchmarkSavitzkyGolay(b *testing.B) {
	sg := telemetry.NewSavitzkyGolay7_2()

	// Create test data: 154,000 points (typical race session)
	data := make([]float64, 154000)
	for i := 0; i < len(data); i++ {
		data[i] = float64(i) * 0.001
	}

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		sg.Apply(data)
	}
}

// BenchmarkEMA benchmarks the EMA filter performance
func BenchmarkEMA(b *testing.B) {
	ema := telemetry.NewEMA(0.2)

	// Create test data
	data := make([]float64, 154000)
	for i := 0; i < len(data); i++ {
		data[i] = float64(i) * 0.001
	}

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		ema.Apply(data)
	}
}
