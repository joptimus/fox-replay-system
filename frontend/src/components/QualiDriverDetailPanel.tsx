import React, { useMemo } from "react";

interface Driver {
  code: string;
  lapTime: number;
  finished: boolean;
  speed: number;
  gear: number;
  throttle: number;
  brake: number;
}

interface QualiDriverDetailPanelProps {
  selectedDriver: string | null;
  drivers: Driver[];
  driverColors: Record<string, number[]>;
  onTrackDrivers: Set<string>;
}

export const QualiDriverDetailPanel: React.FC<QualiDriverDetailPanelProps> = ({
  selectedDriver,
  drivers,
  driverColors,
  onTrackDrivers,
}) => {
  const sortedDrivers = useMemo(
    () => [...drivers].sort((a, b) => a.lapTime - b.lapTime),
    [drivers]
  );

  const driverData = useMemo(() => {
    if (!selectedDriver) return null;
    const d = drivers.find((d) => d.code === selectedDriver);
    if (!d) return null;
    const pos = sortedDrivers.findIndex((s) => s.code === selectedDriver) + 1;
    const fastest = sortedDrivers[0]?.lapTime ?? 0;
    const gap = pos === 1 ? 0 : d.lapTime - fastest;
    return { ...d, position: pos, gap };
  }, [selectedDriver, drivers, sortedDrivers]);

  if (!selectedDriver || !driverData) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        color: '#3a3a50',
        letterSpacing: '0.08em',
        padding: '20px',
        textAlign: 'center',
      }}>
        SELECT A DRIVER FROM THE TIMING TOWER
      </div>
    );
  }

  const color = driverColors[selectedDriver] || [128, 128, 128];
  const colorStr = `rgb(${color[0]},${color[1]},${color[2]})`;
  const isOnTrack = onTrackDrivers.has(selectedDriver);
  const isFastest = driverData.position === 1;

  const formatLapTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(3).padStart(6, "0")}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      {/* Driver Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
        background: `linear-gradient(160deg, ${colorStr}08, transparent 60%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Position badge */}
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: `${colorStr}18`,
            border: `1px solid ${colorStr}40`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: '14px',
            fontWeight: 800,
            color: colorStr,
          }}>
            {driverData.position}
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '16px',
              fontWeight: 800,
              color: '#e8e8ee',
            }}>
              {selectedDriver}
            </div>
          </div>
        </div>

        {isOnTrack && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            fontWeight: 700,
            color: '#00e676',
            background: 'rgba(0,230,118,0.07)',
            border: '1px solid rgba(0,230,118,0.15)',
            padding: '3px 8px',
            borderRadius: '4px',
          }}>
            ON TRACK
          </span>
        )}
      </div>

      {/* Best Time */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          color: '#3a3a50',
          letterSpacing: '0.12em',
          marginBottom: '6px',
        }}>
          BEST TIME
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '24px',
          fontWeight: 700,
          color: isFastest ? '#b388ff' : '#e8e8ee',
        }}>
          {formatLapTime(driverData.lapTime)}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          marginTop: '4px',
          color: isFastest ? '#3a3a50' : '#666680',
        }}>
          {isFastest ? 'Session leader' : `Gap: +${driverData.gap.toFixed(3)}`}
        </div>
      </div>

      {/* Sector Times */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          color: '#3a3a50',
          letterSpacing: '0.12em',
          marginBottom: '12px',
        }}>
          SECTOR TIMES
        </div>
        {SECTORS.map((sector, idx) => (
          <div
            key={sector.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 0',
              borderBottom: idx < 2 ? '1px solid rgba(255,255,255,0.02)' : 'none',
            }}
          >
            <div style={{
              width: '4px',
              height: '22px',
              borderRadius: '2px',
              background: sector.color,
            }} />
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: '#666680',
              fontWeight: 600,
              width: '20px',
            }}>
              {sector.label}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              fontWeight: 700,
              flex: 1,
              color: '#3a3a50',
            }}>
              &mdash;
            </span>
          </div>
        ))}
      </div>

      {/* Theoretical Best */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          color: '#3a3a50',
          letterSpacing: '0.12em',
          marginBottom: '6px',
        }}>
          THEORETICAL BEST
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '16px',
          fontWeight: 700,
          color: '#3a3a50',
        }}>
          &mdash;
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: '#3a3a50',
          marginTop: '2px',
        }}>
          Sum of best sectors this session
        </div>
      </div>

      {/* Lap History */}
      <div style={{ padding: '14px 16px', flex: 1 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            color: '#3a3a50',
            letterSpacing: '0.12em',
          }}>
            LAP HISTORY
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            color: '#3a3a50',
          }}>
            1 LAP
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '28px 24px 1fr 16px',
          gap: '8px',
          padding: '7px 0',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.02)',
          background: 'rgba(179,136,255,0.04)',
          borderRadius: '4px',
          paddingLeft: '6px',
          paddingRight: '6px',
        }}>
          {/* Lap number */}
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 600,
            color: '#666680',
          }}>
            1
          </span>
          {/* Tyre placeholder */}
          <div style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            border: '1.5px solid #e63946',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: '8px',
            fontWeight: 800,
            color: '#e63946',
          }}>
            S
          </div>
          {/* Time */}
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            fontWeight: 700,
            color: '#b388ff',
          }}>
            {formatLapTime(driverData.lapTime)}
          </span>
          {/* Best indicator */}
          <span style={{
            fontSize: '8px',
            color: '#b388ff',
          }}>
            &#9733;
          </span>
        </div>
      </div>
    </div>
  );
};

const SECTORS = [
  { label: 'S1', color: '#1a8a8a' },
  { label: 'S2', color: '#8a3d6e' },
  { label: 'S3', color: '#8a7a2e' },
];
