import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Header } from '../../components/Ui/Header';
import { Button } from '../../components/Ui/Button';
import { Wifi, ArrowLeft } from 'lucide-react';

const LifePoolMultiGame: React.FC = () => {
  const { lobbyId } = useParams<{ lobbyId: string }>();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <Header 
        title="Life Pool Multi" 
        subtitle={`Lobby: ${lobbyId}`}
        icon={<Wifi size={18} className="text-purple-400" />}
        onBack={() => navigate('/life-pool/lobby')} 
      />
      
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-gray-900/50 p-8 rounded-2xl border border-gray-800 max-w-sm w-full flex flex-col items-center shadow-2xl">
            <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mb-6">
                <Wifi size={32} className="text-purple-400" />
            </div>
            
            <h2 className="text-xl font-bold text-white mb-2">Coming Soon</h2>
            
            <p className="text-gray-400 mb-8 text-sm leading-relaxed">
                Multi-device synchronization for Life Pool is currently in development. 
                Please use Single Device mode for now.
            </p>
            
            <Button 
                fullWidth 
                variant="secondary"
                onClick={() => navigate('/life-pool/single')}
                className="flex items-center justify-center gap-2"
            >
                <ArrowLeft size={16} /> Go to Single Mode
            </Button>
        </div>
      </div>
    </div>
  );
};

export default LifePoolMultiGame;