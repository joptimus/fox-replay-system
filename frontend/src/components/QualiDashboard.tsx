import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCurrentFrame, useReplayStore } from "../store/replayStore";
import { TYRE_NAMES, TYRE_COLORS } from "../types";

const MiniTrackMap: React.FC<{
  trackGeometry: any;
  drivers: any[];
  metadata: any;
}> = ({ trackGeometry, drivers, metadata }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !trackGeometry) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 10;

    const xMin = trackGeometry.x_min;
    const xMax = trackGeometry.x_max;
    const yMin = trackGeometry.y_min;
    const yMax = trackGeometry.y_max;

    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    const scale = Math.min((width - padding * 2) / xRange, (height - padding * 2) / yRange);

    const getCanvasX = (x: number) => ((x - xMin) * scale) + padding;
    const getCanvasY = (y: number) => height - (((y - yMin) * scale) + padding);

    ctx.fillStyle = "rgba(20, 20, 25, 1)";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#666";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < trackGeometry.centerline_x.length; i++) {
      const x = getCanvasX(trackGeometry.centerline_x[i]);
      const y = getCanvasY(trackGeometry.centerline_y[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    drivers.forEach((driver) => {
      const color = metadata.driver_colors[driver.code];
      const rgbColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

      const x = getCanvasX(driver.data.x);
      const y = getCanvasY(driver.data.y);

      ctx.fillStyle = rgbColor;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(driver.code, x, y - 8);
    });
  }, [trackGeometry, drivers, metadata]);

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={280}
      style={{
        backgroundColor: "rgba(20, 20, 25, 1)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "4px",
      }}
    />
  );
};

