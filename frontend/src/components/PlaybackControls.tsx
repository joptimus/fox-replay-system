/**
 * Playback controls bar with timeline slider
 */

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

export const PlaybackControls: React.FC = () => {
  const {
    playback,
    play,
    pause,
    setSpeed,
    seek,
  } = useReplayStore();

  const handlePlayPause = () => {
    if (playback.isPlaying) {
      pause();
    } else {
      play();
    }
  };

  const handleSpeedChange = (speed: number) => {
    setSpeed(speed);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const frameIndex = parseInt(e.target.value);
    seek(frameIndex);
  };

  const formatTime = (frameIndex: number) => {
    const seconds = frameIndex / 25; // 25 FPS
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="playback-controls">
      {/* Timeline Slider */}
      <div className="playback-timeline">
        <input
          type="range"
          min="0"
          max={playback.totalFrames - 1}
          value={playback.frameIndex}
          onChange={handleSliderChange}
          className="playback-slider"
        />
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
