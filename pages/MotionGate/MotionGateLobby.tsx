import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { joinLobby } from '../../services/firebase';
import { LobbyScreen } from '../../components/Ui/LobbyScreen';

const MotionGateLobby: React.FC = () => {
  const [lobbyId, setLobbyId] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const joinWithTimeout = (id: string) => {
    const timeout = new Promise<boolean>((_, reject) => 
      setTimeout(() => reject(new Error("Connection timeout")), 2000)
    );
    return Promise.race([joinLobby(id), timeout]);
  };

  const handleEnter = async () => {
    if (lobbyId.length !== 3) return;
    setLoading(true);
    try {
      await joinWithTimeout(lobbyId);
    } catch (error) {
      console.warn("Could not verify lobby (likely offline). Proceeding locally.", error);
    }
    setLoading(false);
    navigate(`/motion-gate/game/${lobbyId}`);
  };

  const handleCreateSession = async () => {
    setLoading(true);
    const randomId = Math.floor(100 + Math.random() * 900).toString();
    try {
      await joinWithTimeout(randomId);
    } catch (error) {
      console.warn("Proceeding locally.", error);
    }
    setLoading(false);
    navigate(`/motion-gate/game/${randomId}`);
  };

  return (
    <LobbyScreen
      title="Multi-Device Gate"
      lobbyId={lobbyId}
      setLobbyId={setLobbyId}
      onJoin={handleEnter}
      onCreate={handleCreateSession}
      onBack={() => navigate('/tools')}
      loading={loading}
      color="red"
      description="Syncs Start & Finish devices via cloud."
    />
  );
};

export default MotionGateLobby;