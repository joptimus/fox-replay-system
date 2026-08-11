import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCurrentFrame, useReplayStore } from "../store/replayStore";
import { TYRE_NAMES, TYRE_COLORS } from "../types";

const TYRE_MAP: Record<number, string> = {
  0: '0.0.png', 1: '1.0.png', 2: '2.0.png', 3: '3.0.png', 4: '4.0.png'
};

const formatSectorTimePanel = (seconds: number | null): string => {
  if (!seconds || seconds <= 0) return "-";
  if (seconds < 60) {
    return seconds.toFixed(3);
  } else {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toFixed(3).padStart(6, '0')}`;
  }
};

const formatLapTimePanel = (seconds: number | null): string => {
  if (!seconds || seconds <= 0) return "-";
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toFixed(3).padStart(6, '0')}`;
};

interface DriverSectorColors {
  s1: string;
  s2: string;
  s3: string;
}

const NORMAL_SECTOR_COLOR = "#9ca3af";

const DEFAULT_SECTOR_COLORS: DriverSectorColors = {
  s1: NORMAL_SECTOR_COLOR,
  s2: NORMAL_SECTOR_COLOR,
  s3: NORMAL_SECTOR_COLOR,
};

const TelemetryPanel: React.FC<{
  driver: any;
  isOpen: boolean;
  onClose: () => void;
  sectorColors: DriverSectorColors;
}> = ({ driver, isOpen, onClose, sectorColors }) => {

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
              LIVE TELEMETRY
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <div className="f1-monospace" style={{ fontSize: "0.65rem", color: "#6b7280", marginBottom: "6px" }}>LAP</div>
              <div className="f1-monospace" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{driver.data.lap}</div>
            </div>

            <div>
              <div className="f1-monospace" style={{ fontSize: "0.65rem", color: "#6b7280", marginBottom: "6px" }}>SPEED</div>
              <div className="f1-monospace" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{driver.data.speed.toFixed(0)} km/h</div>
            </div>

            <div>
              <div className="f1-monospace" style={{ fontSize: "0.65rem", color: "#6b7280", marginBottom: "6px" }}>GEAR</div>
              <div className="f1-monospace" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{driver.data.gear === 0 ? 'N' : driver.data.gear}</div>
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
                      color: sectorColors.s1,
                      fontWeight: sectorColors.s1 !== NORMAL_SECTOR_COLOR ? 700 : 600,
                    }}>{formatSectorTimePanel(driver.data.sector1)}</span>
                  </div>
                )}
                {driver.data.sector2 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="f1-monospace" style={{ fontSize: "0.75rem", color: "#9ca3af" }}>S2</span>
                    <span className="f1-monospace" style={{
                      fontSize: "0.85rem",
                      color: sectorColors.s2,
                      fontWeight: sectorColors.s2 !== NORMAL_SECTOR_COLOR ? 700 : 600,
                    }}>{formatSectorTimePanel(driver.data.sector2)}</span>
                  </div>
                )}
                {driver.data.sector3 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="f1-monospace" style={{ fontSize: "0.75rem", color: "#9ca3af" }}>S3</span>
                    <span className="f1-monospace" style={{
                      fontSize: "0.85rem",
                      color: sectorColors.s3,
                      fontWeight: sectorColors.s3 !== NORMAL_SECTOR_COLOR ? 700 : 600,
                    }}>{formatSectorTimePanel(driver.data.sector3)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {driver.data.lap_time && driver.data.lap_time > 0 && (
            <div style={{ paddingTop: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
              <div className="f1-monospace" style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "8px" }}>LAP TIME</div>
              <div className="f1-monospace" style={{ fontSize: "1.75rem", fontWeight: 700 }}>{formatLapTimePanel(driver.data.lap_time)}</div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const FP1Dashboard: React.FC = () => {
  const currentFrame = useCurrentFrame();
  const driverColors = useReplayStore((state) => state.session?.metadata?.driver_colors);
  const [selectedDriverCode, setSelectedDriverCode] = useState<string | null>(null);

  const drivers = useMemo(() => {
    if (!currentFrame?.drivers || !driverColors) return [];
    return Object.entries(currentFrame.drivers)
      .map(([code, data]) => ({
        code,
        data,
        position: data.position,
        color: driverColors[code] || [255, 255, 255],
      }))
      .sort((a, b) => a.position - b.position);
  }, [currentFrame, driverColors]);

  // Precompute session-fastest and per-driver best/worst sector colors once per
  // frame so each cell is a simple lookup instead of an O(n^2) recomputation.
  const sectorColorMap = useMemo(() => {
    const collectTimes = (key: 'sector1' | 'sector2' | 'sector3') =>
      drivers.map(d => d.data[key]).filter((t): t is number => t !== null && t !== undefined);

    const s1Times = collectTimes('sector1');
    const s2Times = collectTimes('sector2');
    const s3Times = collectTimes('sector3');

    const fastestS1 = Math.min(...drivers.filter(d => d.data.sector1).map(d => d.data.sector1 as number));
    const fastestS2 = Math.min(...drivers.filter(d => d.data.sector2).map(d => d.data.sector2 as number));
    const fastestS3 = Math.min(...drivers.filter(d => d.data.sector3).map(d => d.data.sector3 as number));

    const minS1 = Math.min(...s1Times);
    const minS2 = Math.min(...s2Times);
    const minS3 = Math.min(...s3Times);
    const maxS1 = Math.max(...s1Times);
    const maxS2 = Math.max(...s2Times);
    const maxS3 = Math.max(...s3Times);

    const colorFor = (sectorTime: number | null | undefined, fastest: number, min: number, max: number): string => {
      if (!sectorTime) return NORMAL_SECTOR_COLOR;

      const isBest = sectorTime === min;
      const isWorst = sectorTime === max;
      const isFastest = Math.abs(sectorTime - fastest) < 0.1;

      if (isFastest) return "#a855f7"; // Purple - session fastest
      if (isBest && !isWorst) return "#22c55e"; // Green - driver's personal best
      if (isWorst) return "#eab308"; // Yellow - driver's personal worst
      return NORMAL_SECTOR_COLOR; // Gray - normal
    };

    const colors: Record<string, DriverSectorColors> = {};
    for (const driver of drivers) {
      colors[driver.code] = {
        s1: colorFor(driver.data.sector1, fastestS1, minS1, maxS1),
        s2: colorFor(driver.data.sector2, fastestS2, minS2, maxS2),
        s3: colorFor(driver.data.sector3, fastestS3, minS3, maxS3),
      };
    }
    return colors;
  }, [drivers]);

  if (!currentFrame || !currentFrame.drivers || !driverColors) {
    return <div className="p-4 f1-monospace">LOADING...</div>;
  }

  const formatSectorTime = (seconds: number | null): string => {
    if (!seconds || seconds <= 0) return "-";
    if (seconds < 60) {
      return seconds.toFixed(3);
    } else {
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${minutes}:${secs.toFixed(3).padStart(6, '0')}`;
    }
  };

  const formatLapTime = (seconds: number | null): string => {
    if (!seconds || seconds <= 0) return "-";
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toFixed(3).padStart(6, '0')}`;
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
          FP1 - PRACTICE SESSION
        </div>
        <div className="f1-monospace" style={{
          fontSize: "0.7rem",
          color: "#9ca3af",
        }}>
          TIME: {currentFrame?.t ? (currentFrame.t / 60).toFixed(2) : '0.00'}m | LAP: {currentFrame?.lap || 0}
        </div>
      </div>

      {/* Main Content Container */}
      <div style={{
        flex: 1,
        overflow: "hidden",
        display: "flex",
        minHeight: 0,
        position: "relative",
      }}>
        {/* Drivers Table */}
        <div style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "1px",
          backgroundColor: "rgba(0, 0, 0, 0.2)",
        }}>
          {/* Table Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 24px",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            borderBottom: "2px solid var(--f1-border)",
            position: "sticky",
            top: 0,
            zIndex: 10,
            flexShrink: 0,
          }}>
            <div className="f1-monospace" style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700, flex: 1, minWidth: "40px" }}>POS</div>
            <div className="f1-monospace" style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700, flex: 1, minWidth: "40px" }}>LAP</div>
            <div className="f1-monospace" style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700, flex: 1, minWidth: "40px" }}>TYR</div>
            <div className="f1-monospace" style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700, flex: 2, minWidth: "60px" }}>DRIVER</div>
            <div className="f1-monospace" style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700, flex: 1, minWidth: "60px", textAlign: "right" }}>S1</div>
            <div className="f1-monospace" style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700, flex: 1, minWidth: "60px", textAlign: "right" }}>S2</div>
            <div className="f1-monospace" style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700, flex: 1, minWidth: "60px", textAlign: "right" }}>S3</div>
            <div className="f1-monospace" style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700, flex: 1.5, minWidth: "80px", textAlign: "right" }}>LAP TIME</div>
            <div className="f1-monospace" style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 700, flex: 1, minWidth: "50px", textAlign: "right" }}>SPEED</div>
          </div>

          {/* Table Rows */}
          <AnimatePresence mode="popLayout">
            {drivers.map((driver) => {
              const isSelected = selectedDriverCode === driver.code;
              const hexColor = `rgb(${driver.color[0]}, ${driver.color[1]}, ${driver.color[2]})`;
              const sectorColors = sectorColorMap[driver.code] ?? DEFAULT_SECTOR_COLORS;

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
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "12px 24px",
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
                  <div className="f1-monospace" style={{ fontSize: "0.85rem", fontWeight: 700, color: hexColor, flex: 1, minWidth: "40px" }}>
                    {driver.position}
                  </div>

                  <div className="f1-monospace" style={{ fontSize: "0.85rem", fontWeight: 600, flex: 1, minWidth: "40px" }}>
                    {driver.data.lap}
                  </div>

                  <div style={{ flex: 1, minWidth: "40px" }}>
                    <img
                      src={`/images/tyres/${TYRE_MAP[driver.data.tyre] || '2.0.png'}`}
                      alt="tyre"
                      style={{ height: "20px", width: "auto" }}
                      onError={(e) => (e.currentTarget.style.opacity = '0')}
                    />
                  </div>

                  <div style={{ fontSize: "0.9rem", fontWeight: 600, flex: 2, minWidth: "60px" }}>
                    {driver.code}
                  </div>

                  <div className="f1-monospace" style={{
                    fontSize: "0.75rem",
                    textAlign: "right",
                    flex: 1,
                    minWidth: "60px",
                    color: sectorColors.s1,
                    fontWeight: sectorColors.s1 !== NORMAL_SECTOR_COLOR ? 700 : 400,
                  }}>
                    {formatSectorTime(driver.data.sector1 ?? null)}
                  </div>

                  <div className="f1-monospace" style={{
                    fontSize: "0.75rem",
                    textAlign: "right",
                    flex: 1,
                    minWidth: "60px",
                    color: sectorColors.s2,
                    fontWeight: sectorColors.s2 !== NORMAL_SECTOR_COLOR ? 700 : 400,
                  }}>
                    {formatSectorTime(driver.data.sector2 ?? null)}
                  </div>

                  <div className="f1-monospace" style={{
                    fontSize: "0.75rem",
                    textAlign: "right",
                    flex: 1,
                    minWidth: "60px",
                    color: sectorColors.s3,
                    fontWeight: sectorColors.s3 !== NORMAL_SECTOR_COLOR ? 700 : 400,
                  }}>
                    {formatSectorTime(driver.data.sector3 ?? null)}
                  </div>

                  <div className="f1-monospace" style={{ fontSize: "0.75rem", textAlign: "right", fontWeight: 600, flex: 1.5, minWidth: "80px" }}>
                    {formatLapTime(driver.data.lap_time ?? null)}
                  </div>

                  <div className="f1-monospace" style={{ fontSize: "0.75rem", textAlign: "right", color: "#9ca3af", flex: 1, minWidth: "50px" }}>
                    {driver.data.speed.toFixed(0)}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Telemetry Panel */}
        {selectedDriverData && (
          <TelemetryPanel
            driver={selectedDriverData}
            isOpen={true}
            onClose={() => setSelectedDriverCode(null)}
            sectorColors={sectorColorMap[selectedDriverData.code] ?? DEFAULT_SECTOR_COLORS}
          />
        )}
      </div>
    </div>
  );
};
