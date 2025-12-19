import { useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import { useLightsBoard } from '../hooks/useLightsBoard';

interface LightsBoardProps {
  onSequenceComplete: () => void;
}

export interface LightsBoardHandle {
  startSequence: () => void;
}

const LightsBoardComponent = ({ onSequenceComplete }: LightsBoardProps, ref: React.Ref<LightsBoardHandle>) => {
  const lightsBoard = useLightsBoard();
  const { isVisible, lightsOn, currentPhase, canSkip, skipSequence, startSequence, mainAudioRef } = lightsBoard;
  console.log('LightsBoard render:', { isVisible, lightsOn, currentPhase, canSkip });

  useImperativeHandle(ref, () => ({
    startSequence: () => {
      console.log('LightsBoard: startSequence called');
      startSequence();
    },
  }));

  // Notify parent when sequence completes - only when transitioning to complete state
  useEffect(() => {
    if (!isVisible && currentPhase === 'idle') {
      onSequenceComplete();
    }
  }, [isVisible, currentPhase]);

  const fadeOutClass = currentPhase === 'fadeout' ? 'opacity-0' : 'opacity-100';

  return (
    <>
      {isVisible && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Dark overlay with blur */}
          <div
            className={`transition-opacity duration-700 ease-out ${fadeOutClass}`}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(4px)',
            }}
          />

          {/* Modal box */}
          <div
            style={{
              position: 'relative',
              zIndex: 10000,
              background: '#1f1f27',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '48px 64px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
              minWidth: '400px',
            }}
            className={`transition-opacity duration-700 ease-out ${fadeOutClass}`}
          >
            {/* Skip button */}
            {canSkip && (
              <button
                onClick={skipSequence}
                className="absolute top-4 right-4 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
              >
                Skip
              </button>
            )}

            {/* Lights container */}
            <div style={{ display: 'flex', gap: '24px', justifyContent: 'center' }}>
              {lightsOn.map((isLit, idx) => (
                <div
                  key={idx}
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    backgroundColor: isLit ? '#dc2626' : '#1f2937',
                    boxShadow: isLit ? '0 0 20px #dc2626, 0 0 40px #dc2626' : 'none',
                    transition: 'all 200ms ease-out',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hidden audio element for main audio */}
      <audio ref={mainAudioRef} preload="auto" crossOrigin="anonymous" />
    </>
  );
};

export const LightsBoard = forwardRef<LightsBoardHandle, LightsBoardProps>(LightsBoardComponent);
