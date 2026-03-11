import React from "react";

interface Driver {
  code: string;
  lapTime: number;
  finished: boolean;
}

interface QualiLeaderboardProps {
  drivers: Driver[];
  driverColors: Record<string, number[]>;
  selectedDriver: string | null;
  eliminatedDrivers: string[];
  onDriverClick: (code: string) => void;
  cutoff: number;
  activeSegment: string;
  eliminatesLabel: string | null;
  onTrackDrivers: Set<string>;
  totalDrivers: number;
}

export const QualiLeaderboard: React.FC<QualiLeaderboardProps> = ({
  drivers,
  driverColors,
  selectedDriver,
  eliminatedDrivers,
  onDriverClick,
  cutoff,
  activeSegment,
  eliminatesLabel,
  onTrackDrivers,
  totalDrivers,
}) => {
  const sortedDrivers = [...drivers].sort((a, b) => a.lapTime - b.lapTime);
  const fastestLap = sortedDrivers[0]?.lapTime ?? 0;
  const onTrackCount = onTrackDrivers.size;

  const formatLapTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(3).padStart(6, "0")}`;
  };

  const getPositionColor = (pos: number) => {
    if (pos <= 3) return "#00e676";
    if (pos > cutoff && eliminatesLabel) return "#e63946";
    return "#e8e8ee";
  };

  const isInKnockoutZone = (pos: number) => {
    return eliminatesLabel !== null && pos > cutoff;
  };

  const rows: React.ReactNode[] = [];
  let eliminationLineInserted = false;

  sortedDrivers.forEach((driver, idx) => {
    const pos = idx + 1;
    const color = driverColors[driver.code] || [128, 128, 128];
    const isSelected = driver.code === selectedDriver;
    const isEliminated = eliminatedDrivers.includes(driver.code);
    const knockout = isInKnockoutZone(pos);
    const isOnTrack = onTrackDrivers.has(driver.code);
    const gap = idx === 0 ? null : driver.lapTime - fastestLap;
    const isFastest = idx === 0;

    if (!eliminationLineInserted && knockout && eliminatesLabel) {
      eliminationLineInserted = true;
      rows.push(
        <div
          key="elimination-line"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 12px',
            background: 'rgba(230,57,70,0.06)',
          }}
        >
          <div style={{ flex: 1, height: '1px', background: 'rgba(230,57,70,0.12)' }} />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '8px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: '#e63946',
            whiteSpace: 'nowrap',
          }}>
            ELIMINATION ZONE
          </span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(230,57,70,0.12)' }} />
        </div>
      );
    }

    let rowBg = 'transparent';
    if (isSelected && knockout) rowBg = 'rgba(230,57,70,0.09)';
    else if (isSelected) rowBg = 'rgba(255,255,255,0.03)';
    else if (knockout) rowBg = 'rgba(230,57,70,0.06)';

    rows.push(
      <button
        key={driver.code}
        onClick={() => onDriverClick(driver.code)}
        style={{
          display: 'grid',
          gridTemplateColumns: '30px 6px 52px 1fr 82px 42px',
          alignItems: 'center',
          padding: '9px 12px',
          border: 'none',
          borderBottom: '1px solid rgba(255,255,255,0.055)',
          cursor: 'pointer',
          transition: 'background 0.1s',
          background: rowBg,
          width: '100%',
          textAlign: 'left',
          opacity: isEliminated ? 0.3 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.background = knockout
              ? 'rgba(230,57,70,0.09)'
              : 'rgba(255,255,255,0.015)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.background = knockout
              ? 'rgba(230,57,70,0.06)'
              : 'transparent';
          }
        }}
      >
        {/* Position */}
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          fontWeight: 800,
          color: getPositionColor(pos),
          textAlign: 'center',
        }}>
          {pos}
        </span>

        {/* Team dot */}
        <div style={{
          width: '5px',
          height: '5px',
          borderRadius: '50%',
          background: `rgb(${color[0]},${color[1]},${color[2]})`,
          opacity: 0.7,
        }} />

        {/* Driver code + on-track dot */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            fontWeight: 700,
            color: knockout ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.85)',
          }}>
            {driver.code}
          </span>
          {isOnTrack && (
            <span
              className="quali-blink"
              style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: '#00e676',
                boxShadow: '0 0 6px rgba(0,230,118,0.38)',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
          )}
        </div>

        {/* Gap area */}
        <div style={{ textAlign: 'right', paddingRight: '8px' }}>
          {gap !== null && (
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: '#666680',
            }}>
              +{gap.toFixed(3)}
            </span>
          )}
        </div>

        {/* Lap time */}
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          fontWeight: 700,
          color: knockout
            ? 'rgba(255,255,255,0.5)'
            : isFastest
            ? '#b388ff'
            : '#e8e8ee',
          textAlign: 'right',
        }}>
          {formatLapTime(driver.lapTime)}
        </span>

        {/* Sector status dots (placeholder - no sector data available) */}
        <div style={{
          display: 'flex',
          gap: '4px',
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}>
          {[0, 1, 2].map((s) => (
            <div
              key={s}
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.1)',
              }}
            />
          ))}
        </div>
      </button>
    );
  });

  return (
    <>
      {/* Tower Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: '#e63946',
          }}>
            LEADERBOARD
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: '#3a3a50',
            marginTop: '2px',
          }}>
            {activeSegment}
            {eliminatesLabel && ` \u00B7 Elimination: ${eliminatesLabel}`}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            color: '#3a3a50',
            letterSpacing: '0.08em',
          }}>
            ON TRACK
          </div>
          <div>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              fontWeight: 700,
              color: '#00e676',
            }}>
              {onTrackCount}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              fontWeight: 400,
              color: '#3a3a50',
            }}>
              /{totalDrivers}
            </span>
          </div>
        </div>
      </div>

      {/* Column Headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '30px 6px 52px 1fr 82px 42px',
        padding: '8px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
      }}>
        <span style={colHeaderStyle}>P</span>
        <span />
        <span style={colHeaderStyle}>DRIVER</span>
        <span />
        <span style={{ ...colHeaderStyle, textAlign: 'right' }}>TIME</span>
        <span style={{ ...colHeaderStyle, textAlign: 'right' }}>SECT</span>
      </div>

      {/* Driver Rows */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {rows}
      </div>
    </>
  );
};

const colHeaderStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '8px',
  color: '#3a3a50',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
};
