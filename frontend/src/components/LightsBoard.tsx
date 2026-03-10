import { useEffect, forwardRef, useImperativeHandle } from 'react';
import { useLightsBoard, LightState, Phase } from '../hooks/useLightsBoard';
import { useReplayStore } from '../store/replayStore';
import { dataService } from '../services/dataService';

interface LightsBoardProps {
  onSequenceComplete: () => void;
}

export interface LightsBoardHandle {
  startSequence: () => void;
}

// Individual light component
const Light = ({ state }: { state: LightState }) => {
  const isOn = state === 'on';
  const isOut = state === 'out';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      {/* Outer housing */}
      <div style={{
        width: '72px',
        height: '72px',
        borderRadius: '50%',
        position: 'relative',
        transition: 'all 0.15s',
        background: isOn
          ? 'radial-gradient(circle, #ff2d3a 0%, #cc1120 40%, #1a0508 75%, #0a0a10 100%)'
          : 'radial-gradient(circle, #1a1a24 0%, #111118 50%, #0a0a10 100%)',
        boxShadow: isOn
          ? '0 0 40px 8px rgba(230,57,70,0.5), 0 0 80px 20px rgba(230,57,70,0.2), 0 0 4px 2px rgba(255,45,58,0.8), inset 0 0 20px rgba(255,45,58,0.3)'
          : isOut
            ? '0 0 2px rgba(255,255,255,0.03), inset 0 0 8px rgba(0,0,0,0.5)'
            : '0 0 4px rgba(255,255,255,0.03), inset 0 0 12px rgba(0,0,0,0.4)',
        border: isOn
          ? '2px solid rgba(255,80,80,0.4)'
          : '2px solid rgba(255,255,255,0.05)',
      }}>
        {/* Inner glass lens */}
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          right: '10px',
          bottom: '10px',
          borderRadius: '50%',
          transition: 'all 0.12s',
          background: isOn
            ? 'radial-gradient(circle at 40% 35%, rgba(255,120,100,0.9) 0%, #ff2d3a 30%, #cc1120 70%)'
            : 'radial-gradient(circle at 40% 35%, rgba(40,40,55,0.8) 0%, rgba(20,20,30,0.9) 100%)',
        }} />

        {/* Specular highlight */}
        <div style={{
          position: 'absolute',
          top: '6px',
          left: '10px',
          width: '16px',
          height: '10px',
          borderRadius: '50%',
          filter: 'blur(3px)',
          background: isOn ? 'rgba(255,200,180,0.5)' : 'rgba(255,255,255,0.06)',
        }} />
      </div>

      {/* Reflection below */}
      <div style={{
        width: '40px',
        height: '6px',
        borderRadius: '50%',
        filter: 'blur(2px)',
        transition: 'all 0.2s',
        background: isOn
          ? 'radial-gradient(ellipse, rgba(230,57,70,0.4) 0%, transparent 70%)'
          : 'transparent',
      }} />
    </div>
  );
};

// Status text per phase
const STATUS_TEXT: Record<Phase, string> = {
  idle: '',
  waiting: 'STANDING START',
  sequence: 'FORMATION',
  hold: 'HOLD...',
  blackout: 'GREEN GREEN GREEN',
  done: 'RACE ACTIVE',
  fadeout: 'RACE ACTIVE',
};

