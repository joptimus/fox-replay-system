import React, { useState, useEffect, useRef, useCallback } from "react";
import { dataService } from "../services/dataService";
import { getLocationFlagEmoji } from "../utils/countryFlags";

interface LandingPageProps {
  onSessionSelect: (year: number, round: number, sessionType: string) => void;
  isLoading: boolean;
}

// Animated track canvas for left hero
const TrackCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const dotOffsetRef = useRef(0);
  const dashOffsetRef = useRef(0);

  // Asymmetric circuit shape using normalized 0-1 coordinates
  const TRACK_NORMALIZED = [
    [0.35, 0.42], [0.32, 0.38], [0.28, 0.32], [0.24, 0.24], [0.26, 0.16],
    [0.32, 0.10], [0.40, 0.08], [0.50, 0.07], [0.60, 0.08], [0.68, 0.12],
    [0.74, 0.18], [0.78, 0.26], [0.76, 0.36], [0.72, 0.44], [0.66, 0.50],
    [0.58, 0.54], [0.52, 0.58], [0.48, 0.64], [0.44, 0.72], [0.38, 0.76],
    [0.30, 0.74], [0.26, 0.68], [0.24, 0.60], [0.28, 0.52], [0.32, 0.46],
    [0.35, 0.42],
  ];

  const getTrackPoints = useCallback((w: number, h: number) => {
    return TRACK_NORMALIZED.map(([nx, ny]) => [nx * w, ny * h]);
  }, []);

  const drawPath = useCallback((ctx: CanvasRenderingContext2D, pts: number[][]) => {
    if (pts.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cpx = (prev[0] + curr[0]) / 2;
      const cpy = (prev[1] + curr[1]) / 2;
      ctx.quadraticCurveTo(prev[0], prev[1], cpx, cpy);
    }
    // Close back to start
    const last = pts[pts.length - 1];
    const first = pts[0];
    const cpx = (last[0] + first[0]) / 2;
    const cpy = (last[1] + first[1]) / 2;
    ctx.quadraticCurveTo(last[0], last[1], cpx, cpy);
    ctx.closePath();
  }, []);

  const getPointOnPath = useCallback((pts: number[][], t: number) => {
    // t in [0, 1] around the full closed circuit
    const totalPts = pts.length;
    const scaledT = ((t % 1) + 1) % 1;
    const idx = scaledT * totalPts;
    const i0 = Math.floor(idx) % totalPts;
    const i1 = (i0 + 1) % totalPts;
    const frac = idx - Math.floor(idx);
    return [
      pts[i0][0] + (pts[i1][0] - pts[i0][0]) * frac,
      pts[i0][1] + (pts[i1][1] - pts[i0][1]) * frac,
    ];
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      ctx.scale(devicePixelRatio, devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = canvas.width / devicePixelRatio;
      const h = canvas.height / devicePixelRatio;
      ctx.clearRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = "rgba(255,255,255, 0.012)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      const pts = getTrackPoints(w, h);

      // Outer glow
      ctx.save();
      drawPath(ctx, pts);
      ctx.strokeStyle = "rgba(230,57,70, 0.035)";
      ctx.lineWidth = 20;
      ctx.stroke();
      ctx.restore();

      // Mid glow
      ctx.save();
      drawPath(ctx, pts);
      ctx.strokeStyle = "rgba(230,57,70, 0.06)";
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.restore();

      // Core dashed line
      ctx.save();
      drawPath(ctx, pts);
      ctx.strokeStyle = "rgba(230,57,70, 0.20)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 16]);
      ctx.lineDashOffset = -dashOffsetRef.current;
      ctx.stroke();
      ctx.restore();

      // Moving dot
      const dotPos = getPointOnPath(pts, dotOffsetRef.current);
      ctx.beginPath();
      ctx.arc(dotPos[0], dotPos[1], 8, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(230,57,70, 0.08)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(dotPos[0], dotPos[1], 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(230,57,70, 0.5)";
      ctx.fill();

      dashOffsetRef.current += 0.4;
      dotOffsetRef.current += 0.001;

      animRef.current = requestAnimationFrame(draw);
    };

    // Delay to allow fade-in
    const timer = setTimeout(() => { animRef.current = requestAnimationFrame(draw); }, 300);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [getTrackPoints, drawPath, getPointOnPath]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, animation: "fadeIn 1.5s ease 0.3s forwards" }}
    />
  );
};

