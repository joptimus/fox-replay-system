package bridge

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"sync"
	"time"

	"go.uber.org/zap"
)

// RawDriverData represents raw telemetry arrays from Python bridge
type RawDriverData struct {
	T        []float64 `json:"t" msgpack:"t"`
	X        []float64 `json:"x" msgpack:"x"`
	Y        []float64 `json:"y" msgpack:"y"`
	Dist     []float64 `json:"dist" msgpack:"dist"`
	RelDist  []float64 `json:"rel_dist" msgpack:"rel_dist"`
	Lap      []int     `json:"lap" msgpack:"lap"`
	Tyre     []int     `json:"tyre" msgpack:"tyre"`
	Speed    []float64 `json:"speed" msgpack:"speed"`
	Gear     []int     `json:"gear" msgpack:"gear"`
	DRS      []int     `json:"drs" msgpack:"drs"`
	Throttle []float64 `json:"throttle" msgpack:"throttle"`
	Brake    []float64 `json:"brake" msgpack:"brake"`
	RPM      []int     `json:"rpm" msgpack:"rpm"`
}

// RawDataPayload is the complete telemetry data from Python bridge
type RawDataPayload struct {
	GlobalTMin             float64                  `json:"global_t_min" msgpack:"global_t_min"`
	GlobalTMax             float64                  `json:"global_t_max" msgpack:"global_t_max"`
	Drivers                map[string]RawDriverData `json:"drivers" msgpack:"drivers"`
	Timing                 TimingData               `json:"timing" msgpack:"timing"`
	TrackStatuses          []TrackStatus            `json:"track_statuses" msgpack:"track_statuses"`
	DriverColors           map[string][3]int        `json:"driver_colors" msgpack:"driver_colors"`
	DriverLapPositions     map[string][]int         `json:"driver_lap_positions" msgpack:"driver_lap_positions"`
	DriverNumbers          map[string]string        `json:"driver_numbers" msgpack:"driver_numbers"`
	DriverTeams            map[string]string        `json:"driver_teams" msgpack:"driver_teams"`
	WeatherTimes           []float64                `json:"weather_times" msgpack:"weather_times"`
	WeatherData            map[string][]float64     `json:"weather_data" msgpack:"weather_data"`
	RaceStartTimeAbsolute  float64                  `json:"race_start_time_absolute" msgpack:"race_start_time_absolute"`
	TotalLaps              int                      `json:"total_laps" msgpack:"total_laps"`
	TrackGeometryTelemetry TrackGeometryData        `json:"track_geometry_telemetry" msgpack:"track_geometry_telemetry"`
	TrackGeometry          map[string]interface{}   `json:"track_geometry" msgpack:"track_geometry"`
}

// TimingData contains timing information for all drivers
type TimingData struct {
	GapByDriver            map[string][]float64 `json:"gap_by_driver" msgpack:"gap_by_driver"`
	PosByDriver            map[string][]int     `json:"pos_by_driver" msgpack:"pos_by_driver"`
	IntervalSmoothByDriver map[string][]float64 `json:"interval_smooth_by_driver" msgpack:"interval_smooth_by_driver"`
	AbsTimeline            []float64            `json:"abs_timeline" msgpack:"abs_timeline"`
}

// TrackGeometryData contains track centerline and boundaries
type TrackGeometryData struct {
	X []float64 `json:"x" msgpack:"x"`
	Y []float64 `json:"y" msgpack:"y"`
}

// TrackStatus represents track status information
type TrackStatus struct {
	Status    string  `json:"status" msgpack:"status"`
	StartTime float64 `json:"start_time" msgpack:"start_time"`
	EndTime   float64 `json:"end_time" msgpack:"end_time"`
}

// ProgressMessage represents a progress update from Python
type ProgressMessage struct {
	Pct int    `json:"pct"`
	Msg string `json:"msg"`
}

// BridgeOutput represents output from Python bridge (JSON-line)
type BridgeOutput struct {
	Type     string           `json:"type"` // "progress" or "data"
	Progress *ProgressMessage `json:"progress,omitempty"`
	Pct      *int             `json:"pct,omitempty"`
	Msg      string           `json:"msg,omitempty"`
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
	const firstMessageTimeout = 30 * time.Second
	const maxStdoutLineBytes = 512 * 1024 * 1024 // 512MB JSON line budget

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
	firstMessageCh := make(chan struct{}, 1)
	signalFirstMessage := func() {
		select {
		case firstMessageCh <- struct{}{}:
		default:
		}
	}

	go func() {
		defer close(progressCh)

		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 1024*1024), maxStdoutLineBytes)
		for scanner.Scan() {
			line := scanner.Bytes()

			var output BridgeOutput
			if err := json.Unmarshal(line, &output); err != nil {
				b.logger.Error("failed to unmarshal bridge output",
					zap.Error(err),
					zap.String("line", string(line)))
				continue
			}

			if output.Type == "progress" {
				progress := output.Progress
				if progress == nil && output.Pct != nil {
					progress = &ProgressMessage{
						Pct: *output.Pct,
						Msg: output.Msg,
					}
				}
				if progress == nil {
					continue
				}
				select {
				case progressCh <- progress:
				default:
					// Channel full, skip this message
				}
				signalFirstMessage()
			} else if output.Type == "data" && output.Data != nil {
				mu.Lock()
				finalData = output.Data
				mu.Unlock()
				signalFirstMessage()
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

	// Wait for at least one progress or data message, but never block indefinitely.
	timer := time.NewTimer(firstMessageTimeout)
	defer timer.Stop()
	select {
	case <-firstMessageCh:
	case <-timer.C:
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		return nil, nil, fmt.Errorf("python bridge timeout waiting for first message after %s", firstMessageTimeout)
	}

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

	for code, driver := range p.Drivers {
		n := len(driver.T)
		if n == 0 {
			return fmt.Errorf("driver %s has no timestamp data", code)
		}
		if len(driver.X) != n || len(driver.Y) != n || len(driver.Dist) != n ||
			len(driver.RelDist) != n || len(driver.Lap) != n || len(driver.Tyre) != n ||
			len(driver.Speed) != n || len(driver.Gear) != n || len(driver.DRS) != n ||
			len(driver.Throttle) != n || len(driver.Brake) != n || len(driver.RPM) != n {
			return fmt.Errorf("driver %s has inconsistent telemetry field lengths", code)
		}
	}

	if p.GlobalTMax <= p.GlobalTMin {
		return errors.New("global_t_max must be greater than global_t_min")
	}

	return nil
}
