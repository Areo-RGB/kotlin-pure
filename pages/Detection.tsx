
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Ui/Button';
import { Play, RotateCcw, History, ChevronDown, ChevronUp, Trash2, Volume2, VolumeX, Settings, Timer, Zap, Cpu, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionTripwire } from '../components/MotionTripwire';
import { Header } from '../components/Ui/Header';
import { SettingsDrawer } from '../components/Ui/SettingsDrawer';
import { BottomControls, ControlRow } from '../components/Ui/BottomControls';

interface TimerEntry {
  id: number;
  time: number;
  timestamp: number;
}

const Detection: React.FC = () => {
  const navigate = useNavigate();
  
  // --- Logic State ---
  const [isActive, setIsActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // Timing State
  const [startTime, setStartTime] = useState<number | null>(null);
  const [displayTime, setDisplayTime] = useState<number>(0);
  
  const [history, setHistory] = useState<TimerEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [flash, setFlash] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [cooldownMs, setCooldownMs] = useState(500);
  const [blurRadius, setBlurRadius] = useState(4);
  const [threshold, setThreshold] = useState(30);
  const [tripwireWidth, setTripwireWidth] = useState(10);
  const [tripwireHeight, setTripwireHeight] = useState(100);
  const [useWebGL, setUseWebGL] = useState(true); // GPU acceleration

  // Animation loop
  React.useEffect(() => {
    let frameId: number;
    const updateTimer = () => {
      if (isRecording && startTime) {
        const now = Date.now();
        const delta = now - startTime;
        setDisplayTime(delta);
        frameId = requestAnimationFrame(updateTimer);
      }
    };

    if (isRecording) {
      updateTimer();
    }
    return () => cancelAnimationFrame(frameId);
  }, [isRecording, startTime]);

  const triggerFlash = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
  };

  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      // @ts-ignore
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, ctx.currentTime); 
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.error("Audio error:", e);
    }
  };

  const handleMotionTrigger = () => {
    playBeep();
    const now = Date.now();
    triggerFlash();

    if (!isRecording) {
      // START RUN
      setStartTime(now);
      setDisplayTime(0);
      setIsRecording(true);
    } else {
      // STOP RUN
      if (startTime) {
        const runDuration = now - startTime;
        const newEntry: TimerEntry = {
            id: now,
            time: runDuration,
            timestamp: now
        };
        setHistory(prev => [newEntry, ...prev]);
        setDisplayTime(runDuration);
        setIsRecording(false);
        setStartTime(null);
        setIsActive(false); // Auto-disarm after a run
      }
    }
  };

  const toggleDetection = () => {
    if (isActive) {
      setIsActive(false);
      if (isRecording) {
          setIsRecording(false);
          setStartTime(null);
          setDisplayTime(0);
      }
    } else {
      setIsActive(true);
      setDisplayTime(0);
    }
  };

  const reset = () => {
    setIsActive(false);
    setIsRecording(false);
    setStartTime(null);
    setDisplayTime(0);
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${seconds}.${milliseconds.toString().padStart(2, '0')}s`;
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden touch-none">
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
        title="Stopwatch"
        icon={<Timer size={14} />}
        titleColor="text-indigo-400"
        onBack={() => navigate('/tools')}
        rightElement={
          <Button 
            variant="icon" 
            onClick={() => setShowSettings(!showSettings)}
            className={`bg-black/50 backdrop-blur-md border-gray-700 pointer-events-auto transition-colors ${showSettings ? 'text-indigo-400 border-indigo-500 bg-indigo-900/20' : ''}`}
          >
            <Settings size={20} />
          </Button>
        }
      />

      {/* Viewport */}
      <div className="relative flex-1 w-full h-full bg-gray-900">
        <MotionTripwire 
          isActive={isActive} 
          onTrigger={handleMotionTrigger}
          color={isRecording ? 'red' : 'green'}
          cooldownMs={cooldownMs}
          blurRadius={blurRadius}
          sensitivity={threshold}
          tripwireWidth={tripwireWidth}
          tripwireHeight={tripwireHeight}
          enableTorch={torchEnabled}
          useWebGL={useWebGL}
        />
        
        {/* Center Overlay Text */}
        {!showSettings && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
                <div className={`text-6xl font-mono font-bold tabular-nums tracking-tighter drop-shadow-2xl ${
                    isRecording ? 'text-white' : 'text-gray-400'
                }`}>
                    {formatTime(displayTime)}
                </div>
                <div className={`mt-2 text-sm uppercase tracking-[0.2em] font-bold ${
                     isRecording ? 'text-red-500 animate-pulse' : isActive ? 'text-emerald-500' : 'text-gray-500'
                }`}>
                    {isRecording ? 'RECORDING' : isActive ? 'ARMED' : 'STANDBY'}
                </div>
            </div>
        )}
      </div>

      <SettingsDrawer isOpen={showSettings} onClose={() => setShowSettings(false)}>
        {/* Cooldown */}
        <div>
            <label className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                <span>Re-Arm Delay</span>
                <span className="text-indigo-400">{cooldownMs}ms</span>
            </label>
            <input 
                type="range" 
                min="100" 
                max="3000" 
                step="100"
                value={cooldownMs}
                onChange={(e) => setCooldownMs(Number(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
        </div>

        {/* Tripwire Width */}
        <div className="border-t border-gray-800 pt-4">
            <label className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                <span>Zone Width</span>
                <span className="text-indigo-400">{tripwireWidth}px</span>
            </label>
            <input 
                type="range" 
                min="2" 
                max="100" 
                step="2"
                value={tripwireWidth}
                onChange={(e) => setTripwireWidth(Number(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
        </div>

        {/* Tripwire Height */}
        <div className="border-t border-gray-800 pt-4">
            <label className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                <span>Zone Height</span>
                <span className="text-indigo-400">{tripwireHeight}%</span>
            </label>
            <input 
                type="range" 
                min="10" 
                max="100" 
                step="5"
                value={tripwireHeight}
                onChange={(e) => setTripwireHeight(Number(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
        </div>

        {/* Sensitivity */}
        <div className="border-t border-gray-800 pt-4">
            <label className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                <span>Sensitivity Threshold</span>
                <span className="text-indigo-400">{threshold}</span>
            </label>
            <input 
                type="range" 
                min="5" 
                max="100" 
                step="1"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
        </div>

        {/* WebGL Toggle */}
        <div className="border-t border-gray-800 pt-4">
            <button
                onClick={() => setUseWebGL(!useWebGL)}
                className="w-full flex items-center justify-between py-3 px-4 rounded-xl border transition-colors bg-gray-800/50 border-gray-700 hover:bg-gray-700/50"
            >
                <div className="flex items-center gap-3">
                    {useWebGL ? <Sparkles size={18} className="text-emerald-400" /> : <Cpu size={18} className="text-gray-400" />}
                    <div className="text-left">
                        <div className="text-xs font-bold text-gray-300 uppercase tracking-wider">WebGL Acceleration</div>
                        <div className="text-[10px] text-gray-500">{useWebGL ? 'GPU-accelerated (faster)' : 'CPU fallback'}</div>
                    </div>
                </div>
                <div className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 ${useWebGL ? 'bg-emerald-500' : 'bg-gray-600'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${useWebGL ? 'translate-x-6' : 'translate-x-0'}`} />
                </div>
            </button>
        </div>
      </SettingsDrawer>

      {/* Bottom Controls */}
      <BottomControls>
        <div className="w-full">
            {/* History Section */}
            <div className="bg-gray-800 border-b border-gray-700 -mx-4 -mt-4 mb-4">
            <button 
                onClick={() => setShowHistory(!showHistory)}
                className="w-full flex items-center justify-between px-4 py-2 text-gray-400 hover:bg-gray-750 transition-colors"
            >
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                <History size={14} />
                Run Log ({history.length})
                </div>
                {showHistory ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>

            <AnimatePresence>
                {showHistory && (
                <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                >
                    <div className="max-h-48 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {history.length === 0 && (
                        <div className="text-center py-4 text-gray-500 text-sm">No history</div>
                    )}
                    {history.map((entry, index) => (
                        <div key={entry.id} className="flex items-center justify-between bg-gray-900/50 p-2 rounded border border-gray-700/50">
                        <span className="text-gray-500 text-xs font-mono">
                            #{history.length - index} 
                        </span>
                        <span className="font-mono font-bold text-white">
                            {formatTime(entry.time)}
                        </span>
                        </div>
                    ))}
                    {history.length > 0 && (
                        <button 
                        onClick={() => setHistory([])}
                        className="w-full mt-2 py-2 flex items-center justify-center gap-2 text-red-400 text-xs font-medium hover:bg-red-900/20 rounded transition-colors"
                        >
                        <Trash2 size={12} /> Clear History
                        </button>
                    )}
                    </div>
                </motion.div>
                )}
            </AnimatePresence>
            </div>

            <ControlRow className="p-0 gap-4">
                <Button 
                    variant="icon" 
                    onClick={reset}
                    className="h-12 w-12 rounded-full bg-gray-800 border border-gray-700"
                >
                    <RotateCcw size={20} />
                </Button>
                
                <button
                    onClick={toggleDetection}
                    className={`h-20 w-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
                    isActive 
                        ? 'bg-red-500/20 text-red-500 border-2 border-red-500 animate-pulse' 
                        : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/30 hover:scale-105'
                    }`}
                >
                    {isActive ? (
                    <div className="h-6 w-6 bg-current rounded-sm" /> 
                    ) : (
                    <Play size={32} className="ml-1" fill="currentColor" />
                    )}
                </button>

                <div className="flex flex-col gap-2">
                    <Button 
                        variant="icon" 
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        className={`h-10 w-10 rounded-full border transition-colors ${
                        soundEnabled 
                            ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.3)]' 
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
            </ControlRow>
        </div>
      </BottomControls>
    </div>
  );
};

export default Detection;
