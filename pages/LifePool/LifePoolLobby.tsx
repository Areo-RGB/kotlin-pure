import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { initMotionGateSession } from '../../services/firebase';
import { LobbyScreen } from '../../components/Ui/LobbyScreen';
import { Wifi } from 'lucide-react';

const LifePoolLobby: React.FC = () => {
  const [lobbyId, setLobbyId] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const initWithTimeout = (id: string) => {
    const timeout = new Promise<void>((_, reject) => 
      setTimeout(() => reject(new Error("Connection timeout")), 2000)
    );
    return Promise.race([initMotionGateSession(id), timeout]);
  };

  const handleEnter = async () => {
    if (lobbyId.length !== 3) return;
    setLoading(true);
    try {
      await initWithTimeout(lobbyId);
    } catch (error) {
      console.warn("Could not verify lobby (likely offline). Proceeding locally.", error);
    }
    setLoading(false);
    navigate(`/life-pool/game/${lobbyId}`);
  };

  const handleCreateSession = async () => {
    setLoading(true);
    const randomId = Math.floor(100 + Math.random() * 900).toString();
    try {
      await initWithTimeout(randomId);
    } catch (error) {
      console.warn("Proceeding locally.", error);
    }
    setLoading(false);
    navigate(`/life-pool/game/${randomId}`);
  };

  return (
    <LobbyScreen
      title="Life Pool Lobby"
      icon={<Wifi size={16} />}
      lobbyId={lobbyId}
      setLobbyId={setLobbyId}
      onJoin={handleEnter}
      onCreate={handleCreateSession}
      onBack={() => navigate('/life-pool')}
      loading={loading}
      color="pink"
      description="Connects multiple cameras/displays via WebRTC."
    />
  );
};

export default LifePoolLobby;