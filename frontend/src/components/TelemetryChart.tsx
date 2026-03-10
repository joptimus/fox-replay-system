/**
 * Real-time telemetry visualization using Recharts
 */

import React, { useState, useRef, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useSelectedDriver, useCurrentFrame } from "../store/replayStore";
import { motion } from "framer-motion";

interface TelemetryDataPoint {
  time: number;
  speed: number;
  throttle: number;
  brake: number;
  gear: number;
  drs: number;
}

export const TelemetryChart: React.FC = () => {
  const selectedDriver = useSelectedDriver();
  const currentFrame = useCurrentFrame();
  const [speedUnit, setSpeedUnit] = useState<"kmh" | "mph">("kmh");
  const telemetryHistoryRef = useRef<TelemetryDataPoint[]>([]);
  const lastFrameTimeRef = useRef<number>(-1);
  const [telemetryData, setTelemetryData] = useState<TelemetryDataPoint[]>([]);

  // All hooks must be called unconditionally
  useEffect(() => {
    telemetryHistoryRef.current = [];
    lastFrameTimeRef.current = -1;
  }, [selectedDriver?.code]);

  useEffect(() => {
    if (!currentFrame || !selectedDriver) return;

    const driverCodeInFrame = selectedDriver.code;
    const currentDriverData = currentFrame.drivers[driverCodeInFrame];
    if (!currentDriverData) return;

    if (lastFrameTimeRef.current >= 0 && Math.abs(currentFrame.t - lastFrameTimeRef.current) > 1) {
      telemetryHistoryRef.current = [];
    }

    if (currentFrame.t !== lastFrameTimeRef.current) {
      const kmhSpeed = currentDriverData.speed;

      const newPoint: TelemetryDataPoint = {
        time: currentFrame.t,
        speed: kmhSpeed,
        throttle: currentDriverData.throttle,
        brake: currentDriverData.brake,
        gear: currentDriverData.gear,
        drs: currentDriverData.drs,
      };

      const lastHistoryTime = telemetryHistoryRef.current.length > 0
        ? telemetryHistoryRef.current[telemetryHistoryRef.current.length - 1].time
        : -Infinity;

      if (currentFrame.t >= lastHistoryTime) {
        telemetryHistoryRef.current.push(newPoint);
        lastFrameTimeRef.current = currentFrame.t;

        if (telemetryHistoryRef.current.length > 300) {
          telemetryHistoryRef.current.shift();
        }

        setTelemetryData([...telemetryHistoryRef.current]);
      }
    }
  }, [currentFrame, selectedDriver?.code]);

  useEffect(() => {
    if (telemetryHistoryRef.current.length === 0) return;

    const convertedData = telemetryHistoryRef.current.map(point => ({
      ...point,
      speed: speedUnit === "kmh" ? point.speed : point.speed * 0.621371,
    }));

    setTelemetryData(convertedData);
  }, [speedUnit]);

  if (!selectedDriver || !currentFrame) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--text-faint)',
          letterSpacing: '0.08em',
        }}>NO DRIVER SELECTED</p>
      </div>
    );
  }

  const driverCodeInFrame = selectedDriver.code;
  const currentDriverData = currentFrame.drivers[driverCodeInFrame];

  if (!currentDriverData) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--text-faint)',
          letterSpacing: '0.08em',
        }}>LOADING DATA...</p>
      </div>
    );
  }

  const hexColor = `rgb(${selectedDriver.color[0]}, ${selectedDriver.color[1]}, ${selectedDriver.color[2]})`;
  const kmhSpeed = currentDriverData.speed || 0;
  const displaySpeed = speedUnit === "kmh" ? kmhSpeed : kmhSpeed * 0.621371;

  const throttlePercent = (currentDriverData.throttle || 0) > 1 ? (currentDriverData.throttle || 0) : (currentDriverData.throttle || 0) * 100;
  const brakePercent = (currentDriverData.brake || 0) > 1 ? (currentDriverData.brake || 0) : (currentDriverData.brake || 0) * 100;

  const formatTime = (seconds: number | null | undefined): string => {
    if (seconds === null || seconds === undefined || isNaN(seconds) || seconds <= 0) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(3).padStart(7, '0')}`;
  };

  const formatSectorTime = (seconds: number | null | undefined): string => {
    if (seconds === null || seconds === undefined || isNaN(seconds) || seconds <= 0) return "N/A";
    const secs = Math.floor(seconds);
    const ms = Math.round((seconds - secs) * 1000);
    return `${secs}:${ms.toString().padStart(3, '0')}`;
  };

  const formatDelta = (delta: number | null): string => {
    if (delta === null || isNaN(delta)) return "N/A";
    const sign = delta > 0 ? "+" : "";
    return `${sign}${Math.abs(delta).toFixed(3)}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', flexDirection: 'column', width: '100%' }}
    >
      {/* Meta bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 18px',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: hexColor,
          }} />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}>{selectedDriver.code}</span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-dimmed)',
          }}>LAP {currentDriverData.lap}</span>
          {(() => {
            let bgColor = 'var(--text-faint)';
            let label = 'DRS OFF';
            if ([10, 12, 14].includes(currentDriverData.drs)) {
              bgColor = 'var(--green)';
              label = 'DRS ACTIVE';
            } else if (currentDriverData.drs === 8) {
              bgColor = 'var(--yellow)';
              label = 'DRS AVAILABLE';
            }
            return (
              <span style={{
                fontFamily: 'var(--font-mono)',
                display: 'inline-block',
                padding: '2px 6px',
                background: `${bgColor}18`,
                color: bgColor,
                borderRadius: '3px',
                fontSize: '9px',
                border: `1px solid ${bgColor}30`,
                marginLeft: '6px',
              }}>{label}</span>
            );
          })()}
        </div>
        <div style={{ display: 'flex', gap: '2px' }}>
          {(['kmh', 'mph'] as const).map(unit => (
            <button
              key={unit}
              onClick={() => setSpeedUnit(unit)}
              style={{
                fontFamily: 'var(--font-mono)',
                padding: '2px 6px',
                background: speedUnit === unit ? hexColor : 'transparent',
                color: speedUnit === unit ? 'white' : 'var(--text-faint)',
                border: `1px solid ${speedUnit === unit ? hexColor : 'var(--border-color)'}`,
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '9px',
                transition: 'all 0.15s',
              }}
            >{unit.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {/* Gear Display */}
      <div style={{
        padding: '20px 18px 16px',
        textAlign: 'center',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '72px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: 1,
          marginBottom: '4px',
        }}>
          {currentDriverData.gear === 0 ? 'N' : currentDriverData.gear}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--text-faint)',
          letterSpacing: '0.15em',
        }}>GEAR</div>
      </div>

      {/* Speed / RPM - 2 column */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{
          padding: '14px 18px',
          borderRight: '1px solid var(--border-color)',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            color: 'var(--text-faint)',
            letterSpacing: '0.06em',
            marginBottom: '4px',
          }}>SPEED</div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '20px',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}>{displaySpeed.toFixed(0)}</div>
        </div>
        <div style={{ padding: '14px 18px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            color: 'var(--text-faint)',
            letterSpacing: '0.06em',
            marginBottom: '4px',
          }}>RPM</div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '20px',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}>{currentDriverData.speed > 0 ? Math.round(currentDriverData.speed * 100) : 0}</div>
        </div>
      </div>

      {/* Throttle Bar */}
      <div style={{
        padding: '14px 18px 10px',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '6px',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--text-faint)',
            letterSpacing: '0.06em',
          }}>THROTTLE</span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--green)',
          }}>{Math.min(Math.max(throttlePercent, 0), 100).toFixed(0)}%</span>
        </div>
        <div style={{
          width: '100%',
          height: '6px',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: '3px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${Math.min(Math.max(throttlePercent, 0), 100)}%`,
            height: '100%',
            background: 'linear-gradient(to right, #00c853, var(--green))',
            borderRadius: '3px',
            transition: 'width 0.1s ease',
            boxShadow: throttlePercent > 20 ? '0 0 8px rgba(0, 230, 118, 0.3)' : 'none',
          }} />
        </div>
      </div>

      {/* Brake Bar */}
      <div style={{
        padding: '14px 18px 10px',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '6px',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--text-faint)',
            letterSpacing: '0.06em',
          }}>BRAKE</span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--accent-red)',
          }}>{Math.min(Math.max(brakePercent, 0), 100).toFixed(0)}%</span>
        </div>
        <div style={{
          width: '100%',
          height: '6px',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: '3px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${Math.min(Math.max(brakePercent, 0), 100)}%`,
            height: '100%',
            background: 'linear-gradient(to right, #c7303c, var(--accent-red))',
            borderRadius: '3px',
            transition: 'width 0.1s ease',
            boxShadow: brakePercent > 20 ? '0 0 8px rgba(230, 57, 70, 0.3)' : 'none',
          }} />
        </div>
      </div>

      {/* Lap Time / Gap to Leader - 2 column */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{
          padding: '14px 18px',
          borderRight: '1px solid var(--border-color)',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            color: 'var(--text-faint)',
            letterSpacing: '0.06em',
            marginBottom: '4px',
          }}>LAP TIME</div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}>{formatTime(currentDriverData.lap_time ?? null)}</div>
        </div>
        <div style={{ padding: '14px 18px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            color: 'var(--text-faint)',
            letterSpacing: '0.06em',
            marginBottom: '4px',
          }}>GAP TO LEADER</div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '16px',
            fontWeight: 700,
            color: currentDriverData.gap_to_leader && currentDriverData.gap_to_leader > 0 ? 'var(--accent-red)' : 'var(--green)',
          }}>
            {currentDriverData.position === 1 ? 'LEADER' : formatDelta(currentDriverData.gap_to_leader && currentDriverData.gap_to_leader > 0 ? currentDriverData.gap_to_leader : null)}
          </div>
        </div>
      </div>

      {/* Sector Times */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          color: 'var(--text-faint)',
          letterSpacing: '0.06em',
          marginBottom: '8px',
        }}>SECTORS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
          {(['sector1', 'sector2', 'sector3'] as const).map((key, i) => (
            <div key={key} style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                color: 'var(--text-faint)',
                marginBottom: '2px',
              }}>S{i + 1}</div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-dimmed)',
              }}>{formatSectorTime(currentDriverData[key] ?? null)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Mini Speed Chart */}
      <div style={{ padding: '14px 18px' }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          color: 'var(--text-faint)',
          letterSpacing: '0.06em',
          marginBottom: '6px',
        }}>SPEED HISTORY</div>
        <ResponsiveContainer width="100%" height={100}>
          <AreaChart data={telemetryData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorSpeed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={hexColor} stopOpacity={0.4} />
                <stop offset="95%" stopColor={hexColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="time" stroke="transparent" hide={true} />
            <YAxis stroke="transparent" width={30} tick={{ fill: 'var(--text-faint)', fontSize: 9, fontFamily: 'var(--font-mono)' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--bg-panel)',
                border: '1px solid var(--border-color)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                borderRadius: '4px',
              }}
              labelStyle={{ color: 'var(--text-primary)' }}
              animationDuration={0}
            />
            <Area
              type="natural"
              dataKey="speed"
              stroke={hexColor}
              strokeWidth={1.5}
              fillOpacity={1}
              fill="url(#colorSpeed)"
              animationDuration={500}
              animationEasing="ease-in-out"
              isAnimationActive={true}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default TelemetryChart;
