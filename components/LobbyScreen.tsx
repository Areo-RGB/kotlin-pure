import React from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { ArrowRight, ChevronLeft, Plus } from 'lucide-react';

interface LobbyScreenProps {
  title: string;
  lobbyId: string;
  setLobbyId: (id: string) => void;
  onJoin: () => void;
  onCreate: () => void;
  onBack: () => void;
  loading: boolean;
  color?: 'indigo' | 'red' | 'cyan' | 'pink' | 'emerald';
  icon?: React.ReactNode;
  description?: string;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  title,
  lobbyId,
  setLobbyId,
  onJoin,
  onCreate,
  onBack,
  loading,
  color = 'indigo',
  icon,
  description
}) => {
  const handleNumberClick = (num: number) => {
    if (lobbyId.length < 3) {
      setLobbyId(lobbyId + num.toString());
    }
  };

  const handleBackspace = () => {
    setLobbyId(lobbyId.slice(0, -1));
  };

  const colors = {
    indigo: { text: 'text-indigo-400', border: 'border-l-indigo-500', bg: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20' },
    red: { text: 'text-red-400', border: 'border-l-red-500', bg: 'bg-red-600 hover:bg-red-500 shadow-red-500/20' },
    cyan: { text: 'text-cyan-400', border: 'border-l-cyan-500', bg: 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-500/20' },
    pink: { text: 'text-pink-400', border: 'border-l-pink-500', bg: 'bg-pink-600 hover:bg-pink-500 shadow-pink-500/20' },
    emerald: { text: 'text-emerald-400', border: 'border-l-emerald-500', bg: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20' }
  };
  
  const theme = colors[color];

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-950 overflow-hidden p-4">
      <div className="w-full max-w-xs flex flex-col h-full max-h-[700px] justify-center gap-3 sm:gap-5">
        
        <div className="flex items-center justify-between">
          <Button variant="icon" onClick={onBack} className="h-10 w-10">
            <ChevronLeft size={20} />
          </Button>
          <span className={`${theme.text} font-bold uppercase tracking-wider text-sm flex items-center gap-2`}>
            {icon} {title}
          </span>
          <div className="w-10" />
        </div>

        <Card className={`text-center py-6 bg-gray-900 border-gray-800 shrink-0 border-l-4 ${theme.border}`}>
          <div className="text-xs text-gray-400 mb-1 uppercase tracking-wider">Enter Lobby ID</div>
          <div className={`text-5xl font-mono font-bold tracking-widest ${theme.text} h-12 flex items-center justify-center`}>
            {lobbyId.padEnd(3, '_').split('').map((char, i) => (
              <span key={i} className={`mx-1 ${char === '_' ? 'text-gray-600' : ''}`}>{char}</span>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 shrink-0">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <Button 
              key={num} 
              variant="secondary"
              onClick={() => handleNumberClick(num)}
              className="h-14 sm:h-16 text-2xl font-semibold shadow-md"
              disabled={loading}
            >
              {num}
            </Button>
          ))}
          <div />
          <Button 
            variant="secondary"
            onClick={() => handleNumberClick(0)} 
            className="h-14 sm:h-16 text-2xl font-semibold shadow-md"
            disabled={loading}
          >
            0
          </Button>
          <Button 
            onClick={handleBackspace} 
            className={`h-14 sm:h-16 ${theme.text} bg-gray-900 hover:bg-gray-800 border border-gray-800`}
            disabled={loading}
          >
            ⌫
          </Button>
        </div>

        <div className="space-y-3 shrink-0 mt-1">
          <Button 
            fullWidth 
            variant="primary"
            onClick={onJoin}
            disabled={lobbyId.length !== 3 || loading}
            className={`h-12 sm:h-14 text-lg ${theme.bg} ${lobbyId.length === 3 ? 'animate-pulse' : 'opacity-50'}`}
          >
            {loading ? 'Connecting...' : 'Enter Session'} <ArrowRight className="ml-2" size={20} />
          </Button>
          
          {description && (
            <div className="text-center text-xs text-gray-500 mt-2">
                {description}
            </div>
          )}

          <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-gray-800"></div>
              <span className="flex-shrink mx-4 text-gray-500 text-[10px] uppercase tracking-widest">Or</span>
              <div className="flex-grow border-t border-gray-800"></div>
          </div>

          <Button 
              fullWidth 
              variant="secondary"
              onClick={onCreate}
              disabled={loading}
              className="h-10 sm:h-12 text-gray-300 border-gray-800 bg-gray-900/50 text-sm"
          >
              <Plus className="mr-2" size={16} /> Create New Session
          </Button>
        </div>
      </div>
    </div>
  );
};