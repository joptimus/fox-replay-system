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
    <div className="w-full bg-gray-900 border-t border-gray-800 p-4 space-y-3" style={{ background: 'linear-gradient(to right, #1f1f27 0%, #15151e 100%)' }}>
      {/* Timeline Slider */}
      <div className="space-y-2">
        <input
          type="range"
          min="0"
          max={playback.totalFrames - 1}
          value={playback.frameIndex}
          onChange={handleSliderChange}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600"
          style={{
            background: `linear-gradient(to right, #e10600 0%, #e10600 ${
              (playback.frameIndex / playback.totalFrames) * 100
            }%, #374151 ${
              (playback.frameIndex / playback.totalFrames) * 100
            }%, #374151 100%)`,
          }}
        />
        <div className="flex justify-between text-xs text-gray-500 f1-monospace" style={{ letterSpacing: '0.05em' }}>
          <span>{formatTime(playback.frameIndex)}</span>
          <span>{formatTime(playback.totalFrames)}</span>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Play/Pause Button */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handlePlayPause}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              background: '#e10600',
              border: '2px solid #e10600',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 12px rgba(225, 6, 0, 0.3)'
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as any).style.background = '#c70000';
              (e.currentTarget as any).style.boxShadow = '0 6px 16px rgba(225, 6, 0, 0.5)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as any).style.background = '#e10600';
              (e.currentTarget as any).style.boxShadow = '0 4px 12px rgba(225, 6, 0, 0.3)';
            }}
          >
            {playback.isPlaying ? (
              <Pause size={20} />
            ) : (
              <Play size={20} fill="currentColor" />
            )}
          </motion.button>

          {/* Skip Back Button */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => seek(Math.max(0, playback.frameIndex - 50))}
            style={{
              padding: '8px 10px',
              borderRadius: '6px',
              background: '#374151',
              border: '1px solid #4b5563',
              color: '#d1d5db',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as any).style.background = '#4b5563';
              (e.currentTarget as any).style.borderColor = '#6b7280';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as any).style.background = '#374151';
              (e.currentTarget as any).style.borderColor = '#4b5563';
            }}
          >
            <SkipBack size={18} />
          </motion.button>

          {/* Skip Forward Button */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() =>
              seek(Math.min(playback.totalFrames - 1, playback.frameIndex + 50))
            }
            style={{
              padding: '8px 10px',
              borderRadius: '6px',
              background: '#374151',
              border: '1px solid #4b5563',
              color: '#d1d5db',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as any).style.background = '#4b5563';
              (e.currentTarget as any).style.borderColor = '#6b7280';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as any).style.background = '#374151';
              (e.currentTarget as any).style.borderColor = '#4b5563';
            }}
          >
            <SkipForward size={18} />
          </motion.button>
        </div>

        {/* Speed Control */}
        <div className="flex items-center gap-2" style={{ marginRight: 'auto', marginLeft: '24px' }}>
          {SPEEDS.map((speed) => (
            <motion.button
              key={speed}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleSpeedChange(speed)}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 700,
                fontFamily: 'monospace',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                border: 'none',
                background: playback.speed === speed ? '#e10600' : '#4b5563',
                color: playback.speed === speed ? 'white' : '#d1d5db',
                boxShadow: playback.speed === speed ? '0 2px 8px rgba(225, 6, 0, 0.4)' : 'none',
              }}
              onMouseEnter={(e) => {
                if (playback.speed !== speed) {
                  (e.currentTarget as any).style.background = '#6b7280';
                }
              }}
              onMouseLeave={(e) => {
                if (playback.speed !== speed) {
                  (e.currentTarget as any).style.background = '#4b5563';
                }
              }}
            >
              {speed}x
            </motion.button>
          ))}
        </div>

        {/* Mute Button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          style={{
            padding: '8px 10px',
            borderRadius: '6px',
            background: '#374151',
            border: '1px solid #4b5563',
            color: '#d1d5db',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as any).style.background = '#4b5563';
            (e.currentTarget as any).style.borderColor = '#6b7280';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as any).style.background = '#374151';
            (e.currentTarget as any).style.borderColor = '#4b5563';
          }}
        >
          <Volume2 size={18} />
        </motion.button>
      </div>
    </div>
  );
};

export default PlaybackControls;
