/**
 * Playback controls bar with custom timeline slider
 */

import { useRef, useCallback } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";
import { useReplayStore } from "../store/replayStore";
import { motion } from "framer-motion";

const SPEEDS = [0.25, 0.5, 1.0, 2.0, 4.0];

interface PlaybackControlsProps {
  onPlayWithLights?: () => void;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({ onPlayWithLights }) => {
  const {
    playback,
    play,
    pause,
    setSpeed,
    seek,
  } = useReplayStore();

  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handlePlayPause = () => {
    if (playback.isPlaying) {
      pause();
    } else if (onPlayWithLights) {
      onPlayWithLights();
    } else {
      play();
    }
  };

  const handleSpeedChange = (speed: number) => {
    setSpeed(speed);
  };

  const seekFromPointer = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track || playback.totalFrames <= 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const frameIndex = Math.round(ratio * (playback.totalFrames - 1));
    seek(frameIndex);
  }, [playback.totalFrames, seek]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    seekFromPointer(e.clientX);
  }, [seekFromPointer]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    seekFromPointer(e.clientX);
  }, [seekFromPointer]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const formatTime = (frameIndex: number) => {
    const seconds = frameIndex / 25; // 25 FPS
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = playback.totalFrames > 0
    ? (playback.frameIndex / (playback.totalFrames - 1)) * 100
    : 0;

  return (
    <div className="playback-controls">
      {/* Custom Timeline */}
      <div className="playback-timeline">
        <div
          ref={trackRef}
          className="timeline-track"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Buffer bar (100% - all frames in memory) */}
          <div className="timeline-buffer" />
          {/* Progress fill */}
          <div className="timeline-progress" style={{ width: `${progress}%` }} />
          {/* Thumb */}
          <div className="timeline-thumb" style={{ left: `${progress}%` }} />
        </div>
        <div className="playback-time-display">
          <span className="f1-monospace">{formatTime(playback.frameIndex)}</span>
          <span className="f1-monospace">{formatTime(playback.totalFrames)}</span>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="playback-buttons">
        <div className="playback-buttons-group">
          {/* Play/Pause Button */}
          <motion.button
            className="playback-btn playback-btn-play"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={handlePlayPause}
            title={playback.isPlaying ? "Pause" : "Play"}
          >
            {playback.isPlaying ? (
              <Pause size={20} />
            ) : (
              <Play size={20} fill="currentColor" />
            )}
          </motion.button>

          {/* Skip Back Button */}
          <motion.button
            className="playback-btn playback-btn-secondary"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => seek(Math.max(0, playback.frameIndex - 50))}
            title="Skip back 2 seconds"
          >
            <SkipBack size={18} />
          </motion.button>

          {/* Skip Forward Button */}
          <motion.button
            className="playback-btn playback-btn-secondary"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={() =>
              seek(Math.min(playback.totalFrames - 1, playback.frameIndex + 50))
            }
            title="Skip forward 2 seconds"
          >
            <SkipForward size={18} />
          </motion.button>
        </div>

        {/* Speed Control */}
        <div className="playback-speed-control">
          {SPEEDS.map((speed) => (
            <motion.button
              key={speed}
              className={`playback-speed-btn ${playback.speed === speed ? 'active' : ''}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleSpeedChange(speed)}
            >
              {speed}x
            </motion.button>
          ))}
        </div>

        {/* Mute Button */}
        <motion.button
          className="playback-btn playback-btn-secondary"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          title="Mute (placeholder)"
        >
          <Volume2 size={18} />
        </motion.button>
      </div>
    </div>
  );
};

export default PlaybackControls;
