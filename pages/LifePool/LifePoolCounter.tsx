
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { ChevronLeft, RotateCcw, Volume2, VolumeX, Settings, Hash, Play, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionTripwire } from '../../components/MotionTripwire';

const LifePoolCounter: React.FC = () => {
  const navigate = useNavigate();

  // --- Configuration ---
  const [blurRadius, setBlurRadius] = useState(4);
  const [sensitivity, setSensitivity] = useState(30);
  const [cooldownMs, setCooldownMs] = useState(500);
  const [tripwireWidth, setTripwireWidth] = useState(10);
  const [tripwireHeight, setTripwireHeight] = useState(100);

  // --- Game State ---
  const [count, setCount] = useState(0);
  const [isArmed, setIsArmed] = useState(false);

  // --- UI State ---
  const [showSettings, setShowSettings] = useState(false);
  const [flash, setFlash] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // --- Audio ---
  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      // @ts-ignore
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      // Distinct "Counter" sound (Square wave, snappy)
      osc.type = 'square';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
      
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {}
  };

  const triggerFlash = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
  };

  // --- Handlers ---
  const handleMotionTrigger = () => {
    if (!isArmed) return;
    
    setCount(prev => prev + 1);
    triggerFlash();
    playBeep();
  };

  const toggleArm = () => {
      setIsArmed(!isArmed);
  };

  const resetCounter = () => {
      setCount(0);
      setIsArmed(false);
  };

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

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-50 p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent pt-[calc(1rem+env(safe-area-inset-top))] pointer-events-none">
        <Button variant="icon" onClick={() => navigate('/life-pool')} className="bg-black/50 backdrop-blur-md border-gray-700 pointer-events-auto">
          <ChevronLeft size={20} />
        </Button>
        <div className="bg-black/50 backdrop-blur-md px-3 py-1 rounded-full border border-gray-700 flex items-center gap-2">
          <Hash size={14} className="text-amber-500" />
          <span className="text-sm font-bold uppercase tracking-wider text-amber-400">Motion Counter</span>
        </div>
        <Button 
          variant="icon" 
          onClick={() => setShowSettings(!showSettings)}
          className={`bg-black/50 backdrop-blur-md border-gray-700 pointer-events-auto transition-colors ${showSettings ? 'text-amber-400 border-amber-500 bg-amber-900/20' : ''}`}
        >
          <Settings size={20} />
        </Button>
      </div>

      {/* Viewport & Tripwire */}
      <div className="relative flex-1 w-full h-full bg-gray-900">
        <MotionTripwire 
          isActive={isArmed}
          onTrigger={handleMotionTrigger}
          color="blue" // Distinct from Life Pool red/green
          blurRadius={blurRadius}
          cooldownMs={cooldownMs}
          sensitivity={sensitivity}
          tripwireWidth={tripwireWidth}
          tripwireHeight={tripwireHeight}
        />
        
        {/* Main Display Overlay */}
        {!showSettings && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center">
                        <div className={`text-9xl font-mono font-bold tabular-nums tracking-tighter drop-shadow-2xl transition-all duration-100 ${
                            isArmed ? 'text-white scale-100' : 'text-gray-500 scale-95'
                        }`}>
                            {count}
                        </div>
                        <div className={`mt-4 px-3 py-1 rounded border border-white/20 backdrop-blur-sm text-xs font-bold uppercase tracking-[0.2em] ${
                            isArmed ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-800/50 text-gray-500'
                        }`}>
                            {isArmed ? 'Listening...' : 'Paused'}
                        </div>
                </div>
            </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-gray-900 z-30 border-t border-gray-800 pb-[env(safe-area-inset-bottom)] p-6">
        <div className="flex items-center justify-center gap-8">
            <Button 
                variant="icon" 
                onClick={resetCounter}
                className="h-14 w-14 rounded-full bg-gray-800 border-gray-700 hover:bg-gray-700"
            >
                <RotateCcw size={24} />
            </Button>

            <button
                onClick={toggleArm}
                className={`h-24 w-24 rounded-full flex items-center justify-center transition-all duration-200 shadow-xl border-4 ${
                    isArmed 
                        ? 'bg-amber-500/20 border-amber-500 text-amber-500 animate-pulse' 
                        : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'
                }`}
            >
                {isArmed ? <Square size={32} fill="currentColor" /> : <Play size={40} className="ml-2" fill="currentColor" />}
            </button>

            <Button 
                variant="icon" 
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`h-14 w-14 rounded-full border transition-colors ${
                  soundEnabled 
                    ? 'bg-amber-900/20 border-amber-500/50 text-amber-400' 
                    : 'bg-gray-800 border-gray-700 text-gray-500'
                }`}
            >
                {soundEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
            </Button>
        </div>
      </div>

      {/* Settings Overlay */}
      <AnimatePresence>
        {showSettings && (
           <motion.div 
             initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
             animate={{ opacity: 1, backdropFilter: "blur(12px)" }}
             exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
             className="absolute inset-0 z-40 bg-gray-950/80 flex items-center justify-center p-4"
           >
              <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-6" onClick={(e) => e.stopPropagation()}>
                  <div className="text-center">
                      <h2 className="text-lg font-bold text-white flex items-center justify-center gap-2">
                          <Settings size={20} /> Counter Config
                      </h2>
                  </div>

                  <div className="space-y-6 overflow-y-auto max-h-[60vh] pr-1 custom-scrollbar">
                    
                    <div className="">
                        <label className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                            <span>Re-Arm Delay</span>
                            <span className="text-amber-400">{cooldownMs}ms</span>
                        </label>
                        <input 
                            type="range" 
                            min="100" 
                            max="3000" 
                            step="100"
                            value={cooldownMs}
                            onChange={(e) => setCooldownMs(Number(e.target.value))}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                         <p className="text-[10px] text-gray-500 mt-2">
                            Prevents double counting. Increase if getting multiple counts for one object.
                        </p>
                    </div>

                    <div className="border-t border-gray-800 pt-4">
                        <label className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                            <span>Sensitivity</span>
                            <span className="text-amber-400">{sensitivity}</span>
                        </label>
                        <input 
                            type="range" 
                            min="5" 
                            max="100" 
                            step="1"
                            value={sensitivity}
                            onChange={(e) => setSensitivity(Number(e.target.value))}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                    </div>
                  </div>

                  <Button fullWidth onClick={() => setShowSettings(false)}>
                      Close
                  </Button>
              </div>
           </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LifePoolCounter;
