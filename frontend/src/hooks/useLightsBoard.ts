import { useState, useEffect, useRef, useCallback } from 'react';

export type LightState = 'off' | 'on' | 'out';
export type Phase = 'idle' | 'waiting' | 'sequence' | 'hold' | 'blackout' | 'done' | 'fadeout';

export interface UseLightsBoardState {
  isVisible: boolean;
  lights: LightState[];
  currentPhase: Phase;
  textReveal: number;
}

export function useLightsBoard() {
  const [isVisible, setIsVisible] = useState(false);
  const [lights, setLights] = useState<LightState[]>(['off', 'off', 'off', 'off', 'off']);
  const [currentPhase, setCurrentPhase] = useState<Phase>('idle');
  const [textReveal, setTextReveal] = useState(0);
  const beepAudioRef = useRef<HTMLAudioElement | null>(null);
  const mainAudioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    beepAudioRef.current = new Audio('/audio/lights-beep.mp3');
    mainAudioRef.current = new Audio('/audio/lights-out-away.mp3');

    return () => {
      clearAllTimeouts();
    };
  }, []);

  const addTimeout = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timeoutsRef.current.push(t);
    return t;
  }, []);

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];
  }, []);

  const playBeep = useCallback(() => {
    if (beepAudioRef.current) {
      beepAudioRef.current.currentTime = 0;
      beepAudioRef.current.play().catch(() => {});
    }
  }, []);

  const playLightsOut = useCallback(() => {
    if (mainAudioRef.current) {
      mainAudioRef.current.currentTime = 0;
      mainAudioRef.current.play().catch(() => {});
    }
  }, []);

  const startSequence = useCallback(() => {
    setIsVisible(true);
    setCurrentPhase('waiting');
    setLights(['off', 'off', 'off', 'off', 'off']);
    setTextReveal(0);
    clearAllTimeouts();

    // Auto-advance from waiting to sequence after 800ms
    addTimeout(() => {
      setCurrentPhase('sequence');

      // Light 1 ON at T+0
      addTimeout(() => {
        setLights(prev => ['on', prev[1], prev[2], prev[3], prev[4]]);
        playBeep();
      }, 0);

      // Light 2 ON at T+1100
      addTimeout(() => {
        setLights(prev => [prev[0], 'on', prev[2], prev[3], prev[4]]);
        playBeep();
      }, 1100);

      // Light 3 ON at T+2200
      addTimeout(() => {
        setLights(prev => [prev[0], prev[1], 'on', prev[3], prev[4]]);
        playBeep();
      }, 2200);

      // Light 4 ON at T+3300
      addTimeout(() => {
        setLights(prev => [prev[0], prev[1], prev[2], 'on', prev[4]]);
        playBeep();
      }, 3300);

      // Light 5 ON at T+4400 → phase: hold
      addTimeout(() => {
        setLights(prev => [prev[0], prev[1], prev[2], prev[3], 'on']);
        playBeep();
        setCurrentPhase('hold');

        // Random hold duration 1500-3500ms, then blackout
        const holdDuration = 1500 + Math.random() * 2000;
        addTimeout(() => {
          setLights(['out', 'out', 'out', 'out', 'out']);
          setCurrentPhase('blackout');
          playLightsOut();

          // Text reveal sequence
          addTimeout(() => setTextReveal(1), 300);
          addTimeout(() => setTextReveal(2), 700);
          addTimeout(() => setTextReveal(3), 1100);

          // Phase: done after 3500ms
          addTimeout(() => {
            setCurrentPhase('done');
          }, 3500);
        }, holdDuration);
      }, 4400);
    }, 800);
  }, [addTimeout, clearAllTimeouts, playBeep, playLightsOut]);

  const skipSequence = useCallback(() => {
    clearAllTimeouts();
    setLights(['out', 'out', 'out', 'out', 'out']);
    setTextReveal(0);
    setCurrentPhase('done');

    if (mainAudioRef.current) {
      mainAudioRef.current.pause();
      mainAudioRef.current.currentTime = 0;
    }
    if (beepAudioRef.current) {
      beepAudioRef.current.pause();
      beepAudioRef.current.currentTime = 0;
    }
  }, [clearAllTimeouts]);

  const dismiss = useCallback(() => {
    clearAllTimeouts();
    setCurrentPhase('fadeout');

    if (mainAudioRef.current) {
      mainAudioRef.current.pause();
      mainAudioRef.current.currentTime = 0;
    }

    addTimeout(() => {
      setIsVisible(false);
      setCurrentPhase('idle');
      setLights(['off', 'off', 'off', 'off', 'off']);
      setTextReveal(0);
    }, 500);
  }, [clearAllTimeouts, addTimeout]);

  // Legacy compat: lightsOn boolean array for external consumers
  const lightsOn = lights.map(s => s === 'on');

  return {
    isVisible,
    lights,
    lightsOn,
    currentPhase,
    textReveal,
    canSkip: currentPhase === 'waiting' || currentPhase === 'sequence' || currentPhase === 'hold',
    startSequence,
    skipSequence,
    dismiss,
    mainAudioRef,
  };
}
