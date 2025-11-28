
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Ui/Button';
import { ChevronLeft, Play, Pause, RotateCcw, Volume2 } from 'lucide-react';
import { getServerTime } from '../../services/firebase';

// --- Types ---
interface TestPhase {
  id: number;
  type: 'RUN' | 'RECOVERY';
  level: number;
  shuttle: number;
  speed: number; // km/h
  duration: number; // seconds
  cumDistance: number; // meters at start of phase
  startTime: number; // seconds from test start
  endTime: number; // seconds from test start
}

// --- Audio Engine ---
// Encapsulates audio loading and playback to manage AudioContext and buffers.
class AudioEngine {
  public audioContext: AudioContext | null = null;
  private startSoundBuffer: AudioBuffer | null = null;
  private turnSoundBuffer: AudioBuffer | null = null;
  private isUnlocked = false;
  private isLoadingStart = false;
  private isLoadingTurn = false;

  constructor() {
    try {
      // @ts-ignore
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioContext = new AudioContext();
      }
    } catch (e) {
      console.error("Failed to create AudioContext", e);
    }
  }

  public dispose() {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {
        console.warn("Error closing AudioContext", e);
      }
    }
  }

  // Must be called after a user gesture
  public unlockAudio() {
    if (this.isUnlocked || !this.audioContext) return;
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    this.isUnlocked = true;
  }

  public async loadStartSound(url: string) {
    if (!this.audioContext || this.startSoundBuffer || this.isLoadingStart) return;
    this.isLoadingStart = true;
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      this.startSoundBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.error("Failed to load or decode start sound:", e);
    } finally {
      this.isLoadingStart = false;
    }
  }

  public async loadTurnSound(url: string) {
    if (!this.audioContext || this.turnSoundBuffer || this.isLoadingTurn) return;
    this.isLoadingTurn = true;
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      this.turnSoundBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.error("Failed to load or decode turn sound:", e);
    } finally {
      this.isLoadingTurn = false;
    }
  }

  private playBuffer(buffer: AudioBuffer | null, fallback: () => void) {
    this.unlockAudio();
    if (this.audioContext && buffer) {
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);
      source.start();
    } else {
      fallback();
    }
  }

  public playStartSound = () => {
    this.playBuffer(this.startSoundBuffer, () => this.playTone(880, 'square', 0.4));
  };
  
  public playTurnSound = () => {
    this.playBuffer(this.turnSoundBuffer, () => this.playTone(440, 'sine', 0.2));
  };
  
  public playTickSound = () => this.playTone(600, 'sine', 0.05);

  public playTone = (freq: number, type: 'sine' | 'square' = 'sine', duration = 0.1) => {
    this.unlockAudio();
    if (!this.audioContext) return;
    try {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioContext.currentTime);

      gain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start();
      osc.stop(this.audioContext.currentTime + duration);
    } catch (e) {
      // This can happen if context is not fully ready. Fail silently.
    }
  };
}


// --- Protocol Generator (Yo-Yo IR1) ---
const generateProtocol = (): TestPhase[] => {
  const protocol: TestPhase[] = [];
  let currentTime = 0;
  let totalDistance = 0;
  let idCounter = 0;

  // Level config: [Level Number, Speed (km/h), Shuttles]
  const levels = [
    [5, 10, 1], [9, 12, 1], [11, 13, 2], [12, 13.5, 3], 
    [13, 14, 4], [14, 14.5, 8], [15, 15, 8], [16, 15.5, 8], 
    [17, 16, 8], [18, 16.5, 8], [19, 17, 8], [20, 17.5, 8],
    [21, 18, 8], [22, 18.5, 8], [23, 19, 8]
  ];

  levels.forEach(([level, speed, shuttles]) => {
    for (let s = 1; s <= shuttles; s++) {
      // 1. RUN PHASE (2x20m = 40m)
      // Time = Distance / Speed (m/s)
      const speedMs = speed / 3.6;
      const runDuration = 40.0 / speedMs;

      protocol.push({
        id: idCounter++,
        type: 'RUN',
        level: level as number,
        shuttle: s,
        speed: speed as number,
        duration: runDuration,
        cumDistance: totalDistance,
        startTime: currentTime,
        endTime: currentTime + runDuration
      });

      currentTime += runDuration;
      totalDistance += 40;

      // 2. RECOVERY PHASE (10s)
      protocol.push({
        id: idCounter++,
        type: 'RECOVERY',
        level: level as number,
        shuttle: s,
        speed: speed as number,
        duration: 10,
        cumDistance: totalDistance,
        startTime: currentTime,
        endTime: currentTime + 10
      });

      currentTime += 10;
    }
  });

  return protocol;
};

const PROTOCOL = generateProtocol();

