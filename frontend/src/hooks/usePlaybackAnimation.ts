/**
 * Animation loop hook for advancing playback frameIndex
 * Synchronizes frontend state with backend playback timing
 */

import { useEffect, useRef } from "react";
import { useReplayStore } from "../store/replayStore";

const FPS = 25; // Frames per second

export const usePlaybackAnimation = () => {
  const { playback, setFrameIndex, pause } = useReplayStore((state) => ({
    playback: state.playback,
    setFrameIndex: state.setFrameIndex,
    pause: state.pause,
  }));

  const startTimeRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playback.isPlaying) {
      startTimeRef.current = null;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    // Initialize start time on first play
    if (startTimeRef.current === null) {
      startTimeRef.current = performance.now();
    }

    const animate = (currentTime: number) => {
      if (startTimeRef.current === null) return;

      // Calculate elapsed time in seconds
      const elapsedSeconds = (currentTime - startTimeRef.current) / 1000;

      // Calculate new frame index: frameIndex + (elapsed * speed * FPS)
      const newFrameIndex =
        playback.frameIndex + elapsedSeconds * playback.speed * FPS;

      if (newFrameIndex >= playback.totalFrames - 1) {
        // Reached end of race
        setFrameIndex(playback.totalFrames - 1);
        pause();
      } else {
        setFrameIndex(Math.floor(newFrameIndex));
      }

      rafIdRef.current = requestAnimationFrame(animate);
    };

    rafIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [playback.isPlaying, playback.frameIndex, playback.speed, playback.totalFrames, setFrameIndex, pause]);
};
