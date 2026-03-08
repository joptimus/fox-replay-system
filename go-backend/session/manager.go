package session

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"f1-replay-go/models"
)

var (
	ErrSessionNotFound   = errors.New("session not found")
	ErrTooManySessions   = errors.New("too many active sessions")
	ErrInvalidSessionID  = errors.New("invalid session ID")
)

// Manager manages active replay sessions
type Manager struct {
	mu       sync.RWMutex
	sessions map[string]*models.Session
	maxSize  int
}

// NewManager creates a new session manager
func NewManager(maxSessions int) *Manager {
	return &Manager{
		sessions: make(map[string]*models.Session),
		maxSize:  maxSessions,
	}
}

// Create creates a new session
func (m *Manager) Create(sessionID string) (*models.Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if len(m.sessions) >= m.maxSize {
		return nil, ErrTooManySessions
	}

	if sessionID == "" {
		return nil, ErrInvalidSessionID
	}

	// Clean up old inactive sessions (older than 1 hour)
	now := time.Now()
	for id, sess := range m.sessions {
		if now.Sub(sess.LastAccessedAt) > time.Hour {
			delete(m.sessions, id)
		}
	}

	s := &models.Session{
		ID:             sessionID,
		State:          models.StateInit,
		CreatedAt:      time.Now(),
		LastAccessedAt: time.Now(),
		Frames:         []models.Frame{},
		ProgressCh:     make(chan *models.ProgressMessage, 10),
	}
	m.sessions[sessionID] = s
	return s, nil
}

// Get retrieves a session by ID
func (m *Manager) Get(sessionID string) (*models.Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	s, ok := m.sessions[sessionID]
	if !ok {
		return nil, ErrSessionNotFound
	}

	s.UpdateAccessTime()
	return s, nil
}

// Delete removes a session
func (m *Manager) Delete(sessionID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.sessions[sessionID]; !ok {
		return ErrSessionNotFound
	}

	delete(m.sessions, sessionID)
	return nil
}

// Exists checks if a session exists
func (m *Manager) Exists(sessionID string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	_, ok := m.sessions[sessionID]
	return ok
}

// List returns all active session IDs
func (m *Manager) List() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	ids := make([]string, 0, len(m.sessions))
	for id := range m.sessions {
		ids = append(ids, id)
	}
	return ids
}

// Count returns the number of active sessions
func (m *Manager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return len(m.sessions)
}

// GenerateSessionID generates a unique session ID from year, round, and session type
func GenerateSessionID(year int, round int, sessionType string) string {
	return fmt.Sprintf("%d_r%d_%s_%d", year, round, sessionType, time.Now().UnixNano())
}
