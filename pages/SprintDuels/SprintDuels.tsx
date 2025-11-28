
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Ui/Button';
import { ChevronLeft, Zap, RefreshCw, StopCircle, Users, Trophy, Crown, ArrowRight, Camera, CameraOff, Volume2, Maximize, Minimize, X, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Matchup {
  id: string;
  players: number[];
  winner: number | null;
}

const SprintDuels: React.FC = () => {
  const navigate = useNavigate();
  // Initialize pool 1-20
  const [availableNumbers, setAvailableNumbers] = useState<number[]>(
    Array.from({ length: 20 }, (_, i) => i + 1)
  );
  const [drawnHistory, setDrawnHistory] = useState<number[]>([]);
  const [photos, setPhotos] = useState<Record<number, string>>({});
  const [isAnimating, setIsAnimating] = useState(false);
  const [displayNumber, setDisplayNumber] = useState<number | null>(null);
  const [matchups, setMatchups] = useState<Matchup[] | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Win Tracking
  const [pastWins, setPastWins] = useState<Record<number, number>>({});
  const [showRanking, setShowRanking] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.error("Error toggling fullscreen:", err);
    }
  };

  // Camera Management
  const startCamera = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } } 
        });
        streamRef.current = stream;
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }
        setCameraError(false);
    } catch (err) {
        console.error("Camera init error", err);
        setCameraError(true);
    }
  };

  const stopCamera = () => {
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
      }
  };

  useEffect(() => {
    if (!matchups) {
        startCamera();
    } else {
        stopCamera();
    }
    return () => stopCamera();
  }, [matchups]);

  const capturePhoto = (number: number) => {
      if (videoRef.current && !cameraError) {
          try {
            const canvas = document.createElement('canvas');
            // Square crop setup
            const size = Math.min(videoRef.current.videoWidth, videoRef.current.videoHeight);
            canvas.width = 300;
            canvas.height = 300;
            
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Draw centered crop
                const sx = (videoRef.current.videoWidth - size) / 2;
                const sy = (videoRef.current.videoHeight - size) / 2;
                
                // Horizontal flip for mirror effect consistency
                ctx.translate(300, 0);
                ctx.scale(-1, 1);
                
                ctx.drawImage(videoRef.current, sx, sy, size, size, 0, 0, 300, 300);
                
                const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                setPhotos(prev => ({ ...prev, [number]: dataUrl }));
            }
          } catch (e) {
              console.warn("Capture failed", e);
          }
      }
  };

  const generateNumber = () => {
    if (availableNumbers.length === 0) return;

    setIsAnimating(true);
    let counter = 0;
    
    // Animation loop: Cycle random numbers quickly for visual effect
    const interval = setInterval(() => {
      setDisplayNumber(Math.floor(Math.random() * 20) + 1);
      counter++;
      
      // Stop after ~800ms (16 frames * 50ms)
      if (counter > 16) {
        clearInterval(interval);
        finalizeNumber();
      }
    }, 50);
  };

  const finalizeNumber = () => {
    // Pick actual unique number from available pool
    const randomIndex = Math.floor(Math.random() * availableNumbers.length);
    const selected = availableNumbers[randomIndex];
    
    capturePhoto(selected);

    // Remove selected from pool
    setAvailableNumbers(prev => prev.filter(n => n !== selected));
    setDrawnHistory(prev => [selected, ...prev]);
    setDisplayNumber(selected);
    setIsAnimating(false);
  };

  const resetPool = () => {
    setAvailableNumbers(Array.from({ length: 20 }, (_, i) => i + 1));
    setDrawnHistory([]);
    setPhotos({});
    setMatchups(null);
    setDisplayNumber(null);
    setIsAnimating(false);
    setPastWins({});
  };

  // --- Grouping Logic (4s and 3s) ---
  const groupPlayers = (pool: number[]): number[][] => {
      const groups: number[][] = [];
      let remaining = pool.length;
      let i = 0;

      // Logic: Prefer groups of 4.
      // If remainder exists, backtrack to convert 4s into 3s to fit everyone.
      // If pool % 4 == 0: All 4s.
      // If pool % 4 == 1: (e.g. 5, 9, 13). 
      //    13 -> 4,3,3,3. 9 -> 3,3,3. 5 -> 3,2 (fallback to 2 if n<6).
      // If pool % 4 == 2: (e.g. 6, 10, 14).
      //    14 -> 4,4,3,3. 10 -> 4,3,3. 6 -> 3,3.
      // If pool % 4 == 3: (e.g. 7, 11).
      //    11 -> 4,4,3. 7 -> 4,3.

      while (remaining > 0) {
          let size = 4;
          
          if (remaining % 4 !== 0) {
              // If not divisible by 4, we likely need to take a 3 to shift the remainder alignment
              // or because we are small.
              size = 3;
          }

          // Edge case handling for small remainders
          if (remaining === 5) size = 3; // leaves 2, handled next loop
          if (remaining === 2) size = 2; // Forced 2
          if (remaining === 1) size = 1; // Forced 1 (shouldn't happen with correct logic unless N=1)

          const chunk = pool.slice(i, i + size);
          groups.push(chunk);
          i += size;
          remaining -= size;
      }
      return groups;
  };

  const generateMatchups = () => {
    // Fisher-Yates shuffle
    const pool = [...drawnHistory];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const groups = groupPlayers(pool);
    
    const newMatchups: Matchup[] = groups.map(g => ({
        id: Math.random().toString(36).substr(2, 9),
        players: g,
        winner: null
    }));

    setMatchups(newMatchups);
  };

  const generateNextRound = () => {
    if (!matchups) return;

    // Snapshot wins
    setPastWins(prev => {
        const next = { ...prev };
        matchups.forEach(m => {
            if (m.winner !== null) next[m.winner] = (next[m.winner] || 0) + 1;
        });
        return next;
    });

    const winnersSet = new Set<number>();
    const allPlayersSet = new Set<number>();

    matchups.forEach(m => {
        if (m.winner !== null) winnersSet.add(m.winner);
        m.players.forEach(p => allPlayersSet.add(p));
    });

    const winners = Array.from(winnersSet);
    const losers = Array.from(allPlayersSet).filter(p => !winnersSet.has(p));

    const shuffle = (arr: number[]) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    shuffle(winners);
    shuffle(losers);

    const winnerGroups = groupPlayers(winners);
    const loserGroups = groupPlayers(losers);

    const newMatchups: Matchup[] = [
        ...winnerGroups.map(g => ({ id: Math.random().toString(36).substr(2, 9), players: g, winner: null })),
        ...loserGroups.map(g => ({ id: Math.random().toString(36).substr(2, 9), players: g, winner: null }))
    ];

    setMatchups(newMatchups);
  };

  const toggleWinner = (matchIndex: number, player: number) => {
    setMatchups(prev => {
        if (!prev) return null;
        const newMatchups = [...prev];
        const match = newMatchups[matchIndex];
        
        if (match.winner === player) {
            match.winner = null;
        } else {
            match.winner = player;
        }
        return newMatchups;
    });
  };

  // --- Helpers for Ranking ---
  const getRankedPlayers = () => {
    const currentWins = { ...pastWins };
    if (matchups) {
        matchups.forEach(m => {
            if (m.winner !== null) currentWins[m.winner] = (currentWins[m.winner] || 0) + 1;
        });
    }
    
    return [...drawnHistory].sort((a, b) => {
        const winsA = currentWins[a] || 0;
        const winsB = currentWins[b] || 0;
        if (winsB !== winsA) return winsB - winsA;
        return 0;
    }).map(p => ({ id: p, wins: currentWins[p] || 0 }));
  };

  // --- Audio / Announcement Logic ---
  
  const playStartBeep = () => {
    try {
        // @ts-ignore
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        // High pitch beep
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);

        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
        console.error("Audio error", e);
    }
  };

  const announceMatch = (players: number[]) => {
    if (!('speechSynthesis' in window)) return;

    // Create Utterance: "8 gegen 4 gegen 12..."
    const text = players.join(' gegen ');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 1.0; 

    // Find a German voice
    const voices = window.speechSynthesis.getVoices();
    const germanVoice = voices.find(v => 
        v.lang.startsWith('de') && (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('stefan') || v.name.toLowerCase().includes('markus'))
    ) || voices.find(v => v.lang.startsWith('de'));
    
    if (germanVoice) {
        utterance.voice = germanVoice;
    }

    utterance.onend = () => {
        setTimeout(() => {
            playStartBeep();
        }, 600); 
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const allDecided = matchups?.every(m => m.winner !== null) ?? false;

  return (
    <div className="min-h-screen bg-gray-950 p-6 flex flex-col items-center">
        {/* Header */}
        <div className="w-full max-w-md flex items-center justify-between mb-6 pt-4 relative z-10">
            <Button variant="icon" onClick={() => navigate('/tools')}>
                <ChevronLeft size={20} />
            </Button>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Zap className="text-yellow-400 fill-yellow-400" /> Sprint Duels
            </h1>
            <div className="flex items-center gap-2">
                <Button variant="icon" onClick={() => setShowRanking(true)}>
                    <Trophy size={20} />
                </Button>
                <Button variant="icon" onClick={toggleFullscreen}>
                    {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                </Button>
            </div>
        </div>

        {matchups ? (
            // MATCHUPS VIEW
            <div className="w-full max-w-2xl flex-1 flex flex-col animate-in slide-in-from-right duration-300">
                <div className="text-center mb-6">
                    <h2 className="text-xl font-bold text-gray-200">Matchups Generated</h2>
                    <p className="text-sm text-gray-500">Tap player to win</p>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto pb-6">
                    {matchups.map((match, idx) => (
                        <div key={match.id} className="relative bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-lg">
                             
                             <div className="flex items-stretch h-32">
                                 {match.players.map((p, pIndex) => (
                                     <button
                                        key={p}
                                        onClick={() => toggleWinner(idx, p)}
                                        className={`flex-1 relative flex flex-col items-center justify-center transition-all duration-200 border-r border-gray-800 last:border-r-0 group ${
                                            match.winner === p 
                                                ? 'bg-emerald-900/40 text-emerald-400' 
                                                : match.winner !== null 
                                                    ? 'bg-gray-900 opacity-30 grayscale' 
                                                    : 'hover:bg-gray-800'
                                        }`}
                                     >
                                         <div className="flex flex-col items-center gap-2">
                                             <div className="relative">
                                                 {photos[p] && (
                                                     <img src={photos[p]} alt={`${p}`} className="w-12 h-12 rounded-full border border-gray-600 object-cover shadow-sm" />
                                                 )}
                                                 {match.winner === p && (
                                                     <div className="absolute -top-3 -right-3 bg-emerald-500 rounded-full p-1 text-black shadow-lg animate-in zoom-in">
                                                         <Crown size={12} fill="currentColor" />
                                                     </div>
                                                 )}
                                             </div>
                                             <div className="text-3xl font-black">{p}</div>
                                         </div>
                                         
                                         <span className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${match.winner === p ? 'text-emerald-500' : 'text-gray-600'}`}>
                                             {match.winner === p ? 'Winner' : `Lane ${pIndex + 1}`}
                                         </span>
                                         
                                         {match.winner === p && (
                                             <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />
                                         )}
                                     </button>
                                 ))}
                             </div>

                             {/* Start/Announce Overlay Button */}
                             <div className="absolute top-0 left-0 w-full flex justify-center -mt-0 pointer-events-none">
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        announceMatch(match.players);
                                    }}
                                    className="bg-gray-800 border border-gray-700 rounded-b-xl px-3 py-1 flex items-center justify-center gap-1 text-[10px] font-bold text-gray-400 hover:text-white hover:bg-gray-700 hover:border-yellow-500 transition-all shadow-lg pointer-events-auto active:scale-95"
                                >
                                    <Volume2 size={10} /> Start Race
                                </button>
                             </div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-800 max-w-md mx-auto w-full">
                    <Button fullWidth onClick={() => setMatchups(null)} variant="secondary">
                        <RefreshCw size={16} className="mr-2" /> New Draw
                    </Button>
                    <Button 
                        fullWidth 
                        onClick={generateNextRound} 
                        disabled={!allDecided}
                        className={`${!allDecided ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        Next Round <ArrowRight size={16} className="ml-2" />
                    </Button>
                </div>
            </div>
        ) : (
            // DRAWING VIEW
            <div className="w-full max-w-md flex-1 flex flex-col items-center space-y-8 pb-12">
                
                {/* Display Box with Camera */}
                <div className={`relative bg-gray-900 rounded-3xl border-4 border-gray-800 flex items-center justify-center shadow-2xl overflow-hidden group shrink-0 transition-all duration-300
                    ${isFullscreen ? 'w-[min(90vw,50vh)] h-[min(90vw,50vh)]' : 'w-64 h-64'}
                `}>
                    
                    {!cameraError && (
                        <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            muted 
                            className="absolute inset-0 w-full h-full object-cover opacity-60 scale-x-[-1]" 
                        />
                    )}
                    
                    {cameraError && (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-700">
                            <CameraOff size={48} />
                        </div>
                    )}

                    <div className={`absolute inset-0 bg-yellow-500/5 blur-xl transition-opacity pointer-events-none ${isAnimating ? 'opacity-100' : 'opacity-0'}`} />
                    
                    <div className="relative z-10">
                        {displayNumber !== null ? (
                            <div className={`font-black tabular-nums tracking-tighter transition-all duration-100 
                                ${isAnimating ? 'text-white/80 blur-[2px] scale-90' : 'text-yellow-400 scale-100 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]'}
                                ${isFullscreen ? 'text-[10rem] sm:text-[14rem]' : 'text-9xl'}
                            `}
                                style={{ textShadow: '0 0 20px rgba(0,0,0,0.8)' }}>
                                {displayNumber}
                            </div>
                        ) : (
                            <div className="text-white/50 text-xl font-bold uppercase tracking-widest text-center px-8 drop-shadow-md">
                                Ready
                            </div>
                        )}
                    </div>
                    
                    <div className="absolute top-4 right-4 text-xs font-mono font-bold text-white/80 bg-black/60 backdrop-blur-sm px-2 py-1 rounded">
                        Left: {availableNumbers.length}
                    </div>
                </div>

                {/* Controls */}
                <div className="w-full max-w-xs space-y-4 shrink-0">
                    <button
                        onClick={generateNumber}
                        disabled={isAnimating || availableNumbers.length === 0}
                        className={`w-full py-6 rounded-2xl text-2xl font-black uppercase tracking-wider transition-all transform active:scale-95 shadow-lg border-b-4 relative overflow-hidden
                            ${isAnimating || availableNumbers.length === 0 
                                ? 'bg-gray-800 border-gray-900 text-gray-600 cursor-not-allowed' 
                                : 'bg-gradient-to-br from-yellow-400 to-orange-500 border-orange-700 text-black hover:brightness-110 shadow-orange-500/20'
                            }`}
                    >
                        <span className="relative z-10 flex items-center justify-center gap-3">
                            {isAnimating ? 'Rolling...' : availableNumbers.length === 0 ? 'Pool Empty' : (
                                <>
                                    <Camera size={24} /> Draw #{!isAnimating && availableNumbers.length > 0 ? '' : ''}
                                </>
                            )}
                        </span>
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                        <Button 
                            variant="secondary" 
                            onClick={resetPool} 
                            disabled={drawnHistory.length === 0}
                            className="flex items-center justify-center gap-2 border-gray-800 bg-gray-900 hover:bg-gray-800"
                        >
                            <RefreshCw size={16} /> Reset
                        </Button>

                        <Button 
                            variant="danger" 
                            onClick={generateMatchups}
                            disabled={drawnHistory.length < 2 || isAnimating}
                            className="flex items-center justify-center gap-2"
                        >
                            <StopCircle size={16} /> Stop & Pair
                        </Button>
                    </div>
                </div>

                {/* History List */}
                <div className="w-full flex-1 min-h-0 bg-gray-900/50 border border-gray-800 rounded-xl p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <Users size={14} /> Given Out ({drawnHistory.length})
                        </h3>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                         {drawnHistory.length === 0 ? (
                             <div className="h-full flex items-center justify-center text-gray-600 text-sm italic">
                                 No numbers drawn yet
                             </div>
                         ) : (
                             <div className="flex flex-wrap gap-2 content-start">
                                 <AnimatePresence mode='popLayout'>
                                    {drawnHistory.map((num) => (
                                        <motion.div
                                            key={num}
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            layout
                                            className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center font-bold text-white shadow-sm overflow-hidden relative"
                                        >
                                            {photos[num] && (
                                                <img src={photos[num]} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />
                                            )}
                                            <span className="relative z-10 shadow-black drop-shadow-md">{num}</span>
                                        </motion.div>
                                    ))}
                                 </AnimatePresence>
                             </div>
                         )}
                    </div>
                </div>
            </div>
        )}

        {/* Ranking Overlay */}
        <AnimatePresence>
            {showRanking && (
                <motion.div 
                    initial={{ opacity: 0, y: '100%' }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="fixed inset-0 z-50 bg-gray-950 flex flex-col"
                >
                    <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Trophy className="text-yellow-400 fill-yellow-400/20" /> Leaderboard
                        </h2>
                        <Button variant="icon" onClick={() => setShowRanking(false)}>
                            <X size={20} />
                        </Button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4">
                        <div className="max-w-md mx-auto space-y-2">
                            {getRankedPlayers().map((player, index) => {
                                let rankColor = "text-gray-500";
                                let rankBg = "bg-gray-900 border-gray-800";
                                
                                if (index === 0) { rankColor = "text-yellow-400"; rankBg = "bg-yellow-900/20 border-yellow-700/50"; }
                                if (index === 1) { rankColor = "text-gray-300"; rankBg = "bg-gray-800 border-gray-600/50"; }
                                if (index === 2) { rankColor = "text-amber-700"; rankBg = "bg-orange-900/20 border-orange-800/50"; }

                                return (
                                    <div key={player.id} className={`${rankBg} border p-4 rounded-xl flex items-center justify-between shadow-sm`}>
                                        <div className="flex items-center gap-4">
                                            <div className={`font-mono font-bold text-lg w-8 text-center ${rankColor}`}>
                                                #{index + 1}
                                            </div>
                                            <div className="relative w-12 h-12">
                                                {photos[player.id] ? (
                                                    <img src={photos[player.id]} className="w-full h-full rounded-full object-cover border border-gray-700 shadow-lg" alt="" />
                                                ) : (
                                                    <div className="w-full h-full rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-600">
                                                        <Users size={20} />
                                                    </div>
                                                )}
                                                {index === 0 && (
                                                    <div className="absolute -top-1 -right-1 bg-yellow-500 rounded-full p-1 text-black shadow-lg">
                                                        <Crown size={10} fill="currentColor" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-2xl font-bold text-white">
                                                Player {player.id}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className={`text-2xl font-black tabular-nums ${index === 0 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                                                {player.wins}
                                            </span>
                                            <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">
                                                Wins
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                            {drawnHistory.length === 0 && (
                                <div className="text-center text-gray-500 mt-10 py-10 bg-gray-900/30 rounded-xl border border-dashed border-gray-800">
                                    <Users className="mx-auto mb-2 opacity-50" size={32} />
                                    No players recorded yet.
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    </div>
  );
};

export default SprintDuels;