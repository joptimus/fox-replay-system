package bridge

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"sync"

	"f1-replay-go/models"
	"go.uber.org/zap"
)

// RawDriverData represents raw telemetry arrays from Python bridge
type RawDriverData struct {
	T        []float64 `json:"t"`
	X        []float64 `json:"x"`
	Y        []float64 `json:"y"`
	Dist     []float64 `json:"dist"`
	RelDist  []float64 `json:"rel_dist"`
	Lap      []int     `json:"lap"`
	Tyre     []int     `json:"tyre"`
	Speed    []float64 `json:"speed"`
	Gear     []int     `json:"gear"`
	DRS      []int     `json:"drs"`
	Throttle []float64 `json:"throttle"`
	Brake    []float64 `json:"brake"`
	RPM      []int     `json:"rpm"`
}

// RawDataPayload is the complete telemetry data from Python bridge
type RawDataPayload struct {
	GlobalTMin                float64                        `json:"global_t_min"`
	GlobalTMax                float64                        `json:"global_t_max"`
	Drivers                   map[string]RawDriverData      `json:"drivers"`
	Timing                    TimingData                    `json:"timing"`
	TrackStatuses             []TrackStatus                 `json:"track_statuses"`
	DriverColors              map[string][3]int             `json:"driver_colors"`
	DriverLapPositions        map[string][]int              `json:"driver_lap_positions"`
	DriverNumbers             map[string]string             `json:"driver_numbers"`
	DriverTeams               map[string]string             `json:"driver_teams"`
	WeatherTimes              []float64                     `json:"weather_times"`
	WeatherData               map[string][]float64          `json:"weather_data"`
	RaceStartTimeAbsolute     float64                       `json:"race_start_time_absolute"`
	TotalLaps                 int                           `json:"total_laps"`
	TrackGeometryTelemetry    TrackGeometryData             `json:"track_geometry_telemetry"`
}

// TimingData contains timing information for all drivers
type TimingData struct {
	GapByDriver              map[string][]float64 `json:"gap_by_driver"`
	PosByDriver              map[string][]int     `json:"pos_by_driver"`
	IntervalSmoothByDriver   map[string][]float64 `json:"interval_smooth_by_driver"`
	AbsTimeline              []float64            `json:"abs_timeline"`
}

// TrackGeometryData contains track centerline and boundaries
type TrackGeometryData struct {
	X []float64 `json:"x"`
	Y []float64 `json:"y"`
}

// TrackStatus represents track status information
type TrackStatus struct {
	Status    string  `json:"status"`
	StartTime float64 `json:"start_time"`
	EndTime   float64 `json:"end_time"`
}

// ProgressMessage represents a progress update from Python
type ProgressMessage struct {
	Pct int    `json:"pct"`
	Msg string `json:"msg"`
}

// BridgeOutput represents output from Python bridge (JSON-line)
type BridgeOutput struct {
	Type     string           `json:"type"` // "progress" or "data"
	Progress *ProgressMessage `json:"pct,omitempty"`
	Data     *RawDataPayload  `json:"payload,omitempty"`
}

// PythonBridge manages communication with Python telemetry extraction script
type PythonBridge struct {
	scriptPath string
	logger     *zap.Logger
}

// NewPythonBridge creates a new Python bridge
func NewPythonBridge(scriptPath string, logger *zap.Logger) *PythonBridge {
	return &PythonBridge{
		scriptPath: scriptPath,
		logger:     logger,
	}
}

// Execute runs the Python bridge script and returns telemetry data
// progressCh receives progress updates from the Python process
func (b *PythonBridge) Execute(
	year int,
	round int,
	sessionType string,
	refresh bool,
) (*RawDataPayload, <-chan *ProgressMessage, error) {
	progressCh := make(chan *ProgressMessage, 10)

	// Build command
	args := []string{b.scriptPath, strconv.Itoa(year), strconv.Itoa(round), sessionType}
	if refresh {
		args = append(args, "--refresh")
	}

	cmd := exec.Command("python3", args...)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, nil, fmt.Errorf("failed to start Python bridge: %w", err)
	}

	// Read JSON lines from stdout in goroutine
	var finalData *RawDataPayload
	var readErr error
	var mu sync.Mutex

	go func() {
		defer close(progressCh)

		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Bytes()

			var output BridgeOutput
			if err := json.Unmarshal(line, &output); err != nil {
				b.logger.Error("failed to unmarshal bridge output",
					zap.Error(err),
					zap.String("line", string(line)))
				continue
			}

			if output.Type == "progress" && output.Progress != nil {
				select {
				case progressCh <- output.Progress:
				default:
					// Channel full, skip this message
				}
			} else if output.Type == "data" && output.Data != nil {
				mu.Lock()
				finalData = output.Data
				mu.Unlock()
			}
		}

		if err := scanner.Err(); err != nil {
			mu.Lock()
			readErr = fmt.Errorf("scanner error: %w", err)
			mu.Unlock()
		}

		// Wait for process to complete
		if err := cmd.Wait(); err != nil {
			mu.Lock()
			if readErr == nil {
				readErr = fmt.Errorf("process error: %w", err)
			}
			mu.Unlock()
		}
	}()

	// For now, wait a bit for data (in real implementation, timeout based on file size)
	// This is a simplified version - production would use better synchronization
	<-progressCh // Wait for at least one progress message

	return finalData, progressCh, nil
}

// ValidatePayload checks that the payload has required data
func (p *RawDataPayload) Validate() error {
	if p == nil {
		return errors.New("payload is nil")
	}

	if len(p.Drivers) == 0 {
		return errors.New("no driver data in payload")
	}

	// Check that all drivers have the same number of samples
	var expectedLen int
	for code, driver := range p.Drivers {
		if len(driver.T) == 0 {
			return fmt.Errorf("driver %s has no timestamp data", code)
		}

		if expectedLen == 0 {
			expectedLen = len(driver.T)
		} else if len(driver.T) != expectedLen {
			return fmt.Errorf("driver %s has %d samples, expected %d",
				code, len(driver.T), expectedLen)
		}
	}

	if p.GlobalTMax <= p.GlobalTMin {
		return errors.New("global_t_max must be greater than global_t_min")
	}

	return nil
}
