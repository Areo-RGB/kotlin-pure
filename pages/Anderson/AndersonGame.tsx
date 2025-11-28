import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { onValue, getLobbyRef, updatePlayerScore, updateAllScores, initializeLobbyWithDefaults } from '../../services/firebase';
import { Player, ANDERSON_NAMES } from '../../types';
import { Button } from '../../components/Ui/Button';
import { ChevronLeft, Minus, Plus, Trophy, List, Check, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const FullscreenIcon = ({ className }: { className?: string }) => (
  <svg fill="currentColor" viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <g>
      <path d="M22.661,20.5H36c1.104,0,2-0.896,2-2s-0.896-2-2-2H19c-1.104,0-2.5,1.276-2.5,2.381v17c0,1.104,0.896,2,2,2s2-0.896,2-2 V24.876l16.042,15.791c0.391,0.391,1.027,0.586,1.539,0.586s1.086-0.195,1.477-0.586c0.781-0.781,0.812-2.237,0.031-3.019 L22.661,20.5z"/>
      <path d="M83,16.5H66c-1.104,0-2,0.896-2,2s0.896,2,2,2h12.605L61.647,37.648c-0.781,0.781-0.781,2.142,0,2.923 c0.39,0.391,0.902,0.633,1.414,0.633s0.774-0.171,1.164-0.562l16.274-16.5v11.738c0,1.104,0.896,2,2,2s2-0.896,2-2v-17 C84.5,17.776,84.104,16.5,83,16.5z"/>
      <path d="M36.542,60.962L20.5,76.754V65.881c0-1.104-0.896-2-2-2s-2,0.896-2,2v17c0,1.104,1.396,1.619,2.5,1.619h17 c1.104,0,2-0.896,2-2s-0.896-2-2-2H22.529L39.62,63.6c0.781-0.781,0.656-1.951-0.125-2.732 C38.715,60.086,37.322,60.181,36.542,60.962z"/>
      <path d="M82.5,63.881c-1.104,0-2,0.896-2,2v11.606L64.226,60.962c-0.78-0.781-1.923-0.781-2.703,0 c-0.781,0.781-0.719,1.856,0.062,2.638l17.152,16.9H66c-1.104,0-2,0.896-2,2s0.896,2,2,2h17c1.104,0,1.5-0.515,1.5-1.619v-17 C84.5,64.776,83.604,63.881,82.5,63.881z"/>
    </g>
  </svg>
);

const AndersonGame: React.FC = () => {
  const { lobbyId } = useParams<{ lobbyId: string }>();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'players' | 'input' | 'ranking'>('players');
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Default all players to selected
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set(ANDERSON_NAMES));

  useEffect(() => {
    if (!lobbyId) {
      navigate('/anderson/lobby');
      return;
    }

    const lobbyRef = getLobbyRef(lobbyId);
    let dataReceived = false;

    const unsubscribe = onValue(lobbyRef, (snapshot) => {
      dataReceived = true;
      const data = snapshot.val();
      
      if (data && data.players) {
        setPlayers(data.players);
      } else {
        // Lobby exists locally or remote but is empty, or we are starting fresh offline.
        // Initialize defaults immediately.
        initializeLobbyWithDefaults(lobbyId);
      }
      setLoading(false);
    });

    // Offline/Fallback Safety:
    // If firebase connection is slow or offline and no local cache exists, onValue might not fire immediately.
    // We force initialization after a short timeout to allow the user to play.
    const timeoutId = setTimeout(() => {
      if (!dataReceived) {
        console.warn("Firebase connection timeout - Initializing offline mode");
        initializeLobbyWithDefaults(lobbyId);
        setLoading(false);
      }
    }, 2000);

    return () => {
      unsubscribe();
      clearTimeout(timeoutId);
    };
  }, [lobbyId, navigate]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleScoreChange = (name: string, delta: number) => {
    if (lobbyId) {
      updatePlayerScore(lobbyId, name, delta);
    }
  };

  const handleGlobalChange = (delta: number) => {
    if (lobbyId) {
      // Only update selected players
      updateAllScores(lobbyId, delta, Array.from(selectedPlayers));
    }
  };

  const toggleSelection = (name: string) => {
    const newSet = new Set(selectedPlayers);
    if (newSet.has(name)) {
      newSet.delete(name);
    } else {
      newSet.add(name);
    }
    setSelectedPlayers(newSet);
  };

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

  // Derived Lists
  const allPlayersList = [...players].sort((a, b) => {
      return ANDERSON_NAMES.indexOf(a.name) - ANDERSON_NAMES.indexOf(b.name);
  });

  const inputList = [...players]
    .filter(p => selectedPlayers.has(p.name))
    .sort((a, b) => {
      return ANDERSON_NAMES.indexOf(a.name) - ANDERSON_NAMES.indexOf(b.name);
    });

  const rankedList = [...players].sort((a, b) => b.score - a.score);
  
  // Determine if we are in the specific fullscreen ranking mode
  const isRankingFullscreen = isFullscreen && activeTab === 'ranking';

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-950 text-gray-400">
        Loading Session {lobbyId}...
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full bg-gray-950 flex flex-col overflow-hidden">
      {/* Header */}
      {isRankingFullscreen ? (
        // Simplified Header for Fullscreen Ranking
        <header className="flex-none bg-gray-950 border-b border-gray-800 px-6 py-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between shadow-md z-20">
          <h1 className="text-2xl font-bold text-white tracking-tight">Ranking</h1>
          <Button 
            variant="icon" 
            onClick={toggleFullscreen} 
            className="h-10 w-10 p-2 text-white border border-gray-600 hover:text-white hover:bg-gray-700 transition-colors shadow-sm"
            title="Exit Fullscreen"
          >
            <FullscreenIcon className="w-full h-full" />
          </Button>
        </header>
      ) : (
        // Standard Header
        <header className="flex-none bg-gray-950/90 border-b border-gray-800 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center justify-between shadow-md z-20">
          <div className="flex items-center gap-3">
            <Button 
              variant="icon" 
              onClick={() => navigate('/anderson/lobby')} 
              className="h-8 w-8 p-0 flex items-center justify-center border border-gray-600 text-white hover:bg-gray-800 transition-colors"
            >
              <ChevronLeft size={16} />
            </Button>
            <div>
              <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight">Lobby</h2>
              <span className="text-base font-mono font-bold text-indigo-400 leading-tight">#{lobbyId}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button 
              variant="icon" 
              onClick={toggleFullscreen} 
              className="h-8 w-8 p-1.5 text-white border border-gray-600 hover:text-white hover:bg-gray-700 transition-colors shadow-sm"
              title="Toggle Fullscreen"
            >
              <FullscreenIcon className="w-full h-full" />
            </Button>

            <div className="flex items-center gap-2 text-gray-400 text-[10px] bg-gray-900 px-2 py-1 rounded-full border border-gray-800">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </div>
          </div>
        </header>
      )}

      {/* Content Wrapper */}
      <div className="flex-1 flex flex-col min-h-0 max-w-7xl mx-auto w-full pb-[env(safe-area-inset-bottom)]">
        
        {/* Controls & Tabs Area - Hidden in Ranking Fullscreen */}
        {!isRankingFullscreen && (
          <div className="flex-none p-3 space-y-3 bg-gray-950 z-10">
            
            {/* Global Controls - Only visible in Input tab */}
            {activeTab === 'input' && (
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="danger" 
                  onClick={() => handleGlobalChange(-1)}
                  className="py-2.5 text-sm font-semibold shadow-lg shadow-red-900/10"
                >
                  - All Selected
                </Button>
                <Button 
                  variant="success" 
                  onClick={() => handleGlobalChange(1)}
                  className="py-2.5 text-sm font-semibold shadow-lg shadow-emerald-900/10"
                >
                  + All Selected
                </Button>
              </div>
            )}

            {/* Tabs */}
            <div className="bg-gray-900 p-1 rounded-lg flex relative">
              <button
                onClick={() => setActiveTab('players')}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                  activeTab === 'players' 
                    ? 'bg-gray-800 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Users size={16} />
                Players
              </button>
              <button
                onClick={() => setActiveTab('input')}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                  activeTab === 'input' 
                    ? 'bg-gray-800 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <List size={16} />
                Input
              </button>
              <button
                onClick={() => setActiveTab('ranking')}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                  activeTab === 'ranking' 
                    ? 'bg-gray-800 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Trophy size={16} />
                Ranking
              </button>
            </div>
          </div>
        )}

        {/* Main Scrollable Area */}
        <main className={`flex-1 no-scrollbar ${isRankingFullscreen ? 'p-4 flex flex-col' : 'px-3 pb-4 overflow-y-auto'}`}>
          <AnimatePresence mode='wait'>
            {activeTab === 'players' ? (
                 <motion.div
                 key="players-list"
                 initial={{ opacity: 0, x: -20 }}
                 animate={{ opacity: 1, x: 0 }}
                 exit={{ opacity: 0, x: 20 }}
                 transition={{ duration: 0.2 }}
                 className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
               >
                 {allPlayersList.map((player) => {
                   const isSelected = selectedPlayers.has(player.name);
                   return (
                     <button
                       key={player.name}
                       onClick={() => toggleSelection(player.name)}
                       className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-200 ${
                         isSelected
                           ? 'bg-indigo-600/20 border-indigo-500/50 shadow-[0_0_15px_rgba(79,70,229,0.15)]'
                           : 'bg-gray-900 border-gray-800 opacity-60 hover:opacity-80'
                       }`}
                     >
                       <div className={`mb-2 p-2 rounded-full ${isSelected ? 'bg-indigo-500 text-white' : 'bg-gray-800 text-gray-400'}`}>
                         {isSelected ? <Check size={20} /> : <Users size={20} />}
                       </div>
                       <span className={`font-semibold ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                         {player.name}
                       </span>
                     </button>
                   );
                 })}
               </motion.div>
            ) : activeTab === 'input' ? (
              <motion.div
                key="input-list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2"
              >
                {inputList.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-400">
                        <Users size={48} className="mb-4 opacity-20" />
                        <p>No players selected.</p>
                        <Button variant="secondary" className="mt-4" onClick={() => setActiveTab('players')}>Select Players</Button>
                    </div>
                ) : (
                    inputList.map((player) => (
                        <div 
                        key={player.name}
                        className="flex items-center gap-2 p-2 border rounded-xl shadow-sm transition-all duration-300 bg-gray-900 border-gray-800"
                        >
                        {/* Decrement */}
                        <Button 
                            onClick={() => handleScoreChange(player.name, -1)}
                            className="h-20 w-20 rounded-2xl bg-red-500/20 text-red-100 hover:bg-red-500/30 border border-red-500/30 active:scale-90 flex-shrink-0 p-0 flex items-center justify-center transition-colors"
                        >
                            <Minus size={56} strokeWidth={3} />
                        </Button>

                        {/* Info */}
                        <div className="flex-1 flex flex-col items-center justify-center text-center select-none overflow-hidden min-w-0">
                            <div className="text-4xl font-bold text-white tabular-nums leading-none mb-1">
                            {player.score}
                            </div>
                            <div className="text-xs font-medium text-gray-300 uppercase tracking-wide truncate w-full">
                            {player.name}
                            </div>
                        </div>

                        {/* Increment */}
                        <Button 
                            onClick={() => handleScoreChange(player.name, 1)}
                            className="h-20 w-20 rounded-2xl bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30 border border-emerald-500/30 active:scale-90 flex-shrink-0 p-0 flex items-center justify-center transition-colors"
                        >
                            <Plus size={56} strokeWidth={3} />
                        </Button>
                        </div>
                    ))
                )}
              </motion.div>
            ) : (
              <motion.div
                key="ranking-list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className={`${isRankingFullscreen ? 'flex-1 flex flex-col' : 'grid grid-cols-1'} gap-2`}
              >
                {rankedList.map((player, index) => {
                   const isTop3 = index < 3;
                   let rankColor = "text-gray-400";
                   let rankBg = "bg-gray-800/50";
                   
                   if (index === 0) { rankColor = "text-yellow-400"; rankBg = "bg-yellow-900/20 border-yellow-700/30"; }
                   if (index === 1) { rankColor = "text-gray-300"; rankBg = "bg-gray-700/30 border-gray-600/30"; }
                   if (index === 2) { rankColor = "text-amber-600"; rankBg = "bg-amber-900/20 border-amber-800/30"; }

                   return (
                    <div 
                      key={player.name}
                      className={`${isRankingFullscreen ? 'flex-1' : ''} flex items-center justify-between p-3 rounded-xl border ${isTop3 ? rankBg : 'bg-gray-900/40 border-gray-800/50'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`font-mono font-bold text-base w-6 text-center ${rankColor}`}>
                          {index + 1}
                        </div>
                        <div className={`font-medium ${index === 0 ? 'text-white' : 'text-gray-200'}`}>
                          {player.name}
                        </div>
                      </div>
                      <div className={`font-bold tabular-nums text-xl ${index === 0 ? 'text-indigo-400' : 'text-gray-300'}`}>
                        {player.score * 20}m
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

export default AndersonGame;