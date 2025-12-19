import { useState, useEffect, useRef } from 'react';

export interface UseLightsBoardState {
  isVisible: boolean;
  lightsOn: boolean[];
  currentPhase: 'idle' | 'lights' | 'audio' | 'fadeout';
  canSkip: boolean;
}

export function useLightsBoard() {
  const [isVisible, setIsVisible] = useState(false);
  const [lightsOn, setLightsOn] = useState<boolean[]>([false, false, false, false, false]);
  const [currentPhase, setCurrentPhase] = useState<'idle' | 'lights' | 'audio' | 'fadeout'>('idle');
  const [canSkip, setCanSkip] = useState(true);
  const beepAudioRef = useRef<HTMLAudioElement | null>(null);
  const mainAudioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    beepAudioRef.current = new Audio('/audio/lights-beep.mp3');
    mainAudioRef.current = new Audio('/audio/lights-out-away.mp3');

    return () => {
      timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  const startSequence = () => {
    setIsVisible(true);
    setCurrentPhase('lights');
    setLightsOn([false, false, false, false, false]);
    setCanSkip(true);
    playLights();
  };

  const playLights = () => {
    timeoutsRef.current.push(
      setTimeout(() => {
        setLightsOn(prev => [true, prev[1], prev[2], prev[3], prev[4]]);
        beepAudioRef.current?.play();
      }, 0)
    );

    timeoutsRef.current.push(
      setTimeout(() => {
        setLightsOn(prev => [prev[0], true, prev[2], prev[3], prev[4]]);
        beepAudioRef.current?.play();
      }, 1000)
    );

    timeoutsRef.current.push(
      setTimeout(() => {
        setLightsOn(prev => [prev[0], prev[1], true, prev[3], prev[4]]);
        beepAudioRef.current?.play();
      }, 2000)
    );

    timeoutsRef.current.push(
      setTimeout(() => {
        setLightsOn(prev => [prev[0], prev[1], prev[2], true, prev[4]]);
        beepAudioRef.current?.play();
      }, 3000)
    );

    timeoutsRef.current.push(
      setTimeout(() => {
        setLightsOn(prev => [prev[0], prev[1], prev[2], prev[3], true]);
        beepAudioRef.current?.play();
      }, 4000)
    );

    timeoutsRef.current.push(
      setTimeout(() => {
        setLightsOn([false, false, false, false, false]);
        setCurrentPhase('audio');
        mainAudioRef.current?.play();
      }, 5000)
    );
  };

  const handleAudioEnd = () => {
    setCurrentPhase('fadeout');
    setCanSkip(false);

    timeoutsRef.current.push(
      setTimeout(() => {
        completeSequence();
      }, 650)
    );
  };

  const skipSequence = () => {
    if (!canSkip) return;

    timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    timeoutsRef.current = [];

    completeSequence();
  };

  const completeSequence = () => {
    setIsVisible(false);
    setCurrentPhase('idle');
    setLightsOn([false, false, false, false, false]);

    if (mainAudioRef.current) {
      mainAudioRef.current.pause();
      mainAudioRef.current.currentTime = 0;
    }
  };

  useEffect(() => {
    if (currentPhase === 'audio' && mainAudioRef.current) {
      mainAudioRef.current.addEventListener('ended', handleAudioEnd);
      return () => {
        mainAudioRef.current?.removeEventListener('ended', handleAudioEnd);
      };
    }
  }, [currentPhase]);

  return {
    isVisible,
    lightsOn,
    currentPhase,
    canSkip,
    startSequence,
    skipSequence,
    mainAudioRef,
  };
}
