import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCurrentFrame, useSelectedDriver, useReplayStore } from "../store/replayStore";

const TYRE_MAP: Record<number, string> = {
  0: '0.0.png', 1: '1.0.png', 2: '2.0.png', 3: '3.0.png', 4: '4.0.png'
};

export const Leaderboard: React.FC = () => {
  const currentFrame = useCurrentFrame();
  const selectedDriver = useSelectedDriver();
  const { setSelectedDriver } = useReplayStore();
  const session = useReplayStore((state) => state.session);
  const metadata = session?.metadata;

  const drivers = React.useMemo(() => {
    if (!currentFrame?.drivers) return [];
    return Object.entries(currentFrame.drivers)
      .map(([code, data]) => {
        const isRetired = data.status === "Retired" || data.status === "+1L" || data.status?.includes("DNF");
        const isOut = isRetired;
        return {
          code,
          data,
          position: data.position,
          color: metadata?.driver_colors?.[code] || [255, 255, 255],
          isOut,
        };
      })
      .sort((a, b) => a.position - b.position);
  }, [currentFrame, metadata?.driver_colors]);

  const isSafetyCarActive = React.useMemo(() => {
    if (!metadata?.track_statuses || !currentFrame) return false;
    const currentTime = currentFrame.t;
    return metadata.track_statuses.some(
      (status) => status.status === "4" && status.start_time <= currentTime && (status.end_time === null || currentTime < status.end_time)
    );
  }, [metadata?.track_statuses, currentFrame]);

  if (!currentFrame || !metadata || !currentFrame.drivers) return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      width: '100%',
      fontFamily: 'var(--font-mono)',
      fontSize: '11px',
      color: 'var(--text-faint)',
      letterSpacing: '0.06em',
    }}>
      SELECT A RACE
    </div>
  );

  const totalLaps = metadata?.total_laps || 0;
  const currentLap = currentFrame?.lap || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, width: '100%' }}>
      <AnimatePresence mode="wait">
        {isSafetyCarActive && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            style={{ width: '100%', overflow: 'hidden', flexShrink: 0 }}
          >
            <img
              src="/images/fia/safetycar.png"
              alt="Safety Car"
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lap info header */}
      <div style={{
        padding: '12px 14px 10px',
        borderBottom: '1px solid var(--border-color)',
        flexShrink: 0,
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--text-dimmed)',
          marginBottom: '4px',
        }}>
          LAP: <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: 'var(--accent-red)' }}>{currentLap}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-faint)' }}>/{totalLaps}</span>
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--text-faint)',
        }}>
          TIME: {currentFrame?.t ? (currentFrame.t / 60).toFixed(2) : '0.00'}m | FRAME: {currentFrame?.t !== undefined ? Math.round(currentFrame.t * 25) : 0}
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px 8px',
        borderBottom: '1px solid var(--border-color)',
        flexShrink: 0,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--accent-red)',
          letterSpacing: '0.06em',
        }}>STANDINGS</span>
        <div style={{ display: 'flex', gap: '16px', marginRight: '8px', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-faint)', width: '40px', textAlign: 'right', letterSpacing: '0.06em' }}>GAP</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-faint)', width: '40px', textAlign: 'right', letterSpacing: '0.06em' }}>LEADER</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-faint)', width: '24px', textAlign: 'center', letterSpacing: '0.06em' }}>TYRE</span>
        </div>
      </div>

      {/* Driver rows */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <AnimatePresence mode="popLayout">
          {drivers.map(({ code, data, position, color, isOut }, index) => {
            const isSelected = selectedDriver?.code === code;
            const hexColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            const isFirstOutDriver = isOut && (index === 0 || !drivers[index - 1]?.isOut);

            const gap_to_previous = data.gap_to_previous || 0;
            const gap_to_leader = data.gap_to_leader || 0;

            const formatGap = (gapSeconds: number): string => {
              if (gapSeconds === 0) return "-";
              return `+${gapSeconds.toFixed(3)}`;
            };

            const gapToPrevious = formatGap(gap_to_previous);
            const gapToLeader = formatGap(gap_to_leader);

            return (
              <React.Fragment key={code}>
                {isFirstOutDriver && currentLap > 1 && (
                  <div style={{
                    padding: '6px 0',
                    margin: '2px 0',
                    borderTop: '1px solid rgba(230, 57, 70, 0.2)',
                    borderBottom: '1px solid rgba(230, 57, 70, 0.2)',
                    textAlign: 'center',
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '9px',
                      color: 'var(--accent-red)',
                      letterSpacing: '0.06em',
                    }}>RETIRED</span>
                  </div>
                )}
                <motion.div
                  layout
                  onClick={() => {
                    if (isSelected) {
                      setSelectedDriver(null);
                    } else {
                      setSelectedDriver({ code, data, color });
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: '38px',
                    minHeight: '38px',
                    padding: '0 14px',
                    cursor: 'pointer',
                    borderLeft: `3px solid ${isOut ? 'var(--text-faint)' : hexColor}`,
                    borderBottom: '1px solid var(--border-color)',
                    opacity: isOut ? 0.4 : 1,
                    background: isSelected
                      ? `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.05)`
                      : 'transparent',
                    transition: 'background 0.15s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as any).style.background = 'rgba(255,255,255,0.02)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as any).style.background = 'transparent';
                    }
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    width: '24px',
                    fontWeight: 700,
                    fontSize: '13px',
                    color: isOut ? 'var(--text-faint)' : (isSelected ? 'var(--text-primary)' : 'var(--text-dimmed)'),
                  }}>{position}</span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    width: '40px',
                    fontSize: '13px',
                    letterSpacing: '0.03em',
                    color: isOut ? 'var(--text-faint)' : 'var(--text-primary)',
                  }}>{code}</span>

                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', alignItems: 'center' }}>
                    {!isOut && (
                      <>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          color: 'var(--text-dimmed)',
                          width: '40px',
                          textAlign: 'right',
                        }}>{gapToPrevious}</span>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          color: 'var(--text-dimmed)',
                          width: '40px',
                          textAlign: 'right',
                        }}>{gapToLeader}</span>
                      </>
                    )}
                  </div>

                  <img
                    src={`/images/tyres/${TYRE_MAP[data.tyre] || '2.png'}`}
                    style={{
                      marginLeft: '8px',
                      height: '16px',
                      width: 'auto',
                      opacity: isOut ? 0.3 : 1,
                    }}
                    onError={(e) => (e.currentTarget.style.opacity = '0')}
                  />
                </motion.div>
              </React.Fragment>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
