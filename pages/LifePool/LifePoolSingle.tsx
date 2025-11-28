
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Ui/Button';
import { Play, RotateCcw, Volume2, VolumeX, Settings, Heart, Skull, Pause, Square, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionTripwire } from '../../components/MotionTripwire';
import { Header } from '../../components/Ui/Header';
import { SettingsDrawer } from '../../components/Ui/SettingsDrawer';
import { BottomControls } from '../../components/Ui/BottomControls';

const LifePoolSingle: React.FC = () => {
  const navigate = useNavigate();

  // --- Configuration ---
  const [initialPoolSec, setInitialPoolSec] = useState(60);
  const [blurRadius, setBlurRadius] = useState(4);
  const [sensitivity, setSensitivity] = useState(30);
  const [cooldownMs, setCooldownMs] = useState(1000);
  const [tripwireWidth, setTripwireWidth] = useState(10);
  const [tripwireHeight, setTripwireHeight] = useState(100);

  // --- Game State ---
  const [remainingTime, setRemainingTime] = useState(60000);
  const [isRunning, setIsRunning] = useState(false);
  const [isArmed, setIsArmed] = useState(false); // If armed, camera is watching.
  const [isDepleted, setIsDepleted] = useState(false);

  // --- UI State ---
  const [showSettings, setShowSettings] = useState(false);
  const [flash, setFlash] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [torchEnabled, setTorchEnabled] = useState(false);

  // Refs
  const lastTimeRef = useRef<number>(0);
  const requestRef = useRef<number>(0);

  // --- Timer Loop ---
  useEffect(() => {
    const updateTimer = () => {
      if (isRunning && lastTimeRef.current > 0) {
        const now = Date.now();
        const delta = now - lastTimeRef.current;
        lastTimeRef.current = now;

        setRemainingTime(prev => {
          const next = prev - delta;
          if (next <= 0) {
            setIsDepleted(true);
            setIsRunning(false);
            playFailureSound();
            return 0;
          }
          return next;
        });

        requestRef.current = requestAnimationFrame(updateTimer);
      }
    };

    if (isRunning) {
      lastTimeRef.current = Date.now();
      requestRef.current = requestAnimationFrame(updateTimer);
    } else {
      lastTimeRef.current = 0;
      cancelAnimationFrame(requestRef.current);
    }

    return () => cancelAnimationFrame(requestRef.current);
  }, [isRunning]);

  // --- Audio ---
  const playBeep = (freq = 800, type: OscillatorType = 'sine') => {
    if (!soundEnabled) return;
    try {
      // @ts-ignore
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {}
  };

  const playFailureSound = () => {
    if (!soundEnabled) return;
    try {
      // @ts-ignore
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(50, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch(e) {}
  };

  const triggerFlash = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
  };

  // --- Handlers ---
  const handleMotionTrigger = () => {
    if (isDepleted || !isArmed) return;

    triggerFlash();
    
    if (isRunning) {
        // Stop Timer
        setIsRunning(false);
        playBeep(600, 'square'); // Lower pitch stop
    } else {
        // Start Timer
        setIsRunning(true);
        playBeep(1000, 'sine'); // High pitch start
    }
  };

  const toggleArm = () => {
      if (isDepleted) return;
      
      if (isArmed) {
          // Disarm
          setIsArmed(false);
          setIsRunning(false);
      } else {
          // Arm
          setIsArmed(true);
      }
  };

  const resetGame = () => {
      setIsArmed(false);
      setIsRunning(false);
      setIsDepleted(false);
      setRemainingTime(initialPoolSec * 1000);
  };

  const formatTime = (ms: number) => {
    if (ms < 0) ms = 0;
    const seconds = Math.floor(ms / 1000);
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${seconds}.${milliseconds.toString().padStart(2, '0')}`;
  };

  // Apply setting change immediately
  useEffect(() => {
     if (!isRunning && !isDepleted) {
         setRemainingTime(initialPoolSec * 1000);
     }
  }, [initialPoolSec]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden touch-none text-white font-sans">
      <AnimatePresence>
        {flash && (
          <motion.div 
            initial={{ opacity: 0.5 }} 
            animate={{ opacity: 0 }} 
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-white z-30 pointer-events-none" 
          />
        )}
      </AnimatePresence>

      <Header 
        variant="overlay"
        title="Life Pool"
        titleColor="text-pink-400"
        icon={<Heart size={14} className="text-pink-500 fill-pink-500 animate-pulse" />}
        onBack={() => navigate('/life-pool')}
        rightElement={
          <Button 
            variant="icon" 
            onClick={() => setShowSettings(!showSettings)}
            className={`bg-black/50 backdrop-blur-md border-gray-700 pointer-events-auto transition-colors ${showSettings ? 'text-pink-400 border-pink-500 bg-pink-900/20' : ''}`}
          >
            <Settings size={20} />
          </Button>
        }
      />

      {/* Viewport & Tripwire */}
      <div className="relative flex-1 w-full h-full bg-gray-900">
        <MotionTripwire 
          isActive={isArmed && !isDepleted}
          onTrigger={handleMotionTrigger}
          color={isRunning ? 'red' : 'green'}
          blurRadius={blurRadius}
          cooldownMs={cooldownMs}
          sensitivity={sensitivity}
          tripwireWidth={tripwireWidth}
          tripwireHeight={tripwireHeight}
          enableTorch={torchEnabled}
        />
        
        {/* Main Display Overlay */}
        {!showSettings && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
                {isDepleted ? (
                    <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="flex flex-col items-center text-red-600"
                    >
                        <Skull size={80} strokeWidth={1.5} />
                        <h2 className="text-4xl font-black uppercase tracking-widest mt-4">Depleted</h2>
                    </motion.div>
                ) : (
                    <div className="flex flex-col items-center">
                         <div className={`text-7xl sm:text-8xl font-mono font-bold tabular-nums tracking-tighter drop-shadow-2xl transition-colors ${
                             remainingTime < 10000 ? 'text-red-500 animate-pulse' : 'text-white'
                         }`}>
                             {formatTime(remainingTime)}
                         </div>
                         <div className={`mt-4 px-3 py-1 rounded border border-white/20 backdrop-blur-sm text-xs font-bold uppercase tracking-[0.2em] ${
                             isRunning ? 'bg-red-500/20 text-red-400' : isArmed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-800/50 text-gray-500'
                         }`}>
                             {isRunning ? 'Draining...' : isArmed ? 'Armed / Safe' : 'Standby'}
                         </div>
                    </div>
                )}
            </div>
        )}
      </div>

      {/* Progress Bar (Health Bar) */}
      <div className="relative h-2 w-full bg-gray-900">
          <div 
            className={`absolute top-0 bottom-0 left-0 transition-all duration-100 ease-linear ${
                remainingTime < 10000 ? 'bg-red-600' : 'bg-pink-500'
            }`}
            style={{ width: `${Math.min(100, (remainingTime / (initialPoolSec * 1000)) * 100)}%` }}
          />
      </div>

      {/* Controls */}
      <BottomControls>
        <div className="flex items-center justify-center gap-6">
            <Button 
                variant="icon" 
                onClick={resetGame}
                className="h-14 w-14 rounded-full bg-gray-800 border-gray-700 hover:bg-gray-700"
            >
                <RotateCcw size={24} />
            </Button>

            <button
                onClick={toggleArm}
                disabled={isDepleted}
                className={`h-24 w-24 rounded-full flex items-center justify-center transition-all duration-200 shadow-xl border-4 ${
                    isDepleted 
                        ? 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed'
                        : isArmed 
                            ? isRunning 
                                ? 'bg-red-500/20 border-red-500 text-red-500 animate-pulse' // Draining
                                : 'bg-pink-600 border-pink-400 text-white shadow-pink-500/30' // Armed but safe
                            : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700' // Standby
                }`}
            >
                {isDepleted ? (
                    <Skull size={32} />
                ) : isArmed ? (
                    isRunning ? <Pause size={40} fill="currentColor" /> : <Square size={32} fill="currentColor" />
                ) : (
                    <Play size={40} className="ml-2" fill="currentColor" />
                )}
            </button>

            <div className="flex flex-col gap-3">
              <Button 
                  variant="icon" 
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`h-10 w-10 rounded-full border transition-colors ${
                    soundEnabled 
                      ? 'bg-pink-900/20 border-pink-500/50 text-pink-400' 
                      : 'bg-gray-800 border-gray-700 text-gray-500'
                  }`}
              >
                  {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </Button>
              <Button 
                  variant="icon" 
                  onClick={() => setTorchEnabled(!torchEnabled)}
                  className={`h-10 w-10 rounded-full border transition-colors ${
                  torchEnabled 
                      ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.3)]' 
                      : 'bg-gray-800 border-gray-700 text-gray-500'
                  }`}
              >
                  <Zap size={16} className={torchEnabled ? "fill-current" : ""} />
              </Button>
            </div>
        </div>
      </BottomControls>

      <SettingsDrawer isOpen={showSettings} onClose={() => setShowSettings(false)}>
        <div>
              <label className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                <span>Initial Life Pool</span>
                <span className="text-pink-400">{initialPoolSec}s</span>
            </label>
            <input 
                type="range" 
                min="10" 
                max="300" 
                step="5"
                value={initialPoolSec}
                onChange={(e) => setInitialPoolSec(Number(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
            />
        </div>

        <div className="border-t border-gray-800 pt-4">
            <label className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                <span>Re-Arm Delay</span>
                <span className="text-pink-400">{cooldownMs}ms</span>
            </label>
            <input 
                type="range" 
                min="100" 
                max="3000" 
                step="100"
                value={cooldownMs}
                onChange={(e) => setCooldownMs(Number(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
            />
        </div>

        <div className="border-t border-gray-800 pt-4">
            <label className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                <span>Sensitivity</span>
                <span className="text-pink-400">{sensitivity}</span>
            </label>
            <input 
                type="range" 
                min="5" 
                max="100" 
                step="1"
                value={sensitivity}
                onChange={(e) => setSensitivity(Number(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
            />
        </div>
      </SettingsDrawer>
    </div>
  );
};

export default LifePoolSingle;
