/**
 * Loading modal shown while session data is being fetched
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { useLoadingState } from "../hooks/useLoadingState";
import { useReplayStore } from "../store/replayStore";
import { dataService } from "../services/dataService";

interface LoadingModalProps {
  isOpen: boolean;
  sessionId: string | null;
  year?: number;
  round?: number;
}

const STEP_NAMES = [
  "Connecting to session",
  "Loading track data",
  "Processing telemetry",
  "Building timing tower",
  "Preparing visualization",
];

/** Hook that smoothly interpolates toward a target value */
function useSmoothedValue(target: number, lerpSpeed = 0.03): number {
  const currentRef = useRef(target);
  const targetRef = useRef(target);
  const rafRef = useRef<number | null>(null);
  const [smoothed, setSmoothed] = useState(target);

  targetRef.current = target;

  useEffect(() => {
    const tick = () => {
      const diff = targetRef.current - currentRef.current;
      if (Math.abs(diff) < 0.1) {
        currentRef.current = targetRef.current;
      } else {
        currentRef.current += diff * lerpSpeed;
      }
      setSmoothed(currentRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [lerpSpeed]);

  return smoothed;
}

// Track ring canvas for progress visualization
const TrackRing: React.FC<{ progress: number }> = ({ progress }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const dotOffsetRef = useRef(0);
  const smoothProgress = useSmoothedValue(progress);

  const getTrackPoints = useCallback((cx: number, cy: number, r: number) => {
    const pts: number[][] = [];
    const count = 18;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      // Add some variation to make it look like a circuit
      const wobble = Math.sin(angle * 3) * r * 0.12 + Math.cos(angle * 5) * r * 0.06;
      pts.push([
        cx + Math.cos(angle) * (r + wobble),
        cy + Math.sin(angle) * (r + wobble),
      ]);
    }
    return pts;
  }, []);

  const drawPath = useCallback((ctx: CanvasRenderingContext2D, pts: number[][], close = true) => {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      ctx.quadraticCurveTo(prev[0], prev[1], (prev[0] + curr[0]) / 2, (prev[1] + curr[1]) / 2);
    }
    if (close) {
      const last = pts[pts.length - 1];
      const first = pts[0];
      ctx.quadraticCurveTo(last[0], last[1], (last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
      ctx.closePath();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 200;
    const dpr = devicePixelRatio;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    ctx.scale(dpr, dpr);

    const cx = size / 2, cy = size / 2, r = 68;
    const allPts = getTrackPoints(cx, cy, r);

    const draw = () => {
      ctx.clearRect(0, 0, size, size);

      // Full track outline (faint)
      ctx.save();
      drawPath(ctx, allPts);
      ctx.strokeStyle = "rgba(255,255,255, 0.04)";
      ctx.lineWidth = 12;
      ctx.stroke();
      ctx.restore();

      // Progress fill
      const progressPts = Math.max(2, Math.round(allPts.length * (smoothProgress / 100)));
      const filledPts = allPts.slice(0, progressPts);

      if (filledPts.length >= 2) {
        // Glow layer
        ctx.save();
        drawPath(ctx, filledPts, false);
        ctx.strokeStyle = "rgba(230,57,70, 0.12)";
        ctx.lineWidth = 16;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();

        // Core line
        ctx.save();
        drawPath(ctx, filledPts, false);
        ctx.strokeStyle = "#e63946";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();
      }

      // Moving dot
      const dotIdx = (dotOffsetRef.current % allPts.length);
      const i0 = Math.floor(dotIdx) % allPts.length;
      const i1 = (i0 + 1) % allPts.length;
      const frac = dotIdx - Math.floor(dotIdx);
      const dx = allPts[i0][0] + (allPts[i1][0] - allPts[i0][0]) * frac;
      const dy = allPts[i0][1] + (allPts[i1][1] - allPts[i0][1]) * frac;

      ctx.beginPath();
      ctx.arc(dx, dy, 8, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(230,57,70, 0.2)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(dx, dy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#e63946";
      ctx.fill();

      dotOffsetRef.current += 0.05;
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [smoothProgress, getTrackPoints, drawPath]);

  return (
    <div style={{ position: "relative", width: "200px", height: "200px", margin: "0 auto 20px" }}>
      <canvas ref={canvasRef} />
      {/* Percentage overlay */}
      <div style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: "32px",
          fontWeight: 700,
          color: smoothProgress >= 100 ? "#00e676" : "#e8e8ee",
          transition: "color 0.3s",
        }}>
          {Math.round(smoothProgress)}
          <span style={{
            fontSize: "16px",
            color: smoothProgress >= 100 ? "#00e676" : "#666680",
          }}>%</span>
        </span>
      </div>
    </div>
  );
};

export const LoadingModal: React.FC<LoadingModalProps> = ({
  isOpen,
  sessionId,
  year = 2025,
  round = 1,
}) => {
  const { progress, error, shouldClose, getCloseDelayMs } = useLoadingState(sessionId, isOpen);
  const setSessionLoading = useReplayStore((state) => state.setSessionLoading);
  const session = useReplayStore((state) => state.session);
  const [stepTimes, setStepTimes] = useState<(number | null)[]>([null, null, null, null, null]);
  const stepStartRef = useRef<number>(performance.now());
  const lastStepRef = useRef<number>(-1);

  useEffect(() => {
    if (!isOpen) return;

    if (shouldClose()) {
      const delay = getCloseDelayMs();
      if (delay <= 0) {
        setSessionLoading(false);
      } else {
        const timer = setTimeout(() => setSessionLoading(false), delay);
        return () => clearTimeout(timer);
      }
    }
  }, [isOpen, shouldClose, getCloseDelayMs, setSessionLoading]);

  // Track step times
  useEffect(() => {
    const currentStep = Math.min(Math.floor(progress / 20), 4);
    if (currentStep > lastStepRef.current) {
      const now = performance.now();
      setStepTimes(prev => {
        const next = [...prev];
        // Mark all completed steps
        for (let i = lastStepRef.current; i < currentStep; i++) {
          if (i >= 0 && next[i] === null) {
            next[i] = (now - stepStartRef.current) / 1000;
          }
        }
        return next;
      });
      stepStartRef.current = now;
      lastStepRef.current = currentStep;
    }
  }, [progress]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStepTimes([null, null, null, null, null]);
      lastStepRef.current = -1;
      stepStartRef.current = performance.now();
    }
  }, [isOpen]);

  const raceName = dataService.getRaceName(year, round);
  const trackName = dataService.getTrackName(year, round);
  const sessionType = session.metadata?.session_type || "R";
  const sessionLabel = { R: "Race", Q: "Qualifying", S: "Sprint", SQ: "Sprint Qualifying", FP1: "FP1", FP2: "FP2", FP3: "FP3" }[sessionType] || sessionType;
  const smoothProgress = useSmoothedValue(progress);
  const activeStep = Math.min(Math.floor(progress / 20), 4);
  const isComplete = progress >= 100;

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Backdrop */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(6,6,12, 0.85)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              animation: "fadeIn 0.3s ease",
            }}
          />

          {/* Modal */}
          <div
            style={{
              position: "relative",
              zIndex: 10,
              width: "440px",
              background: "linear-gradient(170deg, #151520 0%, #131520 100%)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "14px",
              overflow: "hidden",
              animation: "modalIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <style>{`
              @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
              @keyframes modalIn { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
              @keyframes stepPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.8); } }
              @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
              @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>

            {/* Top accent line */}
            <div style={{
              height: "2px",
              background: "linear-gradient(90deg, transparent 0%, #e63946 30%, #e63946 70%, transparent 100%)",
              opacity: 0.6,
            }} />

            {/* Upper section — track + title */}
            <div style={{ padding: "32px 32px 24px", textAlign: "center" }}>
              <TrackRing progress={progress} />

              <div style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                letterSpacing: "0.25em",
                color: "#e63946",
                marginBottom: "6px",
                textTransform: "uppercase",
              }}>LOADING SESSION</div>

              <div style={{
                fontFamily: "var(--font-ui)",
                fontSize: "16px",
                fontWeight: 600,
                color: "#e8e8ee",
              }}>{year} {raceName}</div>

              <div style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "#666680",
                marginTop: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}>
                <span>{sessionLabel}</span>
                <span style={{ width: "3px", height: "3px", borderRadius: "50%", background: "#3a3a50", display: "inline-block" }} />
                <span>Round {round}</span>
                <span style={{ width: "3px", height: "3px", borderRadius: "50%", background: "#3a3a50", display: "inline-block" }} />
                <span>{trackName}</span>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "0 24px" }} />

            {/* Steps section */}
            <div style={{ padding: "20px 32px 28px" }}>
              {STEP_NAMES.map((name, i) => {
                const isDone = i < activeStep || isComplete;
                const isActive = i === activeStep && !isComplete;

                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "8px 0",
                      borderBottom: i < STEP_NAMES.length - 1 ? "1px solid rgba(255,255,255,0.02)" : "none",
                    }}
                  >
                    {/* Status icon */}
                    <div style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "6px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      ...(isDone ? {
                        background: "rgba(0,230,118, 0.08)",
                        border: "1px solid rgba(0,230,118, 0.19)",
                      } : isActive ? {
                        background: "rgba(230,57,70, 0.08)",
                        border: "1px solid rgba(230,57,70, 0.25)",
                      } : {
                        background: "rgba(255,255,255, 0.02)",
                        border: "1px solid rgba(255,255,255, 0.04)",
                      }),
                    }}>
                      {isDone ? (
                        <span style={{ color: "#00e676", fontSize: "11px", lineHeight: 1 }}>&#10003;</span>
                      ) : isActive ? (
                        <span style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          background: "#e63946",
                          boxShadow: "0 0 8px rgba(230,57,70,0.25)",
                          animation: "stepPulse 1.2s ease infinite",
                          display: "block",
                        }} />
                      ) : (
                        <span style={{
                          width: "4px",
                          height: "4px",
                          borderRadius: "50%",
                          background: "#3a3a50",
                          display: "block",
                        }} />
                      )}
                    </div>

                    {/* Label */}
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      letterSpacing: "0.03em",
                      transition: "all 0.3s",
                      fontWeight: isActive ? 600 : 400,
                      color: isDone ? "#00e676" : isActive ? "#e8e8ee" : "#3a3a50",
                    }}>
                      {name}{isActive ? "..." : ""}
                    </span>

                    {/* Elapsed time */}
                    {isDone && stepTimes[i] !== null && (
                      <span style={{
                        marginLeft: "auto",
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        color: "#3a3a50",
                      }}>{stepTimes[i]!.toFixed(1)}s</span>
                    )}
                  </div>
                );
              })}

              {/* Progress bar */}
              <div style={{
                marginTop: "20px",
                height: "4px",
                borderRadius: "4px",
                background: "rgba(255,255,255,0.04)",
                position: "relative",
                overflow: "hidden",
              }}>
                <div style={{
                  width: `${smoothProgress}%`,
                  height: "100%",
                  borderRadius: "4px",
                  background: isComplete
                    ? "linear-gradient(90deg, rgba(0,230,118,0.56), #00e676)"
                    : "linear-gradient(90deg, rgba(230,57,70,0.56), #e63946, #ff6b7a)",
                  boxShadow: isComplete
                    ? "0 0 12px rgba(0,230,118,0.25)"
                    : "0 0 12px rgba(230,57,70,0.25)",
                  transition: "background 0.4s",
                  position: "relative",
                  overflow: "hidden",
                }}>
                  {/* Shimmer */}
                  {!isComplete && (
                    <div style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
                      animation: "shimmer 1.5s ease infinite",
                    }} />
                  )}
                </div>
              </div>

              {/* Session ready */}
              {isComplete && (
                <div style={{
                  textAlign: "center",
                  marginTop: "16px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  color: "#00e676",
                  animation: "fadeUp 0.4s ease",
                }}>SESSION READY</div>
              )}

              {/* Error */}
              {error && (
                <div style={{
                  textAlign: "center",
                  marginTop: "16px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "#ff6b6b",
                }}>{error}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default LoadingModal;
