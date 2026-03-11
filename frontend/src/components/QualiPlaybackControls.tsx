import React, { useRef, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";

interface QualiPlaybackControlsProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  sessionDuration: number;
}

export const QualiPlaybackControls: React.FC<QualiPlaybackControlsProps> = ({
  currentTime,
  duration,
  isPlaying,
  speed,
  onPlay,
  onPause,
  onSeek,
  onSpeedChange,
  onStepForward,
  onStepBackward,
  sessionDuration,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}:${secs.padStart(4, "0")}`;
  };

  const formatSessionDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current || duration <= 0) return;
      const rect = trackRef.current.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onSeek(fraction * duration);
    },
    [duration, onSeek]
  );

  const handleTrackDrag = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.buttons !== 1) return;
      handleTrackClick(e);
    },
    [handleTrackClick]
  );

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '0 16px',
      height: '100%',
    }}>
      {/* Skip Back */}
      <button
        onClick={onStepBackward}
        style={{
          ...btnSecondary,
        }}
        title="Step backward"
      >
        <SkipBack size={14} />
      </button>

      {/* Play/Pause */}
      <button
        onClick={isPlaying ? onPause : onPlay}
        style={{
          ...btnPlay,
        }}
      >
        {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: '2px' }} />}
      </button>

      {/* Skip Forward */}
      <button
        onClick={onStepForward}
        style={{
          ...btnSecondary,
        }}
        title="Step forward"
      >
        <SkipForward size={14} />
      </button>

      {/* Time */}
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        color: '#666680',
        minWidth: '48px',
      }}>
        {formatTime(currentTime)}
      </span>

      {/* Scrubber */}
      <div
        ref={trackRef}
        onClick={handleTrackClick}
        onMouseMove={handleTrackDrag}
        style={{
          flex: 1,
          height: '4px',
          background: 'rgba(255,255,255,0.06)',
          borderRadius: '4px',
          cursor: 'pointer',
          position: 'relative',
          touchAction: 'none',
        }}
      >
        {/* Progress fill */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(to right, #e63946, #ff6b7a)',
          borderRadius: '4px',
          pointerEvents: 'none',
          boxShadow: '0 0 8px rgba(230,57,70,0.3)',
        }} />
        {/* Thumb */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: `${progress}%`,
          width: '12px',
          height: '12px',
          background: 'white',
          border: '2px solid #e63946',
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 2px 6px rgba(230,57,70,0.3)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Session Duration */}
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        color: '#3a3a50',
        minWidth: '40px',
      }}>
        {formatSessionDuration(sessionDuration)}
      </span>

      {/* Speed buttons */}
      <div style={{ display: 'flex', gap: '4px' }}>
        {[0.5, 1, 2].map((s) => {
          const isActive = speed === s;
          return (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: isActive
                  ? '1px solid rgba(230,57,70,0.25)'
                  : '1px solid transparent',
                background: isActive
                  ? 'rgba(230,57,70,0.1)'
                  : 'transparent',
                color: isActive ? '#e63946' : '#3a3a50',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                letterSpacing: '0.03em',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {s}x
            </button>
          );
        })}
      </div>
    </div>
  );
};

const btnPlay: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  borderRadius: '8px',
  border: '1px solid rgba(230,57,70,0.3)',
  background: 'rgba(230,57,70,0.12)',
  color: '#e63946',
  cursor: 'pointer',
  transition: 'all 0.15s',
  padding: 0,
};

const btnSecondary: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '30px',
  height: '30px',
  borderRadius: '6px',
  border: '1px solid transparent',
  background: 'rgba(255,255,255,0.03)',
  color: '#3a3a50',
  cursor: 'pointer',
  transition: 'all 0.15s',
  padding: 0,
};
