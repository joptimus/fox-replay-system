/**
 * Animation loop hook for advancing playback frameIndex
 * Synchronizes frontend state with backend playback timing
 */

import { useEffect, useRef } from "react";
import { shallow } from "zustand/shallow";
import { useReplayStore } from "../store/replayStore";

const FPS = 25; // Frames per second

export const usePlaybackAnimation = () => {
  // Note: frameIndex is intentionally NOT subscribed here — it changes at
  // animation rate and would re-render the host component every tick. Seeks
  // are detected via a store subscription below instead.
  const { isPlaying, speed, totalFrames } = useReplayStore(
    (state) => ({
      isPlaying: state.playback.isPlaying,
      speed: state.playback.speed,
      totalFrames: state.playback.totalFrames,
    }),
    shallow
  );

  const setFrameIndex = useReplayStore((state) => state.setFrameIndex);
  const pause = useReplayStore((state) => state.pause);

  const startTimeRef = useRef<number | null>(null);
  const startFrameRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const lastSetFrame = useRef<number>(0);

  // Detect external seeks (user clicking timeline) and re-anchor the animation
  useEffect(() => {
    const unsubscribe = useReplayStore.subscribe(
      (state) => state.playback.frameIndex,
      (frameIndex) => {
        if (frameIndex !== lastSetFrame.current) {
          // frameIndex changed from outside the animation loop (a seek) — re-anchor
          startTimeRef.current = performance.now();
          startFrameRef.current = frameIndex;
          lastSetFrame.current = frameIndex;
        }
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isPlaying || totalFrames <= 0) {
      startTimeRef.current = null;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    // Anchor at the current frame whenever the loop (re)starts — including on
    // speed changes, so changing speed mid-play continues from the current
    // position instead of jumping.
    const currentFrame = useReplayStore.getState().playback.frameIndex;
    startTimeRef.current = performance.now();
    startFrameRef.current = currentFrame;
    lastSetFrame.current = currentFrame;

    const animate = (currentTime: number) => {
      if (startTimeRef.current === null) return;

      // Calculate elapsed time in seconds
      const elapsedSeconds = (currentTime - startTimeRef.current) / 1000;

      // Calculate new frame index: startFrame + (elapsed * speed * FPS)
      const newFrameIndex =
        startFrameRef.current + elapsedSeconds * speed * FPS;

      if (newFrameIndex >= totalFrames - 1) {
        // Reached end of race
        const endFrame = totalFrames - 1;
        lastSetFrame.current = endFrame;
        setFrameIndex(endFrame);
        pause();
      } else {
        const computed = Math.floor(newFrameIndex);
        // Only write to the store when the frame actually advances (25 FPS),
        // not on every display refresh tick.
        if (computed !== lastSetFrame.current) {
          lastSetFrame.current = computed;
          setFrameIndex(computed);
        }
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
  }, [isPlaying, speed, totalFrames, setFrameIndex, pause]);
};