const TelemetryPanel: React.FC<{
  driver: any;
  isOpen: boolean;
  onClose: () => void;
  fastestS1: number;
  fastestS2: number;
  fastestS3: number;
  getSectorColor: (sectorTime: number | null | undefined, fastestTime: number, driverCode: string, sectorNum: 1 | 2 | 3) => string;
}> = ({ driver, isOpen, onClose, fastestS1, fastestS2, fastestS3, getSectorColor }) => {
  const formatTimeDisplay = (milliseconds: number | null): string => {
    if (!milliseconds) return "-";
    const seconds = milliseconds / 1000;
    if (seconds < 60) {
      return seconds.toFixed(3) + "s";
    } else {
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${minutes}:${secs.toFixed(3).padStart(7, '0')}`;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: "400px",
            backgroundColor: "var(--f1-black)",
            borderLeft: `2px solid rgb(${driver.color[0]}, ${driver.color[1]}, ${driver.color[2]})`,
            boxShadow: "0 0 30px rgba(0, 0, 0, 0.8)",
            zIndex: 50,
            overflow: "auto",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: "12px",
              right: "12px",
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "#fff",
              padding: "4px 8px",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
          >
            ✕
          </button>

          <div>
            <div className="f1-monospace" style={{ fontSize: "1rem", fontWeight: 900, marginBottom: "4px" }}>
              {driver.code}
            </div>
            <div className="f1-monospace" style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
              LAP TELEMETRY
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <div className="f1-monospace" style={{ fontSize: "0.65rem", color: "#6b7280", marginBottom: "6px" }}>SPEED</div>
              <div className="f1-monospace" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{driver.data.speed.toFixed(0)} km/h</div>
            </div>

            <div>
              <div className="f1-monospace" style={{ fontSize: "0.65rem", color: "#6b7280", marginBottom: "6px" }}>GEAR</div>
              <div className="f1-monospace" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{driver.data.gear}</div>
            </div>

            <div>
              <div className="f1-monospace" style={{ fontSize: "0.65rem", color: "#6b7280", marginBottom: "6px" }}>THROTTLE / BRAKE</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div className="f1-monospace" style={{ fontSize: "1.25rem", fontWeight: 700 }}>{driver.data.throttle.toFixed(0)}%</div>
                <div className="f1-monospace" style={{ fontSize: "1.25rem", fontWeight: 700 }}>{driver.data.brake.toFixed(0)}%</div>
              </div>
            </div>

            <div>
              <div className="f1-monospace" style={{ fontSize: "0.65rem", color: "#6b7280", marginBottom: "6px" }}>TYRE</div>
              <div style={{
                padding: "8px 12px",
                backgroundColor: TYRE_COLORS[driver.data.tyre as keyof typeof TYRE_COLORS] || "#fff",
                borderRadius: "4px",
                textAlign: "center",
                fontWeight: 700,
                color: driver.data.tyre === 1 ? "#000" : "#fff",
              }}>
                {TYRE_NAMES[driver.data.tyre as keyof typeof TYRE_NAMES]}
              </div>
            </div>
          </div>

          {(driver.data.sector1 || driver.data.sector2 || driver.data.sector3) && (
            <div style={{ paddingTop: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
              <div className="f1-monospace" style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "12px", fontWeight: 600 }}>SECTOR TIMES</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {driver.data.sector1 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="f1-monospace" style={{ fontSize: "0.75rem", color: "#9ca3af" }}>S1</span>
                    <span className="f1-monospace" style={{
                      fontSize: "0.85rem",
                      color: getSectorColor(driver.data.sector1, fastestS1, driver.code, 1),
                      fontWeight: getSectorColor(driver.data.sector1, fastestS1, driver.code, 1) !== "#9ca3af" ? 700 : 600,
                    }}>{formatTimeDisplay(driver.data.sector1)}</span>
                  </div>
                )}
                {driver.data.sector2 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="f1-monospace" style={{ fontSize: "0.75rem", color: "#9ca3af" }}>S2</span>
                    <span className="f1-monospace" style={{
                      fontSize: "0.85rem",
                      color: getSectorColor(driver.data.sector2, fastestS2, driver.code, 2),
                      fontWeight: getSectorColor(driver.data.sector2, fastestS2, driver.code, 2) !== "#9ca3af" ? 700 : 600,
                    }}>{formatTimeDisplay(driver.data.sector2)}</span>
                  </div>
                )}
                {driver.data.sector3 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="f1-monospace" style={{ fontSize: "0.75rem", color: "#9ca3af" }}>S3</span>
                    <span className="f1-monospace" style={{
                      fontSize: "0.85rem",
                      color: getSectorColor(driver.data.sector3, fastestS3, driver.code, 3),
                      fontWeight: getSectorColor(driver.data.sector3, fastestS3, driver.code, 3) !== "#9ca3af" ? 700 : 600,
                    }}>{formatTimeDisplay(driver.data.sector3)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {driver.data.lap_time && driver.data.lap_time > 0 && (
            <div style={{ paddingTop: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
              <div className="f1-monospace" style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "8px" }}>LAP TIME</div>
              <div className="f1-monospace" style={{ fontSize: "1.75rem", fontWeight: 700 }}>{formatTimeDisplay(driver.data.lap_time)}</div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const QualiDashboard: React.FC = () => {
  const currentFrame = useCurrentFrame();
  const session = useReplayStore((state) => state.session);
  const metadata = session?.metadata;
  const [selectedDriverCode, setSelectedDriverCode] = useState<string | null>(null);

  if (!currentFrame || !metadata || !currentFrame.drivers) {
    return <div className="p-4 f1-monospace">LOADING...</div>;
  }

  const drivers = Object.entries(currentFrame.drivers)
    .map(([code, data]) => ({
      code,
      data,
      position: data.position,
      color: metadata.driver_colors[code] || [255, 255, 255],
    }))
    .sort((a, b) => {
      if (a.data.lap_time && b.data.lap_time) {
        return a.data.lap_time - b.data.lap_time;
      }
      return a.position - b.position;
    });

  const fastestLapTime = Math.min(...drivers.filter(d => d.data.lap_time).map(d => d.data.lap_time as number));
  const fastestS1 = Math.min(...drivers.filter(d => d.data.sector1).map(d => d.data.sector1 as number));
  const fastestS2 = Math.min(...drivers.filter(d => d.data.sector2).map(d => d.data.sector2 as number));
  const fastestS3 = Math.min(...drivers.filter(d => d.data.sector3).map(d => d.data.sector3 as number));

  const getDriverSectorStats = (driverCode: string) => {
    const driverSectors = drivers.map(d => ({
      s1: d.data.sector1,
      s2: d.data.sector2,
      s3: d.data.sector3,
      code: d.code,
    })).filter(d => d.code === driverCode)[0];

    if (!driverSectors) return { bestS1: false, bestS2: false, bestS3: false, worstS1: false, worstS2: false, worstS3: false };

    const s1Times = drivers.map(d => d.data.sector1).filter((t): t is number => t !== null && t !== undefined);
    const s2Times = drivers.map(d => d.data.sector2).filter((t): t is number => t !== null && t !== undefined);
    const s3Times = drivers.map(d => d.data.sector3).filter((t): t is number => t !== null && t !== undefined);

    return {
      bestS1: driverSectors.s1 ? Math.min(...s1Times) === driverSectors.s1 : false,
      bestS2: driverSectors.s2 ? Math.min(...s2Times) === driverSectors.s2 : false,
      bestS3: driverSectors.s3 ? Math.min(...s3Times) === driverSectors.s3 : false,
      worstS1: driverSectors.s1 ? Math.max(...s1Times) === driverSectors.s1 : false,
      worstS2: driverSectors.s2 ? Math.max(...s2Times) === driverSectors.s2 : false,
      worstS3: driverSectors.s3 ? Math.max(...s3Times) === driverSectors.s3 : false,
    };
  };

  const getSectorColor = (sectorTime: number | null | undefined, fastestTime: number, driverCode: string, sectorNum: 1 | 2 | 3): string => {
    if (!sectorTime) return "#9ca3af";

    const stats = getDriverSectorStats(driverCode);
    const isBest = sectorNum === 1 ? stats.bestS1 : sectorNum === 2 ? stats.bestS2 : stats.bestS3;
    const isWorst = sectorNum === 1 ? stats.worstS1 : sectorNum === 2 ? stats.worstS2 : stats.worstS3;
    const isFastest = Math.abs(sectorTime - fastestTime) < 0.1;

    if (isFastest) return "#a855f7";
    if (isBest && !isWorst) return "#22c55e";
    if (isWorst) return "#eab308";
    return "#9ca3af";
  };

  const formatTimeDisplay = (milliseconds: number | null): string => {
    if (!milliseconds) return "-";
    const seconds = milliseconds / 1000;
    if (seconds < 60) {
      return seconds.toFixed(1) + "s";
    } else {
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${minutes}:${secs.toFixed(1).padStart(5, '0')}`;
    }
  };

  const selectedDriverData = selectedDriverCode ? drivers.find(d => d.code === selectedDriverCode) : null;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      width: "100%",
      background: "var(--f1-black)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px",
        borderBottom: "1px solid var(--f1-border)",
        flexShrink: 0,
      }}>
        <div className="f1-monospace" style={{
          fontSize: "0.85rem",
          color: "#e10600",
          fontWeight: 900,
          marginBottom: "8px",
        }}>
          QUALIFYING SESSION
        </div>
        <div className="f1-monospace" style={{
          fontSize: "0.7rem",
          color: "#9ca3af",
        }}>
          FASTEST LAP: {formatTimeDisplay(fastestLapTime)}
        </div>
      </div>

      {/* Main Content */}
      <div style={{
        flex: 1,
        overflow: "hidden",
        display: "flex",
        minHeight: 0,
        gap: "16px",
        padding: "16px",
        position: "relative",
      }}>
        {/* Left Panel - Leaderboard */}
        <div style={{
          width: "280px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          overflow: "auto",
          flexShrink: 0,
        }}>
          {/* Track Map */}
          <div style={{
            padding: "12px",
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            borderRadius: "6px",
          }}>
            <div className="f1-monospace" style={{
              fontSize: "0.7rem",
              color: "#6b7280",
              marginBottom: "8px",
              fontWeight: 700,
            }}>TRACK MAP</div>
            <MiniTrackMap trackGeometry={metadata.track_geometry} drivers={drivers} metadata={metadata} />
          </div>

          {/* Leaderboard */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            padding: "12px",
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            borderRadius: "6px",
          }}>
            <div className="f1-monospace" style={{
              fontSize: "0.7rem",
              color: "#6b7280",
              marginBottom: "4px",
              fontWeight: 700,
            }}>LEADERBOARD</div>
            <AnimatePresence mode="popLayout">
              {drivers.slice(0, 10).map((driver, idx) => {
                const isSelected = selectedDriverCode === driver.code;
                const hexColor = `rgb(${driver.color[0]}, ${driver.color[1]}, ${driver.color[2]})`;

                return (
                  <motion.div
                    key={driver.code}
                    layout
                    onClick={() => {
                      if (isSelected) {
                        setSelectedDriverCode(null);
                      } else {
                        setSelectedDriverCode(driver.code);
                      }
                    }}
                    style={{
                      padding: "8px 10px",
                      backgroundColor: isSelected ? "rgba(225, 6, 0, 0.2)" : "rgba(255, 255, 255, 0.02)",
                      borderLeft: `3px solid ${hexColor}`,
                      borderRadius: "3px",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      transition: "all 0.2s ease",
                    }}
                    whileHover={{
                      backgroundColor: "rgba(255, 255, 255, 0.08)",
                    }}
                  >
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", flex: 1 }}>
                      <span className="f1-monospace" style={{
                        fontSize: "0.75rem",
                        fontWeight: 900,
                        color: hexColor,
                        minWidth: "18px",
                      }}>
                        {idx + 1}
                      </span>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>{driver.code}</span>
                    </div>
                    <span className="f1-monospace" style={{
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      color: driver.data.lap_time === fastestLapTime ? "#a855f7" : "#9ca3af",
                    }}>
                      {formatTimeDisplay(driver.data.lap_time ?? null)}
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Panel - Data Table */}
        <div style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}>
          {/* Table Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "35px 35px 35px auto 70px 70px 70px 80px 70px",
            gap: "0",
            padding: "12px 16px",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            borderBottom: "2px solid var(--f1-border)",
            flexShrink: 0,
          }}>
            <div className="f1-monospace" style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700 }}>POS</div>
            <div className="f1-monospace" style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700 }}>TYR</div>
            <div className="f1-monospace" style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700 }}>—</div>
            <div className="f1-monospace" style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700 }}>DRIVER</div>
            <div className="f1-monospace" style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700, textAlign: "right" }}>S1</div>
            <div className="f1-monospace" style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700, textAlign: "right" }}>S2</div>
            <div className="f1-monospace" style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700, textAlign: "right" }}>S3</div>
            <div className="f1-monospace" style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700, textAlign: "right" }}>LAP TIME</div>
            <div className="f1-monospace" style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700, textAlign: "right" }}>SPEED</div>
          </div>

          {/* Table Rows */}
          <div style={{
            flex: 1,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "1px",
            backgroundColor: "rgba(0, 0, 0, 0.2)",
          }}>
            <AnimatePresence mode="popLayout">
              {drivers.map((driver, idx) => {
                const isSelected = selectedDriverCode === driver.code;
                const hexColor = `rgb(${driver.color[0]}, ${driver.color[1]}, ${driver.color[2]})`;
                const tyreColor = TYRE_COLORS[driver.data.tyre as keyof typeof TYRE_COLORS];
                const delta = driver.data.lap_time ? driver.data.lap_time - fastestLapTime : null;

                return (
                  <motion.div
                    key={driver.code}
                    layout
                    onClick={() => {
                      if (isSelected) {
                        setSelectedDriverCode(null);
                      } else {
                        setSelectedDriverCode(driver.code);
                      }
                    }}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "35px 35px 35px auto 70px 70px 70px 80px 70px",
                      gap: "0",
                      padding: "12px 16px",
                      alignItems: "center",
                      backgroundColor: isSelected ? "rgba(225, 6, 0, 0.2)" : "rgba(255, 255, 255, 0.02)",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                      borderLeft: `4px solid ${hexColor}`,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                    whileHover={{
                      backgroundColor: "rgba(255, 255, 255, 0.08)",
                    }}
                  >
                    <div className="f1-monospace" style={{ fontSize: "0.85rem", fontWeight: 700, color: hexColor }}>
                      {idx + 1}
                    </div>

                    <div style={{
                      width: "28px",
                      height: "20px",
                      backgroundColor: tyreColor,
                      borderRadius: "3px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.55rem",
                      fontWeight: 700,
                      color: driver.data.tyre === 1 ? "#000" : "#fff",
                    }}>
                      {TYRE_NAMES[driver.data.tyre as keyof typeof TYRE_NAMES].substring(0, 1)}
                    </div>

                    <div className="f1-monospace" style={{
                      fontSize: "0.7rem",
                      color: delta ? (delta < 100 ? "#22c55e" : "#eab308") : "#9ca3af",
                      fontWeight: 600,
                      textAlign: "center",
                    }}>
                      {delta ? (delta > 0 ? "+" : "") + (delta / 1000).toFixed(2) : "—"}
                    </div>

                    <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                      {driver.code}
                    </div>

                    <div className="f1-monospace" style={{
                      fontSize: "0.7rem",
                      textAlign: "right",
                      color: getSectorColor(driver.data.sector1, fastestS1, driver.code, 1),
                      fontWeight: getSectorColor(driver.data.sector1, fastestS1, driver.code, 1) !== "#9ca3af" ? 700 : 400,
                    }}>
                      {formatTimeDisplay(driver.data.sector1 ?? null)}
                    </div>

                    <div className="f1-monospace" style={{
                      fontSize: "0.7rem",
                      textAlign: "right",
                      color: getSectorColor(driver.data.sector2, fastestS2, driver.code, 2),
                      fontWeight: getSectorColor(driver.data.sector2, fastestS2, driver.code, 2) !== "#9ca3af" ? 700 : 400,
                    }}>
                      {formatTimeDisplay(driver.data.sector2 ?? null)}
                    </div>

                    <div className="f1-monospace" style={{
                      fontSize: "0.7rem",
                      textAlign: "right",
                      color: getSectorColor(driver.data.sector3, fastestS3, driver.code, 3),
                      fontWeight: getSectorColor(driver.data.sector3, fastestS3, driver.code, 3) !== "#9ca3af" ? 700 : 400,
                    }}>
                      {formatTimeDisplay(driver.data.sector3 ?? null)}
                    </div>

                    <div className="f1-monospace" style={{
                      fontSize: "0.75rem",
                      textAlign: "right",
                      fontWeight: driver.data.lap_time === fastestLapTime ? 700 : 600,
                      color: driver.data.lap_time === fastestLapTime ? "#a855f7" : "#fff",
                    }}>
                      {formatTimeDisplay(driver.data.lap_time ?? null)}
                    </div>

                    <div className="f1-monospace" style={{ fontSize: "0.7rem", textAlign: "right", color: "#9ca3af" }}>
                      {driver.data.speed.toFixed(0)} km/h
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Telemetry Panel */}
        {selectedDriverData && (
          <TelemetryPanel
            driver={selectedDriverData}
            isOpen={true}
            onClose={() => setSelectedDriverCode(null)}
            fastestS1={fastestS1}
            fastestS2={fastestS2}
            fastestS3={fastestS3}
            getSectorColor={getSectorColor}
          />
        )}
      </div>
    </div>
  );
};
