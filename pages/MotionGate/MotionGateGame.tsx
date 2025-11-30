
import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  onValue,
  getMotionGateRef,
  initMotionGateSession,
  getServerTime,
  triggerMotionStart,
  triggerMotionFinish,
  resetMotionGate,
  registerDevice,
  heartbeatDevice,
  updateDeviceRole,
  removeDevice,
  clearMotionGateHistory,
  setSystemArmed
} from '../../services/firebase';
import { MotionGateSession, MotionGateDevice, MotionGateRole, MotionGateRun } from '../../types';
import { Button } from '../../components/Ui/Button';
import { ChevronLeft, RefreshCw, Settings, Smartphone, XCircle, ChevronDown, ChevronUp, Play, Square, History, Trash2, Sliders, Zap } from 'lucide-react';
import { MotionTripwire } from '../../components/MotionTripwire';
import { motion, AnimatePresence } from 'framer-motion';

const MotionGateGame: React.FC = () => {
  const { lobbyId } = useParams<{ lobbyId: string }>();
  const navigate = useNavigate();

  // --- Device Identity ---
  const [deviceId] = useState(() => {
    const stored = sessionStorage.getItem('mg_device_id');
    if (stored) return stored;
    const newId = Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem('mg_device_id', newId);
    return newId;
  });

  const [deviceName] = useState(() => {
    return `Device ${deviceId.substr(0, 3).toUpperCase()}`;
  });

  // --- State ---
  const [session, setSession] = useState<MotionGateSession>({
    status: 'IDLE',
    startTime: null,
    finishTime: null,
    runId: '',
    devices: {}
  });

  const [displayTime, setDisplayTime] = useState(0);
  const [flash, setFlash] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isLocalArmed, setIsLocalArmed] = useState(false);

  // Detection Settings
  const [blurRadius, setBlurRadius] = useState(4);
  const [cooldownMs, setCooldownMs] = useState(500);

  // --- Effects ---

  // 1. Init & Listen
  useEffect(() => {
    if (!lobbyId) return;

    initMotionGateSession(lobbyId);
    registerDevice(lobbyId, deviceId, deviceName);

    const hbInterval = setInterval(() => {
      heartbeatDevice(lobbyId, deviceId);
    }, 5000);

    const mgRef = getMotionGateRef(lobbyId);
    const unsubscribe = onValue(mgRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setSession(data);
      }
    });

    return () => {
      clearInterval(hbInterval);
      unsubscribe();
    };
  }, [lobbyId, deviceId, deviceName]);

  // 2. Timer Loop
  useEffect(() => {
    let frameId: number;
    const update = () => {
      if (session.status === 'RUNNING' && session.startTime) {
        setDisplayTime(getServerTime() - session.startTime);
        frameId = requestAnimationFrame(update);
      } else if (session.status === 'FINISHED' && session.startTime && session.finishTime) {
        setDisplayTime(session.finishTime - session.startTime);
      } else if (session.status === 'IDLE') {
        setDisplayTime(0);
      }
    };
    update();
    return () => cancelAnimationFrame(frameId);
  }, [session.status, session.startTime, session.finishTime]);

  // 3. Flash Effect
  useEffect(() => {
    if (session.status !== 'IDLE') {
      setFlash(true);
      setTimeout(() => setFlash(false), 200);
    }
  }, [session.status, session.runId]);

  // 4. Sync System Armed State
  useEffect(() => {
    if (session.systemArmed !== undefined) {
      setIsLocalArmed(session.systemArmed);
    }
  }, [session.systemArmed]);

  // --- Helpers ---

  const devicesList = useMemo(() => {
    if (!session.devices) return [];
    const now = getServerTime();
    return (Object.values(session.devices) as MotionGateDevice[]).map((d) => ({
      ...d,
      isOnline: (now - d.lastSeen) < 10000
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [session.devices]);

  const historyList = useMemo(() => {
    if (!session.history) return [];
    return (Object.values(session.history) as MotionGateRun[]).sort((a, b) => b.startTime - a.startTime);
  }, [session.history]);

  const myDevice = session.devices?.[deviceId] || { role: 'UNASSIGNED' };
  const role = myDevice.role;

  // Determine View Mode
  const isSetupMode = role === 'UNASSIGNED' || showSettings;

  const handleMotionTrigger = () => {
    if (!lobbyId) return;
    const nowServerTime = getServerTime();

    if (role === 'START') {
      if (session.status === 'IDLE' || session.status === 'FINISHED') {
        triggerMotionStart(lobbyId, nowServerTime);
        setSystemArmed(lobbyId, false); // Auto disarm system after trigger
      }
    } else if (role === 'FINISH') {
      if (session.status === 'RUNNING') {
        triggerMotionFinish(lobbyId, nowServerTime);
        // We don't necessarily disarm system on finish, or maybe we do? 
        // Usually finish gate just disarms itself locally or system disarms?
        // Let's keep local disarm for finish gate for now, or if it's system armed, it should probably stay armed until reset?
        // Actually, if system armed, we probably want to disarm system to prevent double triggers?
        // For now, let's just disarm local, as FINISH usually doesn't control system arm state unless it's the master.
        // But wait, if START controls arming, then FINISH triggering shouldn't disarm START?
        // Let's stick to local disarm for FINISH for now, unless we want FINISH to also disarm system.
        setIsLocalArmed(false);
      }
    }
  };

  const handleReset = () => {
    if (lobbyId) resetMotionGate(lobbyId);
  };

  const handleRoleChange = (targetDeviceId: string, newRole: MotionGateRole) => {
    // Prevent abrupt closing of setup menu if user assigns themselves
    if (targetDeviceId === deviceId) {
      setIsLocalArmed(false);
      setShowSettings(true);
    }
    if (lobbyId) updateDeviceRole(lobbyId, targetDeviceId, newRole);
  };

  const handleRemoveDevice = (targetDeviceId: string) => {
    if (confirm("Remove this device?") && lobbyId) {
      removeDevice(lobbyId, targetDeviceId);
    }
  }

  const playBeep = () => {
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
      osc.frequency.setValueAtTime(1000, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.error("Audio error:", e);
    }
  };

  const handleManualStart = () => {
    if (!lobbyId) return;
    playBeep();
    if (session.status !== 'RUNNING') {
      triggerMotionStart(lobbyId, getServerTime());
    }
  };

  const formatTime = (ms: number) => {
    if (ms < 0) ms = 0;
    const seconds = Math.floor(ms / 1000);
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${seconds}.${milliseconds.toString().padStart(2, '0')}s`;
  };

  // Activation logic: Must be locally armed AND logically correct for the game state
  const isSensorActive = isLocalArmed && (
    (role === 'START' && (session.status === 'IDLE' || session.status === 'FINISHED')) ||
    (role === 'FINISH' && session.status === 'RUNNING')
  );

  // --- Render ---

  return (
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden touch-none text-white">
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

      {/* Header Layer */}
      <div className="absolute top-0 left-0 right-0 z-50 p-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between pointer-events-none">
        <Button variant="icon" onClick={() => navigate('/motion-gate/lobby')} className="bg-black/60 backdrop-blur-md border-gray-600 text-white pointer-events-auto hover:bg-black/80">
          <ChevronLeft size={20} />
        </Button>

        {!isSetupMode && (
          <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-gray-600 flex items-center gap-2 shadow-lg">
            <span className={`w-2 h-2 rounded-full ${session.status === 'RUNNING' ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
            <span className="text-xs font-mono font-bold text-white">#{lobbyId}</span>
          </div>
        )}

        <Button
          variant="icon"
          onClick={() => setShowSettings(!showSettings)}
          className={`pointer-events-auto backdrop-blur-md border-gray-600 transition-colors ${showSettings ? 'bg-indigo-600 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`}
        >
          <Settings size={20} />
        </Button>
      </div>

      {/* Layer 1: Active Game View */}
      <div className={`absolute inset-0 transition-opacity duration-500 ${isSetupMode ? 'opacity-10 pointer-events-none' : 'opacity-100'}`}>
        {role === 'DISPLAY' ? (
          <div className="flex flex-col items-center justify-center h-full bg-gray-900">
            <div className={`text-[20vw] font-mono font-bold tabular-nums tracking-tighter leading-none ${session.status === 'RUNNING' ? 'text-white' : session.status === 'FINISHED' ? 'text-emerald-400' : 'text-gray-500'}`}>
              {formatTime(displayTime)}
            </div>
            <div className="mt-4 text-xl uppercase tracking-widest font-bold text-gray-500">
              {session.status}
            </div>
            {session.status === 'FINISHED' && (
              <Button onClick={handleReset} variant="secondary" className="mt-12 pointer-events-auto z-30">
                <RefreshCw size={16} className="mr-2" /> Reset Timer
              </Button>
            )}
          </div>
        ) : (
          <div className="relative w-full h-full bg-gray-900">
            <MotionTripwire
              isActive={isSensorActive}
              onTrigger={handleMotionTrigger}
              color={role === 'START' ? 'green' : 'red'}
              blurRadius={blurRadius}
              cooldownMs={cooldownMs}
            />
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
              <div
                className={`text-6xl font-mono font-bold tabular-nums tracking-tighter ${session.status === 'RUNNING' ? 'text-white' : 'text-gray-100'}`}
                style={{ textShadow: '0 4px 12px rgba(0,0,0,0.9)' }}
              >
                {formatTime(displayTime)}
              </div>
              <div className="mt-2 px-4 py-2 bg-black/70 backdrop-blur-md rounded-full border border-white/10 shadow-xl">
                <span className={`text-sm uppercase tracking-widest font-bold ${(role === 'FINISH' && session.status === 'RUNNING' && isLocalArmed) ? 'text-red-400' :
                    (role === 'START' && session.status !== 'RUNNING' && isLocalArmed) ? 'text-emerald-400' :
                      session.status === 'RUNNING' ? 'text-white animate-pulse' :
                        'text-gray-300'
                  }`}>
                  {role === 'START' ? 'START GATE' : role === 'FINISH' ? 'FINISH GATE' : ''}
                </span>

                {!isLocalArmed && !isSetupMode && (
                  <div className="text-[10px] text-center text-red-400 font-bold uppercase mt-1 tracking-wider animate-pulse">
                    Disarmed
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Layer 2: Setup/Settings Overlay */}
      <AnimatePresence>
        {isSetupMode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute inset-0 z-40 bg-gray-950/90 backdrop-blur-sm flex flex-col items-center pt-24 px-4 pb-4 overflow-y-auto"
          >
            <div className="w-full max-w-md space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-sm text-gray-400 uppercase tracking-wider">Session ID</h2>
                <div className="text-6xl font-mono font-bold text-indigo-400 tracking-widest">
                  {lobbyId}
                </div>
                <p className="text-xs text-gray-500">Share this ID to connect other devices</p>
              </div>

              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-2xl">
                <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-800 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-200 flex items-center gap-2">
                    <Smartphone size={18} /> Connected Devices
                  </h3>
                  <span className="text-xs bg-gray-800 px-2 py-1 rounded text-gray-400">
                    {devicesList.length} Active
                  </span>
                </div>

                <div className="divide-y divide-gray-800">
                  {devicesList.map((device) => (
                    <div key={device.id} className="p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${device.isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-gray-600'}`} />
                        <div className="min-w-0">
                          <div className="font-medium text-white truncate flex items-center gap-2">
                            {device.name}
                            {device.id === deviceId && <span className="text-[10px] bg-indigo-900/50 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-800/50">YOU</span>}
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            {device.isOnline ? 'Online' : 'Last seen a while ago'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <select
                            value={device.role || 'UNASSIGNED'}
                            onChange={(e) => handleRoleChange(device.id, e.target.value as MotionGateRole)}
                            className={`appearance-none pl-3 pr-8 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border focus:ring-2 focus:ring-indigo-500 outline-none transition-colors cursor-pointer
                                                  ${device.role === 'START' ? 'bg-emerald-900/30 border-emerald-800 text-emerald-400' :
                                device.role === 'FINISH' ? 'bg-red-900/30 border-red-800 text-red-400' :
                                  device.role === 'DISPLAY' ? 'bg-blue-900/30 border-blue-800 text-blue-400' :
                                    'bg-gray-800 border-gray-700 text-gray-200'}
                                              `}
                          >
                            <option value="UNASSIGNED">Unassigned</option>
                            <option value="START">Start Gate</option>
                            <option value="FINISH">Finish Gate</option>
                            <option value="DISPLAY">Display</option>
                          </select>
                          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
                        </div>

                        {(!device.isOnline || device.id !== deviceId) && (
                          <button
                            onClick={() => handleRemoveDevice(device.id)}
                            className="p-1.5 text-gray-600 hover:text-red-400 transition-colors"
                            title="Remove Device"
                          >
                            <XCircle size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detection Settings Card */}
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-2xl">
                <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-800 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-200 flex items-center gap-2">
                    <Sliders size={18} /> Detection Settings
                  </h3>
                </div>
                <div className="p-4 space-y-6">
                  <div>
                    <label className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                      <span>Motion Blur</span>
                      <span className="text-indigo-400">{blurRadius}px</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="20"
                      step="1"
                      value={blurRadius}
                      onChange={(e) => setBlurRadius(Number(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-600 mt-1 font-medium uppercase">
                      <span>Sharp</span>
                      <span>Smoothed</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-2">
                      Adjust blur to filter out noise. Higher values ignore small movements but may miss fast objects.
                    </p>
                  </div>

                  <div className="border-t border-gray-800 pt-4">
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
                    <div className="flex justify-between text-[10px] text-gray-600 mt-1 font-medium uppercase">
                      <span>Fast</span>
                      <span>Slow</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-2">
                      Minimum delay between triggers to prevent double counting echoes.
                    </p>
                  </div>
                </div>
              </div>

              {role !== 'UNASSIGNED' && (
                <Button fullWidth onClick={() => setShowSettings(false)}>
                  Return to Game
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Controls for Gates */}
      {!isSetupMode && role !== 'DISPLAY' && (
        <div className="absolute bottom-0 left-0 right-0 z-20 bg-gray-900/80 backdrop-blur border-t border-gray-800 pb-[env(safe-area-inset-bottom)]">

          {/* History Drawer */}
          <div className="bg-gray-800/80 border-b border-gray-700">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between px-4 py-2 text-gray-400 hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                <History size={14} />
                History ({historyList.length})
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
                  <div className="max-h-48 overflow-y-auto p-2 space-y-1 custom-scrollbar bg-gray-900/80">
                    {historyList.length === 0 && (
                      <div className="text-center py-4 text-gray-500 text-sm">No session history</div>
                    )}
                    {historyList.map((run, index) => (
                      <div key={run.runId} className="flex items-center justify-between bg-gray-950/50 p-2 rounded border border-gray-800">
                        <span className="text-gray-500 text-xs font-mono">#{historyList.length - index}</span>
                        <span className="text-white font-mono font-bold">{formatTime(run.finishTime - run.startTime)}</span>
                      </div>
                    ))}
                    {historyList.length > 0 && (
                      <button
                        onClick={() => lobbyId && clearMotionGateHistory(lobbyId)}
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

          {/* Main Controls */}
          <div className="p-4 flex items-center justify-between px-6">
            <Button
              variant="secondary"
              onClick={handleReset}
              disabled={session.status === 'IDLE'}
              className={`rounded-full h-12 w-12 p-0 flex items-center justify-center border border-gray-700 bg-gray-800/50 text-white ${session.status === 'IDLE' ? 'opacity-30' : 'opacity-100'}`}
            >
              <RefreshCw size={20} />
            </Button>

            <button
              onClick={() => {
                const newState = !isLocalArmed;
                setIsLocalArmed(newState);
                if (role === 'START' && lobbyId) {
                  setSystemArmed(lobbyId, newState);
                }
              }}
              className={`h-20 w-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${isLocalArmed
                  ? 'bg-red-500/20 text-red-500 border-2 border-red-500 animate-pulse'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/30 hover:scale-105'
                }`}
            >
              {isLocalArmed ? (
                <Square size={24} fill="currentColor" />
              ) : (
                <Play size={32} className="ml-1" fill="currentColor" />
              )}
            </button>

            <Button
              variant="secondary"
              onClick={handleManualStart}
              disabled={session.status === 'RUNNING'}
              className={`rounded-full h-12 w-12 p-0 flex items-center justify-center border border-gray-700 bg-gray-800/50 text-white ${session.status === 'RUNNING' ? 'opacity-30' : 'opacity-100'}`}
            >
              <Zap size={20} className={session.status !== 'RUNNING' ? "text-yellow-400 fill-yellow-400/20" : ""} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MotionGateGame;