const YoYoTest: React.FC = () => {
  const navigate = useNavigate();

  // --- State ---
  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [testStartTime, setTestStartTime] = useState<number | null>(null);
  
  // Display State
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<TestPhase>(PROTOCOL[0]);
  const [phaseProgress, setPhaseProgress] = useState(0); // 0 to 1
  const [testFinished, setTestFinished] = useState(false);

  // Refs
  const requestRef = useRef<number>(0);
  const lastBeepRef = useRef<string>(''); // Track last beep to prevent duplicates
  const audioEngineRef = useRef<AudioEngine | null>(null);

  // Refs for loop state access
  const isRunningRef = useRef(isRunning);
  const testStartTimeRef = useRef(testStartTime);

  // Sync state to refs
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { testStartTimeRef.current = testStartTime; }, [testStartTime]);

  // Load audio on component mount
  useEffect(() => {
    const engine = new AudioEngine();
    const startUrl = 'https://video-idea.fra1.cdn.digitaloceanspaces.com/beeps/start-sound-beep-102201.mp3';
    const turnUrl = 'https://video-idea.fra1.cdn.digitaloceanspaces.com/beeps/beep-short.mp3';
    
    engine.loadStartSound(startUrl);
    engine.loadTurnSound(turnUrl);
    
    audioEngineRef.current = engine;

    return () => {
      engine.dispose();
    };
  }, []);

  // --- Logic ---

  const startTest = () => {
    const now = getServerTime();
    setTestStartTime(now);
    setIsRunning(true);
    setHasStarted(true);
    setTestFinished(false);
    lastBeepRef.current = '';
    
    // Unlock audio context on first user action
    audioEngineRef.current?.unlockAudio();
  };

  const stopTest = () => {
    setIsRunning(false);
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
  };

  const resumeTest = () => {
    const now = getServerTime();
    const elapsedMs = elapsedTime * 1000;
    setTestStartTime(now - elapsedMs);
    setIsRunning(true);
  };

  const resetTest = () => {
    stopTest();
    setHasStarted(false);
    setTestFinished(false);
    setElapsedTime(0);
    setCurrentPhase(PROTOCOL[0]);
    setPhaseProgress(0);
    setTestStartTime(null);
  };

  const handleAudioTriggers = useCallback((phase: TestPhase, phaseElapsed: number) => {
    const audioEngine = audioEngineRef.current;
    if (!audioEngine) return;

    const timeLeft = phase.duration - phaseElapsed;
    const key = `${phase.id}-${Math.floor(phaseElapsed)}`;

    if (lastBeepRef.current === key) return;

    if (phase.type === 'RUN') {
      if (phaseElapsed < 0.2 && lastBeepRef.current !== `${phase.id}-start`) {
        audioEngine.playStartSound();
        lastBeepRef.current = `${phase.id}-start`;
      }
      
      const halfTime = phase.duration / 2;
      if (phaseElapsed >= halfTime && phaseElapsed < halfTime + 0.2 && lastBeepRef.current !== `${phase.id}-turn`) {
          audioEngine.playTurnSound();
          lastBeepRef.current = `${phase.id}-turn`;
      }
    } 
    else if (phase.type === 'RECOVERY') {
      if (phaseElapsed < 0.2 && lastBeepRef.current !== `${phase.id}-start`) {
        audioEngine.playTurnSound();
        lastBeepRef.current = `${phase.id}-start`;
      }

      if (timeLeft < 3.1 && timeLeft > 2.9) { audioEngine.playTickSound(); lastBeepRef.current = key; }
      if (timeLeft < 2.1 && timeLeft > 1.9) { audioEngine.playTickSound(); lastBeepRef.current = key; }
      if (timeLeft < 1.1 && timeLeft > 0.9) { audioEngine.playTickSound(); lastBeepRef.current = key; }
    }
  }, []);

  const updateLoop = useCallback(() => {
    // Use refs to check state to avoid stale closures in recursive RAF
    if (!isRunningRef.current || !testStartTimeRef.current) return;

    const now = getServerTime();
    const totalElapsedSeconds = (now - testStartTimeRef.current) / 1000;

    const phase = PROTOCOL.find(p => totalElapsedSeconds >= p.startTime && totalElapsedSeconds < p.endTime);

    if (!phase) {
      if (totalElapsedSeconds > PROTOCOL[PROTOCOL.length - 1].endTime) {
        setTestFinished(true);
        setIsRunning(false);
        audioEngineRef.current?.playTone(440, 'square', 1);
      }
      return;
    }

    setCurrentPhase(phase);
    setElapsedTime(totalElapsedSeconds);

    const phaseElapsed = totalElapsedSeconds - phase.startTime;
    setPhaseProgress(Math.min(1, Math.max(0, phaseElapsed / phase.duration)));

    handleAudioTriggers(phase, phaseElapsed);

    requestRef.current = requestAnimationFrame(updateLoop);
  }, [handleAudioTriggers]);

  useEffect(() => {
    if (isRunning) {
      requestRef.current = requestAnimationFrame(updateLoop);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isRunning, updateLoop]);


  // --- Render Helpers ---

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getPhaseColor = () => {
    if (testFinished) return 'text-gray-500';
    if (currentPhase.type === 'RUN') return 'text-emerald-500';
    return 'text-orange-500';
  };

  const getPhaseBg = () => {
    if (testFinished) return 'bg-gray-800';
    if (currentPhase.type === 'RUN') return 'bg-emerald-500';
    return 'bg-orange-500';
  };

  const timeToNextBeep = () => {
    const phaseElapsed = elapsedTime - currentPhase.startTime;
    if (currentPhase.type === 'RUN') {
      const halfTime = currentPhase.duration / 2;
      return phaseElapsed < halfTime
        ? halfTime - phaseElapsed
        : currentPhase.duration - phaseElapsed;
    }
    return currentPhase.duration - phaseElapsed;
  };

  return (
    <div className="fixed inset-0 w-full h-full bg-gray-950 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-none p-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between border-b border-gray-800 bg-gray-950 z-20">
        <Button variant="icon" onClick={() => navigate('/tools')}>
          <ChevronLeft size={20} />
        </Button>
        <div className="text-center">
            <h1 className="text-white font-bold text-lg">Yo-Yo IR1</h1>
            <p className="text-xs text-gray-400">Intermittent Recovery Test</p>
        </div>
        <div className="w-10" />
      </div>

      {/* Main Content - Flex-grow to fill space */}
      <div className="flex-1 flex flex-col min-h-0">
          
          {/* Top Section - Timer & Phase */}
          <div className="flex-[2] flex flex-col items-center justify-center p-6 relative">
             <div className="absolute inset-0 opacity-10 pointer-events-none">
                 <div className={`w-full h-full transition-colors duration-500 ${currentPhase.type === 'RUN' ? 'bg-emerald-500' : 'bg-orange-500'}`} />
             </div>

             <div className={`text-xl font-bold uppercase tracking-widest mb-2 transition-colors duration-300 ${getPhaseColor()}`}>
                {testFinished ? 'TEST COMPLETE' : currentPhase.type}
             </div>
             
             <div className="text-[15vw] sm:text-[8rem] font-mono font-bold text-white tracking-tighter tabular-nums leading-none drop-shadow-2xl">
                {formatTime(elapsedTime)}
             </div>

             {/* Progress Bar */}
             <div className="w-full max-w-sm h-3 bg-gray-800 rounded-full mt-8 overflow-hidden border border-gray-700">
                 <div 
                    className={`h-full transition-all duration-100 ease-linear ${getPhaseBg()}`} 
                    style={{ width: `${phaseProgress * 100}%` }}
                 />
             </div>
          </div>

          {/* Stats Grid */}
          <div className="flex-[3] grid grid-cols-2 gap-px bg-gray-800 border-t border-gray-800">
             <div className="bg-gray-900/50 p-6 flex flex-col items-center justify-center text-center">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Level</div>
                <div className="text-5xl font-bold text-white">
                    {currentPhase.level}<span className="text-2xl text-gray-500">.{currentPhase.shuttle}</span>
                </div>
             </div>

             <div className="bg-gray-900/50 p-6 flex flex-col items-center justify-center text-center">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Speed</div>
                <div className="text-5xl font-bold text-white">
                    {currentPhase.speed} <span className="text-lg text-gray-500">km/h</span>
                </div>
             </div>

             <div className="bg-gray-900/50 p-6 flex flex-col items-center justify-center text-center">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Total Distance</div>
                <div className="text-5xl font-bold text-white">
                    {testFinished ? PROTOCOL[PROTOCOL.length-1].cumDistance + 40 : currentPhase.cumDistance}<span className="text-lg text-gray-500">m</span>
                </div>
             </div>

             <div className="bg-gray-900/50 p-6 flex flex-col items-center justify-center text-center">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Next Beep</div>
                <div className="text-5xl font-mono font-bold text-indigo-400 tabular-nums">
                    {timeToNextBeep().toFixed(1)}
                </div>
             </div>
          </div>
      </div>

      {/* Footer Controls */}
      <div className="flex-none bg-gray-900 border-t border-gray-800 p-6 pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-md mx-auto flex items-center justify-between gap-6">
            
            <button 
                onClick={resetTest}
                disabled={!hasStarted}
                className={`h-14 w-14 rounded-full flex items-center justify-center border border-gray-700 bg-gray-800 text-white transition-all ${!hasStarted ? 'opacity-30' : 'hover:bg-gray-700'}`}
                aria-label="Reset Test"
            >
                <RotateCcw size={20} />
            </button>

            <button
                onClick={isRunning ? stopTest : (hasStarted ? resumeTest : startTest)}
                className={`h-20 flex-1 rounded-2xl flex items-center justify-center gap-3 transition-all duration-200 shadow-xl text-lg font-bold uppercase tracking-wider ${
                    isRunning 
                        ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-500/20'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
                }`}
            >
                {isRunning ? (
                    <>
                        <Pause size={28} fill="currentColor" /> Pause
                    </>
                ) : (
                    <>
                        <Play size={28} fill="currentColor" /> {hasStarted ? 'Resume' : 'Start Test'}
                    </>
                )}
            </button>

            <div className="w-14 flex items-center justify-center">
                <Volume2 className="text-gray-600" size={24} />
            </div>
          </div>
      </div>

    </div>
  );
};

export default YoYoTest;