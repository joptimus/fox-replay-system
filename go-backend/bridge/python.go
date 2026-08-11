package bridge

import (
	"errors"
	"fmt"
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
	RaceControlMessages    []RaceControlMessage     `json:"race_control_messages,omitempty" msgpack:"race_control_messages,omitempty"`
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
	QualiSegments          map[string]interface{}   `json:"quali_segments,omitempty" msgpack:"quali_segments,omitempty"`
}

// TimingData contains timing information for all drivers
type TimingData struct {
	GapByDriver            map[string][]float64 `json:"gap_by_driver" msgpack:"gap_by_driver"`
	PosByDriver            map[string][]int     `json:"pos_by_driver" msgpack:"pos_by_driver"`
	IntervalSmoothByDriver map[string][]float64 `json:"interval_smooth_by_driver" msgpack:"interval_smooth_by_driver"`
	LapTimeByDriver        map[string][]float64 `json:"lap_time_by_driver" msgpack:"lap_time_by_driver"`
	Sector1ByDriver        map[string][]float64 `json:"sector1_by_driver" msgpack:"sector1_by_driver"`
	Sector2ByDriver        map[string][]float64 `json:"sector2_by_driver" msgpack:"sector2_by_driver"`
	Sector3ByDriver        map[string][]float64 `json:"sector3_by_driver" msgpack:"sector3_by_driver"`
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
	Message   string  `json:"message,omitempty" msgpack:"message,omitempty"`
	StartTime float64 `json:"start_time" msgpack:"start_time"`
	EndTime   float64 `json:"end_time" msgpack:"end_time"`
}

// RaceControlMessage represents a single race control event
type RaceControlMessage struct {
	Time          float64 `json:"time" msgpack:"time"`
	Category      string  `json:"category" msgpack:"category"`
	Message       string  `json:"message" msgpack:"message"`
	Flag          string  `json:"flag,omitempty" msgpack:"flag,omitempty"`
	Scope         string  `json:"scope,omitempty" msgpack:"scope,omitempty"`
	Sector        int     `json:"sector,omitempty" msgpack:"sector,omitempty"`
	RacingNumber  string  `json:"racing_number,omitempty" msgpack:"racing_number,omitempty"`
	Lap           int     `json:"lap,omitempty" msgpack:"lap,omitempty"`
	Status        string  `json:"status,omitempty" msgpack:"status,omitempty"`
}

// NOTE: The former PythonBridge/Execute subprocess runner was removed — it had
// no callers (main.go runs the extractor itself in generateFrames) and it
// returned before the data payload arrived, yielding a nil result.

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