const SESSION_CHIPS = [
  { value: "FP1", label: "FP1" },
  { value: "FP2", label: "FP2" },
  { value: "FP3", label: "FP3" },
  { value: "Q", label: "QUALI" },
  { value: "S", label: "SPR" },
  { value: "R", label: "RACE" },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onSessionSelect,
  isLoading,
}) => {
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [selectedRound, setSelectedRound] = useState<number>(1);
  const [selectedSessionType, setSelectedSessionType] = useState<string>("R");
  const [availableRounds, setAvailableRounds] = useState<any[]>([]);
  const years = dataService.getAvailableYears();

  useEffect(() => {
    const rounds = dataService.getRoundsForYear(selectedYear);
    setAvailableRounds(rounds);
    if (rounds.length > 0) {
      setSelectedRound(rounds[0].round);
    }
  }, [selectedYear]);

  const currentRoundData = availableRounds.find(
    (r) => r.round === selectedRound
  );

  const handleLoad = () => {
    onSessionSelect(selectedYear, selectedRound, selectedSessionType);
  };

  // Enter key shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !isLoading) handleLoad();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const sessionLabel = SESSION_CHIPS.find(s => s.value === selectedSessionType)?.label || selectedSessionType;

  return (
    <div style={{
      width: "100vw",
      minHeight: "100vh",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      overflow: "hidden",
      background: "#0a0b10",
    }}>
      {/* Keyframes */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* LEFT — Atmospheric Hero */}
      <div style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}>
        <TrackCanvas />

        {/* Radial glow */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse 70% 60% at 50% 45%, rgba(230,57,70,0.05) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Center content */}
        <div style={{
          position: "relative",
          zIndex: 2,
          textAlign: "center",
          opacity: 0,
          animation: "fadeUp 0.6s ease 0.2s forwards",
        }}>
          <div style={{
            width: "200px",
            height: "200px",
            margin: "0 auto 36px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(230,57,70,0.10) 0%, rgba(230,57,70,0.03) 40%, transparent 70%)",
            border: "1px solid rgba(230,57,70,0.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <img
              src="/fox_logo_no_tag.png"
              alt="FOX Replay System"
              style={{ width: "160px", height: "auto", display: "block" }}
            />
          </div>

          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            letterSpacing: "0.35em",
            color: "#3a3a50",
            textTransform: "uppercase",
            marginBottom: "16px",
          }}>FORMULA ONE REPLAY SYSTEM</div>

          {/* Red divider */}
          <div style={{
            width: "40px",
            height: "1px",
            background: "linear-gradient(90deg, transparent, #e63946, transparent)",
            margin: "0 auto 20px",
          }} />

          <p style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "#666680",
            lineHeight: 1.7,
            maxWidth: "280px",
            margin: "0 auto",
          }}>Relive every lap, every overtake, every moment of the season.</p>
        </div>

        {/* Version tag */}
        <div style={{
          position: "absolute",
          bottom: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: "#3a3a50",
          letterSpacing: "0.1em",
          opacity: 0,
          animation: "fadeIn 0.6s ease 1.2s forwards",
        }}>v2.1.0</div>
      </div>

      {/* RIGHT — Session Selector */}
      <div style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "60px 60px 60px 40px",
        borderLeft: "1px solid rgba(255,255,255,0.06)",
        background: "linear-gradient(180deg, #0f1018 0%, #0a0b10 100%)",
      }}>
        {/* Corner accent L-shape */}
        <div style={{ position: "absolute", top: 0, left: 0, width: "60px", height: "1px", background: "linear-gradient(90deg, #e63946, transparent)" }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: "1px", height: "60px", background: "linear-gradient(180deg, #e63946, transparent)" }} />

        {/* Heading */}
        <div style={{ opacity: 0, animation: "fadeUp 0.6s ease 0.4s forwards", marginBottom: "36px" }}>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            letterSpacing: "0.2em",
            color: "#e63946",
            marginBottom: "10px",
            textTransform: "uppercase",
          }}>SELECT SESSION</div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "24px", fontWeight: 600, color: "#e8e8ee", lineHeight: 1.2 }}>
            Choose a race weekend
          </div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "24px", fontWeight: 400, color: "#666680", lineHeight: 1.2 }}>
            to begin replay
          </div>
        </div>

        {/* Form */}
        <div style={{ opacity: 0, animation: "fadeUp 0.6s ease 0.55s forwards", display: "flex", flexDirection: "column", gap: "20px", maxWidth: "400px" }}>
          {/* Season */}
          <div>
            <label style={labelStyle}>SEASON</label>
            <div style={{ position: "relative" }}>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                disabled={isLoading}
                style={selectStyle}
              >
                {years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <ChevronIcon />
            </div>
          </div>

          {/* Grand Prix */}
          <div>
            <label style={labelStyle}>GRAND PRIX</label>
            <div style={{ position: "relative" }}>
              <select
                value={selectedRound}
                onChange={(e) => setSelectedRound(Number(e.target.value))}
                disabled={isLoading}
                style={selectStyle}
              >
                {availableRounds.map((roundData) => (
                  <option key={roundData.round} value={roundData.round}>
                    R{roundData.round} — {roundData.raceName}
                  </option>
                ))}
              </select>
              <ChevronIcon />
            </div>
          </div>

          {/* Session chips */}
          <div>
            <label style={{ ...labelStyle, marginBottom: "10px", display: "block" }}>SESSION</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {SESSION_CHIPS.map((chip) => {
                const active = selectedSessionType === chip.value;
                return (
                  <button
                    key={chip.value}
                    onClick={() => setSelectedSessionType(chip.value)}
                    disabled={isLoading}
                    style={{
                      padding: "9px 16px",
                      borderRadius: "6px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                      cursor: isLoading ? "default" : "pointer",
                      transition: "all 0.15s",
                      border: active ? "1px solid rgba(230,57,70,0.38)" : "1px solid rgba(255,255,255,0.06)",
                      background: active ? "rgba(230,57,70,0.08)" : "transparent",
                      color: active ? "#e63946" : "#666680",
                    }}
                    onMouseEnter={(e) => {
                      if (!active && !isLoading) {
                        (e.currentTarget as any).style.borderColor = "rgba(255,255,255,0.10)";
                        (e.currentTarget as any).style.background = "rgba(255,255,255,0.02)";
                        (e.currentTarget as any).style.color = "#e8e8ee";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        (e.currentTarget as any).style.borderColor = "rgba(255,255,255,0.06)";
                        (e.currentTarget as any).style.background = "transparent";
                        (e.currentTarget as any).style.color = "#666680";
                      }
                    }}
                  >{chip.label}</button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Summary Card */}
        {currentRoundData && (
          <div style={{ opacity: 0, animation: "fadeUp 0.6s ease 0.7s forwards", marginTop: "28px", maxWidth: "400px" }}>
            <div style={{
              background: "#131520",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "10px",
              padding: "20px 22px",
              position: "relative",
              overflow: "hidden",
            }}>
              {/* Red accent line */}
              <div style={{
                position: "absolute",
                top: 0,
                left: "20px",
                right: "20px",
                height: "1px",
                background: "linear-gradient(90deg, #e63946, rgba(230,57,70,0.25), transparent)",
              }} />

              {/* Race name */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "16px" }}>
                <span style={{ fontSize: "26px", lineHeight: 1 }}>{getLocationFlagEmoji(currentRoundData.location)}</span>
                <div>
                  <div style={{ fontFamily: "var(--font-ui)", fontSize: "17px", fontWeight: 700, color: "#e8e8ee", lineHeight: 1.2 }}>
                    {currentRoundData.raceName}
                  </div>
                  {currentRoundData.track && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#666680", marginTop: "2px" }}>
                      {currentRoundData.track}
                    </div>
                  )}
                </div>
              </div>

              {/* Details grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                paddingTop: "14px",
              }}>
                <div style={{ textAlign: "center", padding: "0 12px", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={gridLabel}>ROUND</div>
                  <div style={gridValue}>R{currentRoundData.round}</div>
                </div>
                <div style={{ textAlign: "center", padding: "0 12px", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={gridLabel}>SEASON</div>
                  <div style={gridValue}>{selectedYear}</div>
                </div>
                <div style={{ textAlign: "center", padding: "0 12px" }}>
                  <div style={gridLabel}>SESSION</div>
                  <div style={gridValue}>{sessionLabel}</div>
                </div>
              </div>

              {/* Location */}
              {currentRoundData.location && (
                <div style={{
                  marginTop: "14px",
                  paddingTop: "12px",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "#3a3a50", letterSpacing: "0.08em" }}>LOCATION:</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "#666680" }}>{currentRoundData.location}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Start button */}
        <div style={{ opacity: 0, animation: "fadeUp 0.6s ease 0.85s forwards", marginTop: "24px", maxWidth: "400px" }}>
          <button
            onClick={handleLoad}
            disabled={isLoading}
            style={{
              width: "100%",
              padding: "16px 0",
              borderRadius: "8px",
              border: "none",
              background: isLoading
                ? "linear-gradient(135deg, rgba(230,57,70,0.5), rgba(198,40,56,0.5))"
                : "linear-gradient(135deg, #e63946, #c62838)",
              fontFamily: "var(--font-ui)",
              fontSize: "14px",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#fff",
              cursor: isLoading ? "default" : "pointer",
              boxShadow: "0 4px 24px rgba(230,57,70,0.25), 0 1px 0 rgba(255,255,255,0.06) inset",
              transition: "filter 0.15s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
            }}
            onMouseEnter={(e) => { if (!isLoading) (e.currentTarget as any).style.filter = "brightness(1.08)"; }}
            onMouseLeave={(e) => { (e.currentTarget as any).style.filter = "none"; }}
          >
            {isLoading ? (
              <>
                <span style={{
                  width: "16px",
                  height: "16px",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                  display: "inline-block",
                }} />
                LOADING...
              </>
            ) : (
              "START REPLAY"
            )}
          </button>
        </div>

        {/* Keyboard hint */}
        <div style={{
          opacity: 0,
          animation: "fadeIn 0.6s ease 1.1s forwards",
          marginTop: "16px",
          maxWidth: "400px",
          textAlign: "center",
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: "#3a3a50",
        }}>
          Press{" "}
          <span style={{
            padding: "2px 7px",
            borderRadius: "3px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "#666680",
          }}>Enter</span>
          {" "}to start
        </div>
      </div>
    </div>
  );
};

// Shared styles
const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  letterSpacing: "0.12em",
  color: "#666680",
  textTransform: "uppercase",
  display: "block",
  marginBottom: "8px",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 40px 12px 16px",
  borderRadius: "8px",
  border: "1px solid rgba(255,255,255,0.06)",
  background: "#131520",
  fontFamily: "var(--font-mono)",
  fontSize: "13px",
  color: "#e8e8ee",
  appearance: "none",
  WebkitAppearance: "none",
  cursor: "pointer",
  outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

const gridLabel: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "9px",
  color: "#3a3a50",
  letterSpacing: "0.12em",
  marginBottom: "5px",
  textTransform: "uppercase",
};

const gridValue: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "15px",
  fontWeight: 600,
  color: "#e8e8ee",
};

const ChevronIcon = () => (
  <svg
    style={{
      position: "absolute",
      right: "14px",
      top: "50%",
      transform: "translateY(-50%)",
      pointerEvents: "none",
    }}
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
  >
    <path d="M3 4.5L6 7.5L9 4.5" stroke="#666680" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default LandingPage;
