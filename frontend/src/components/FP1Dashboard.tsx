/**
 * FP1 Dashboard - Expanded leader table with detailed telemetry columns
 */

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCurrentFrame, useSelectedDriver, useReplayStore } from "../store/replayStore";

const TYRE_MAP: Record<number, string> = {
  0: '0.0.png', 1: '1.0.png', 2: '2.0.png', 3: '3.0.png', 4: '4.0.png'
};

interface ColumnDef {
  key: string;
  label: string;
  width: string;
  format: (value: any, data: any, leader?: any) => string;
  align?: 'left' | 'center' | 'right';
}

export const FP1Dashboard: React.FC = () => {
  const currentFrame = useCurrentFrame();
  const selectedDriver = useSelectedDriver();
  const { setSelectedDriver } = useReplayStore();
  const session = useReplayStore((state) => state.session);
  const metadata = session?.metadata;

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
    .sort((a, b) => a.position - b.position);

  const fastestLap = drivers.reduce((fastest, driver) => {
    if (!driver.data.lap_time || driver.data.lap_time === 0) return fastest;
    if (!fastest || (driver.data.lap_time > 0 && driver.data.lap_time < fastest.data.lap_time)) {
      return driver;
    }
    return fastest;
  }, null as typeof drivers[0] | null);

  const columns: ColumnDef[] = [
    {
      key: 'pos',
      label: 'POS',
      width: '45px',
      align: 'center',
      format: (_, driver) => driver.position.toString(),
    },
    {
      key: 'driver',
      label: 'DRIVER',
      width: '60px',
      align: 'left',
      format: (_, driver) => driver.code,
    },
    {
      key: 'lap',
      label: 'LAP',
      width: '45px',
      align: 'center',
      format: (_, driver) => driver.data.lap.toString(),
    },
    {
      key: 'sector1',
      label: 'S1',
      width: '75px',
      align: 'right',
      format: (_, driver, leader) => {
        if (!driver.data.sector1 || driver.data.sector1 === 0) return '-';
        const sector1 = driver.data.sector1 / 1000; // Convert ms to seconds
        const fastestS1 = leader?.data.sector1 ? leader.data.sector1 / 1000 : null;
        const delta = fastestS1 ? sector1 - fastestS1 : null;
        const deltaStr = delta ? (delta > 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3)) : '';
        return `${sector1.toFixed(3)}${deltaStr ? ` (${deltaStr})` : ''}`;
      },
    },
    {
      key: 'sector2',
      label: 'S2',
      width: '75px',
      align: 'right',
      format: (_, driver, leader) => {
        if (!driver.data.sector2 || driver.data.sector2 === 0) return '-';
        const sector2 = driver.data.sector2 / 1000;
        const fastestS2 = leader?.data.sector2 ? leader.data.sector2 / 1000 : null;
        const delta = fastestS2 ? sector2 - fastestS2 : null;
        const deltaStr = delta ? (delta > 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3)) : '';
        return `${sector2.toFixed(3)}${deltaStr ? ` (${deltaStr})` : ''}`;
      },
    },
    {
      key: 'sector3',
      label: 'S3',
      width: '75px',
      align: 'right',
      format: (_, driver, leader) => {
        if (!driver.data.sector3 || driver.data.sector3 === 0) return '-';
        const sector3 = driver.data.sector3 / 1000;
        const fastestS3 = leader?.data.sector3 ? leader.data.sector3 / 1000 : null;
        const delta = fastestS3 ? sector3 - fastestS3 : null;
        const deltaStr = delta ? (delta > 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3)) : '';
        return `${sector3.toFixed(3)}${deltaStr ? ` (${deltaStr})` : ''}`;
      },
    },
    {
      key: 'lapTime',
      label: 'LAP TIME',
      width: '85px',
      align: 'right',
      format: (_, driver, leader) => {
        if (!driver.data.lap_time || driver.data.lap_time === 0) return '-';
        const lapTime = driver.data.lap_time / 1000;
        const fastestTime = leader?.data.lap_time ? leader.data.lap_time / 1000 : null;
        const delta = fastestTime ? lapTime - fastestTime : null;
        const deltaStr = delta && delta !== 0 ? (delta > 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3)) : '';
        return `${lapTime.toFixed(3)}${deltaStr ? ` (${deltaStr})` : ''}`;
      },
    },
    {
      key: 'topSpeed',
      label: 'TOP SPEED',
      width: '80px',
      align: 'right',
      format: (_, driver) => `${driver.data.speed.toFixed(1)} km/h`,
    },
    {
      key: 'gear',
      label: 'GEAR',
      width: '50px',
      align: 'center',
      format: (_, driver) => driver.data.gear.toString(),
    },
    {
      key: 'throttle',
      label: 'THR',
      width: '50px',
      align: 'right',
      format: (_, driver) => `${driver.data.throttle.toFixed(0)}%`,
    },
    {
      key: 'brake',
      label: 'BRK',
      width: '50px',
      align: 'right',
      format: (_, driver) => `${driver.data.brake.toFixed(0)}%`,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--f1-black)' }}>
      {/* Header */}
      <div style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--f1-border)' }}>
        <div className="f1-monospace" style={{ fontSize: '0.85rem', color: '#e10600', fontWeight: 900, marginBottom: '4px' }}>
          FP1 - PRACTICE SESSION
        </div>
        <div className="f1-monospace" style={{ fontSize: '0.65rem', color: '#9ca3af' }}>
          TIME: {currentFrame?.t ? (currentFrame.t / 60).toFixed(2) : '0.00'}m | FRAME: {currentFrame?.t !== undefined ? Math.round(currentFrame.t * 25) : 0}
        </div>
      </div>

      {/* Column Headers */}
      <div style={{
        display: 'flex',
        gap: '8px',
        paddingBottom: '8px',
        borderBottom: '1px solid var(--f1-border)',
        marginBottom: '8px',
        overflow: 'hidden',
        alignItems: 'center',
      }}>
        {columns.map(col => (
          <div
            key={col.key}
            style={{
              width: col.width,
              flexShrink: 0,
              fontSize: '0.65rem',
              fontWeight: 600,
              color: '#9ca3af',
              textAlign: col.align || 'left',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {col.label}
          </div>
        ))}
      </div>

      {/* Driver Rows */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <AnimatePresence mode="popLayout">
          {drivers.map((driver) => {
            const isSelected = selectedDriver?.code === driver.code;
            const hexColor = `rgb(${driver.color[0]}, ${driver.color[1]}, ${driver.color[2]})`;

            return (
              <motion.div
                key={driver.code}
                layout
                onClick={() => {
                  if (isSelected) {
                    setSelectedDriver(null);
                  } else {
                    setSelectedDriver({ code: driver.code, data: driver.data, color: driver.color });
                  }
                }}
                style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '8px 4px',
                  marginBottom: '4px',
                  borderLeft: `3px solid ${hexColor}`,
                  borderRadius: '2px',
                  backgroundColor: isSelected ? 'rgba(225, 6, 0, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  alignItems: 'center',
                  overflow: 'hidden',
                  backdropFilter: 'blur(4px)',
                }}
                whileHover={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  paddingLeft: '8px',
                }}
              >
                {columns.map(col => (
                  <div
                    key={col.key}
                    style={{
                      width: col.width,
                      flexShrink: 0,
                      fontSize: '0.7rem',
                      fontFamily: 'monospace',
                      textAlign: col.align || 'left',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.format(null, driver, fastestLap)}
                  </div>
                ))}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid var(--f1-border)',
        marginTop: '12px',
        paddingTop: '8px',
        fontSize: '0.65rem',
        color: '#9ca3af',
      }}>
        <div className="f1-monospace">
          {fastestLap ? `Fastest: ${fastestLap.code} - ${(fastestLap.data.lap_time / 1000).toFixed(3)}s` : 'No lap times yet'}
        </div>
      </div>
    </div>
  );
};
