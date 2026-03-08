package models

import (
	"sync"
	"time"
)

// SessionState represents the state of a replay session
type SessionState string

const (
	StateInit    SessionState = "INIT"
	StateLoading SessionState = "LOADING"
	StateReady   SessionState = "READY"
	StateError   SessionState = "ERROR"
)

// SessionRequest represents a request to create a new replay session
type SessionRequest struct {
	Year        int    `json:"year"`
	RoundNum    int    `json:"round_num"`
	SessionType string `json:"session_type"` // "R", "S", "Q", "SQ"
	Refresh     bool   `json:"refresh"`
}

// SessionResponse represents the response for a session
type SessionResponse struct {
	SessionID       string                 `json:"session_id"`
	Status          SessionState           `json:"status"`
	LoadingProgress int                    `json:"progress"`
	LoadingError    string                 `json:"error,omitempty"`
	Metadata        map[string]interface{} `json:"metadata,omitempty"`
}

// Frame represents a single frame of telemetry data
type Frame struct {
	FrameIndex int                   `json:"frame_index" msgpack:"fi"`
	T          float64               `json:"t" msgpack:"t"`
	Lap        int                   `json:"lap" msgpack:"l"`
	Drivers    map[string]DriverData `json:"drivers" msgpack:"d"`
}

// DriverData represents telemetry data for a single driver in a frame
type DriverData struct {
	X              float64  `json:"x" msgpack:"x"`
	Y              float64  `json:"y" msgpack:"y"`
	Speed          float64  `json:"speed" msgpack:"sp"`
	Lap            int      `json:"lap" msgpack:"lap"`
	Tyre           int      `json:"tyre" msgpack:"tyr"`
	Gear           int      `json:"gear" msgpack:"g"`
	DRS            int      `json:"drs" msgpack:"drs"`
	Throttle       float64  `json:"throttle" msgpack:"th"`
	Brake          float64  `json:"brake" msgpack:"br"`
	RPM            int      `json:"rpm" msgpack:"rpm"`
	Dist           float64  `json:"dist" msgpack:"dist"`
	RelDist        float64  `json:"rel_dist" msgpack:"rd"`
	RaceProgress   float64  `json:"race_progress" msgpack:"rp"`
	Position       int      `json:"position" msgpack:"pos"`
	PosRaw         *int     `json:"pos_raw,omitempty" msgpack:"pr,omitempty"`
	Gap            *float64 `json:"gap,omitempty" msgpack:"gap,omitempty"`
	IntervalSmooth *float64 `json:"interval_smooth,omitempty" msgpack:"is,omitempty"`
	GapToLeader    float64  `json:"gap_to_leader" msgpack:"gtl"`
	GapToPrevious  float64  `json:"gap_to_previous" msgpack:"gtp"`
	Status         string   `json:"status" msgpack:"st"`
}

// ProgressMessage represents a progress update
type ProgressMessage struct {
	Pct int
	Msg string
}

// Session represents an active replay session
type Session struct {
	ID             string
	State          SessionState
	Frames         []Frame
	Metadata       SessionMetadata
	CreatedAt      time.Time
	LastAccessedAt time.Time
	LoadingError   string
	ProgressCh     chan *ProgressMessage
	mu             sync.RWMutex
}

// SessionMetadata stores session-level information
type SessionMetadata struct {
	Year          int               `json:"year"`
	Round         int               `json:"round"`
	SessionType   string            `json:"session_type"`
	TotalLaps     int               `json:"total_laps"`
	TotalFrames   int               `json:"total_frames"`
	DriverNumbers map[string]string `json:"driver_numbers"`
	DriverTeams   map[string]string `json:"driver_teams"`
	DriverColors  map[string][3]int `json:"driver_colors"`
}

// GetState returns the current session state
func (s *Session) GetState() SessionState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.State
}

// SetState sets the session state
func (s *Session) SetState(state SessionState) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.State = state
}

// SetLoadingError sets a user-facing loading error message.
func (s *Session) SetLoadingError(errMsg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.LoadingError = errMsg
}

// GetLoadingError returns the current loading error message.
func (s *Session) GetLoadingError() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.LoadingError
}

// GetFrames returns a copy of the frames
func (s *Session) GetFrames() []Frame {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.Frames
}

// SetFrames sets the frames
func (s *Session) SetFrames(frames []Frame) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Frames = frames
	s.Metadata.TotalFrames = len(frames)
}

// GetMetadata returns a copy of the metadata
func (s *Session) GetMetadata() SessionMetadata {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.Metadata
}

// SetMetadata sets the metadata
func (s *Session) SetMetadata(metadata SessionMetadata) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Metadata = metadata
}

// UpdateAccessTime updates the last accessed time
func (s *Session) UpdateAccessTime() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.LastAccessedAt = time.Now()
}

// TrackStatus represents track status information
type TrackStatus struct {
	Status    string  `json:"status"`
	StartTime float64 `json:"start_time"`
	EndTime   float64 `json:"end_time"`
}
