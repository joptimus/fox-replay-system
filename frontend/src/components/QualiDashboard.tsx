import React, { useState, useMemo, useCallback } from "react";
import { useReplayStore } from "../store/replayStore";
import { QualiSegmentName, QualiSegment, QualiSegments } from "../types";
import { useQualiPlayback } from "../hooks/useQualiPlayback";
import { QualiGhostRace } from "./QualiGhostRace";
import { QualiLeaderboard } from "./QualiLeaderboard";
import { QualiPlaybackControls } from "./QualiPlaybackControls";
import { QualiDriverDetailPanel } from "./QualiDriverDetailPanel";
import { VerticalNavMenu } from "./VerticalNavMenu";
import { Menu } from "lucide-react";

const Q_CONFIG: Record<string, { duration: number; cutoff: number; eliminates: string | null }> = {
  Q1: { duration: 18 * 60, cutoff: 15, eliminates: "P16\u2013P20" },
  Q2: { duration: 15 * 60, cutoff: 10, eliminates: "P11\u2013P15" },
  Q3: { duration: 12 * 60, cutoff: 10, eliminates: null },
};

interface QualiDashboardProps {
  onMenuOpen: () => void;
}

export const QualiDashboard: React.FC<QualiDashboardProps> = ({ onMenuOpen }) => {
  const session = useReplayStore((state) => state.session);
  const metadata = session?.metadata;

  const [activeSegment, setActiveSegment] = useState<QualiSegmentName>("Q1");
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);

  const qualiSegments = metadata?.quali_segments as QualiSegments | undefined;
  const driverColors = metadata?.driver_colors || {};
  const trackGeometry = metadata?.track_geometry;

  const currentSegmentData: QualiSegment | null = useMemo(() => {
    if (!qualiSegments) return null;
    if (activeSegment === "Progressive") return null;
    return qualiSegments[activeSegment] || null;
  }, [qualiSegments, activeSegment]);

  const {
    currentTime,
    duration,
    isPlaying,
    speed,
    drivers,
    play,
    pause,
    setSpeed,
    seek,
    stepForward,
    stepBackward,
  } = useQualiPlayback(currentSegmentData);

  const eliminatedDrivers = useMemo(() => {
    if (!qualiSegments) return [];
    const q2Drivers = new Set(Object.keys(qualiSegments.Q2?.drivers || {}));
    const q3Drivers = new Set(Object.keys(qualiSegments.Q3?.drivers || {}));

    if (activeSegment === "Q1") return [];
    if (activeSegment === "Q2") {
      return Object.keys(qualiSegments.Q1?.drivers || {}).filter(
        (code) => !q2Drivers.has(code)
      );
    }
    if (activeSegment === "Q3") {
      return Object.keys(qualiSegments.Q1?.drivers || {}).filter(
        (code) => !q3Drivers.has(code)
      );
    }
    return [];
  }, [qualiSegments, activeSegment]);

  const onTrackDrivers = useMemo(() => {
    if (!currentSegmentData) return new Set<string>();
    const onTrack = new Set<string>();
    for (const [code, data] of Object.entries(currentSegmentData.drivers)) {
      if (data.frames.length === 0) continue;
      const first = data.frames[0].t;
      const last = data.frames[data.frames.length - 1].t;
      if (currentTime >= first && currentTime <= last) {
        onTrack.add(code);
      }
    }
    return onTrack;
  }, [currentSegmentData, currentTime]);

  const handleDriverClick = useCallback((code: string) => {
    setSelectedDriver((prev) => (prev === code ? null : code));
  }, []);

  if (!metadata || !qualiSegments) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-page)',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        color: 'var(--text-faint)',
      }}>
        LOADING QUALIFYING...
      </div>
    );
  }

  const hasQ1 = Object.keys(qualiSegments.Q1?.drivers || {}).length > 0;
  const hasQ2 = Object.keys(qualiSegments.Q2?.drivers || {}).length > 0;
  const hasQ3 = Object.keys(qualiSegments.Q3?.drivers || {}).length > 0;
  const activeQ = activeSegment === "Progressive" ? "Q1" : activeSegment;
  const qConfig = Q_CONFIG[activeQ];
  const totalDrivers = currentSegmentData ? Object.keys(currentSegmentData.drivers).length : 0;

  const formatElapsed = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = (t % 60).toFixed(1);
    return `${mins}:${secs.padStart(4, "0")}`;
  };

  const segmentTabs: { name: QualiSegmentName; available: boolean }[] = [
    { name: "Q1", available: hasQ1 },
    { name: "Q2", available: hasQ2 },
    { name: "Q3", available: hasQ3 },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '48px 320px 1fr 300px',
      gridTemplateRows: '48px 1fr 56px',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--bg-page)',
    }}>
      {/* Top Bar */}
      <header style={{
        gridColumn: '1 / -1',
        gridRow: '1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#111119',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
        padding: '0 16px 0 0',
        height: '48px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={onMenuOpen}
            style={{
              width: '48px',
              height: '48px',
              background: 'transparent',
              border: 'none',
              color: '#666680',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Menu size={18} />
          </button>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: '#e63946',
            background: 'rgba(230,57,70,0.07)',
            border: '1px solid rgba(230,57,70,0.15)',
            borderRadius: '4px',
            padding: '4px 10px',
          }}>
            QUALIFYING
          </span>
          <span style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '14px',
            fontWeight: 700,
            color: '#e8e8ee',
          }}>
            {metadata.year} Round {metadata.round}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '3px' }}>
          {segmentTabs.map((tab) => {
            const isActive = activeSegment === tab.name;
            return (
              <button
                key={tab.name}
                onClick={() => tab.available && setActiveSegment(tab.name)}
                disabled={!tab.available}
                style={{
                  padding: '8px 20px',
                  borderRadius: '6px',
                  border: isActive
                    ? '1px solid rgba(230,57,70,0.31)'
                    : '1px solid rgba(255,255,255,0.055)',
                  background: isActive
                    ? 'rgba(230,57,70,0.09)'
                    : 'rgba(255,255,255,0.03)',
                  color: isActive ? '#e63946' : '#666680',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  cursor: tab.available ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s',
                  opacity: tab.available ? 1 : 0.4,
                }}
              >
                {tab.name}
              </button>
            );
          })}
        </div>
      </header>

      {/* Nav Rail */}
      <div style={{ gridColumn: '1', gridRow: '2 / -1' }}>
        <VerticalNavMenu />
      </div>

      {/* Timing Tower */}
      <div style={{
        gridColumn: '2',
        gridRow: '2',
        borderRight: '1px solid rgba(255,255,255,0.055)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <QualiLeaderboard
          drivers={drivers}
          driverColors={driverColors}
          selectedDriver={selectedDriver}
          eliminatedDrivers={eliminatedDrivers}
          onDriverClick={handleDriverClick}
          cutoff={qConfig.cutoff}
          activeSegment={activeQ}
          eliminatesLabel={qConfig.eliminates}
          onTrackDrivers={onTrackDrivers}
          totalDrivers={totalDrivers}
        />
      </div>

      {/* Track (Three.js / Canvas) */}
      <div style={{
        gridColumn: '3',
        gridRow: '2',
        background: '#0a0a10',
        position: 'relative',
      }}>
        <QualiGhostRace
          trackGeometry={trackGeometry ?? null}
          drivers={drivers}
          driverColors={driverColors}
          selectedDriver={selectedDriver}
          eliminatedDrivers={eliminatedDrivers}
          onDriverClick={handleDriverClick}
        />

        {/* Session timer overlay */}
        <div style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          padding: '6px 12px',
          borderRadius: '6px',
          background: 'rgba(6,6,12,0.8)',
          border: '1px solid rgba(255,255,255,0.055)',
          backdropFilter: 'blur(12px)',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: '#666680',
          pointerEvents: 'none',
        }}>
          {activeQ} &middot; {formatElapsed(currentTime)}
        </div>
      </div>

      {/* Driver Detail Panel */}
      <div style={{
        gridColumn: '4',
        gridRow: '2',
        background: '#111119',
        borderLeft: '1px solid rgba(255,255,255,0.055)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <QualiDriverDetailPanel
          selectedDriver={selectedDriver}
          drivers={drivers}
          driverColors={driverColors}
          onTrackDrivers={onTrackDrivers}
        />
      </div>

      {/* Playback Bar */}
      <div style={{
        gridColumn: '2 / -1',
        gridRow: '3',
        borderTop: '1px solid rgba(255,255,255,0.055)',
        background: 'rgba(12,12,18,0.5)',
      }}>
        <QualiPlaybackControls
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          speed={speed}
          onPlay={play}
          onPause={pause}
          onSeek={seek}
          onSpeedChange={setSpeed}
          onStepForward={stepForward}
          onStepBackward={stepBackward}
          sessionDuration={qConfig.duration}
        />
      </div>
    </div>
  );
};