const LightsBoardComponent = ({ onSequenceComplete }: LightsBoardProps, ref: React.Ref<LightsBoardHandle>) => {
  const lightsBoard = useLightsBoard();
  const { isVisible, lights, currentPhase, textReveal, canSkip, skipSequence, startSequence, dismiss } = lightsBoard;

  const session = useReplayStore((s) => s.session);
  const year = session.metadata?.year;
  const round = session.metadata?.round;
  const totalLaps = session.metadata?.total_laps || 0;
  const raceName = year && round
    ? `${year} ${dataService.getRaceName(year, round)}`
    : 'Grand Prix';

  useImperativeHandle(ref, () => ({
    startSequence: () => {
      startSequence();
    },
  }));

  // Notify parent when sequence completes (dismiss transition done)
  useEffect(() => {
    if (!isVisible && currentPhase === 'idle') {
      onSequenceComplete();
    }
  }, [isVisible, currentPhase, onSequenceComplete]);

  const handleContinue = () => {
    dismiss();
  };

  const handleSkip = () => {
    skipSequence();
  };

  const allOn = lights.every(l => l === 'on');
  const isBlackoutOrDone = currentPhase === 'blackout' || currentPhase === 'done';
  const isGreen = isBlackoutOrDone;
  const isFadeout = currentPhase === 'fadeout';

  if (!isVisible) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#050508',
      transition: 'opacity 0.5s ease',
      opacity: isFadeout ? 0 : 1,
    }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes screenFlash { 0% { opacity: 1; } 100% { opacity: 0; } }
      `}</style>

      {/* Ambient red glow when all 5 on */}
      {allOn && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(230,57,70,0.08) 0%, transparent 60%)',
          pointerEvents: 'none',
          transition: 'opacity 0.3s',
        }} />
      )}

      {/* Green flash on blackout */}
      {currentPhase === 'blackout' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,230,118,0.03)',
          pointerEvents: 'none',
          animation: 'screenFlash 0.4s ease-out forwards',
        }} />
      )}

      {/* Modal container */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        width: '520px',
        background: 'linear-gradient(170deg, rgba(16,16,24,0.95) 0%, rgba(10,10,16,0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '16px',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        overflow: 'hidden',
        boxShadow: allOn
          ? '0 0 60px rgba(230,57,70,0.15), 0 20px 60px rgba(0,0,0,0.5)'
          : '0 20px 60px rgba(0,0,0,0.5)',
        transition: 'box-shadow 0.3s',
      }}>
        {/* Top bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.15em',
              color: '#e63946',
            }}>RACE START</span>
            <span style={{
              width: '3px',
              height: '3px',
              borderRadius: '50%',
              background: '#3a3a50',
              display: 'inline-block',
            }} />
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: '#3a3a50',
            }}>{raceName}</span>
          </div>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: '#3a3a50',
          }}>LAP 1/{totalLaps}</span>
        </div>

        {/* Lights area */}
        <div style={{
          padding: '36px 24px 28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          {/* Light bar housing */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            padding: '20px 28px',
            borderRadius: '14px',
            background: 'linear-gradient(180deg, #0e0e16 0%, #080810 100%)',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.02)',
            position: 'relative',
            border: allOn
              ? '1px solid rgba(230,57,70,0.15)'
              : '1px solid rgba(255,255,255,0.03)',
            transition: 'border-color 0.3s',
          }}>
            {/* Metallic top edge */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: '20px',
              right: '20px',
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)',
            }} />

            {lights.map((state, idx) => (
              <Light key={idx} state={state} />
            ))}
          </div>

          {/* "LIGHTS OUT AND AWAY WE GO" text — only during blackout/done */}
          {(currentPhase === 'blackout' || currentPhase === 'done') && textReveal > 0 && (
            <div style={{
              marginTop: '32px',
              textAlign: 'center',
              animation: 'fadeUp 0.5s ease',
            }}>
              <div style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '28px',
                fontWeight: 800,
                letterSpacing: '0.04em',
                lineHeight: 1.3,
              }}>
                {/* LIGHTS OUT */}
                <span style={{
                  display: 'inline-block',
                  color: '#00e676',
                  transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                  opacity: textReveal >= 1 ? 1 : 0,
                  transform: textReveal >= 1 ? 'translateY(0)' : 'translateY(8px)',
                }}>LIGHTS OUT</span>

                {/* AND AWAY */}
                <span style={{
                  display: 'inline-block',
                  color: '#e8e8ee',
                  transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                  opacity: textReveal >= 2 ? 1 : 0,
                  transform: textReveal >= 2 ? 'translateY(0)' : 'translateY(8px)',
                  marginLeft: '10px',
                }}>AND AWAY</span>

                {/* WE GO */}
                <span style={{
                  display: 'inline-block',
                  color: '#00e676',
                  transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                  opacity: textReveal >= 3 ? 1 : 0,
                  transform: textReveal >= 3 ? 'translateY(0)' : 'translateY(8px)',
                  marginLeft: '10px',
                }}>WE GO</span>
              </div>

              {/* Decorative line */}
              <div style={{
                width: '60px',
                height: '2px',
                borderRadius: '2px',
                margin: '14px auto 0',
                background: 'linear-gradient(90deg, transparent, #00e676, transparent)',
                opacity: textReveal >= 3 ? 1 : 0,
                transition: 'opacity 0.5s ease 0.3s',
              }} />
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          {/* Status indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: isGreen ? '#00e676' : '#e63946',
              boxShadow: isGreen
                ? '0 0 8px rgba(0,230,118,0.38)'
                : '0 0 8px rgba(230,57,70,0.25)',
              transition: 'all 0.3s',
            }} />
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.08em',
              color: isGreen ? '#00e676' : '#666680',
              transition: 'color 0.3s',
            }}>
              {STATUS_TEXT[currentPhase] || ''}
            </span>
          </div>

          {/* Action buttons */}
          <div>
            {canSkip && (
              <button
                onClick={handleSkip}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: '#666680',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as any).style.borderColor = 'rgba(255,255,255,0.10)';
                  (e.currentTarget as any).style.color = '#e8e8ee';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as any).style.borderColor = 'rgba(255,255,255,0.06)';
                  (e.currentTarget as any).style.color = '#666680';
                }}
              >Skip</button>
            )}

            {currentPhase === 'done' && (
              <button
                onClick={handleContinue}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  background: 'rgba(0,230,118,0.08)',
                  border: '1px solid rgba(0,230,118,0.19)',
                  color: '#00e676',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as any).style.background = 'rgba(0,230,118,0.12)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as any).style.background = 'rgba(0,230,118,0.08)';
                }}
              >Continue &rarr;</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const LightsBoard = forwardRef<LightsBoardHandle, LightsBoardProps>(LightsBoardComponent);
