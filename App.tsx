
import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Tools from './pages/Tools';
import AndersonLobby from './pages/Anderson/AndersonLobby';
import AndersonGame from './pages/Anderson/AndersonGame';
import Detection from './pages/Detection';
import MotionGateMenu from './pages/MotionGate/MotionGateMenu';
import MotionGateLobby from './pages/MotionGate/MotionGateLobby';
import MotionGateGame from './pages/MotionGate/MotionGateGame';
import MotionGateWebRTCLobby from './pages/MotionGateWebRTC/MotionGateWebRTCLobby';
import MotionGateWebRTCGame from './pages/MotionGateWebRTC/MotionGateWebRTCGame';
import MotionGateOffline from './pages/MotionGateWebRTC/MotionGateOffline';
import { MotionGateNFCLobby } from './pages/MotionGateWebRTC/MotionGateNFCLobby';
import { MotionGateBluetoothLobby } from './pages/MotionGateWebRTC/MotionGateBluetoothLobby';
import { MotionGateAutoDiscovery } from './pages/MotionGateWebRTC/MotionGateAutoDiscovery';
import { MotionGateLanServer } from './pages/MotionGateWebRTC/MotionGateLanServer';
import BodyPose from './pages/BodyPose';
import YoYoTest from './pages/YoYo/YoYoTest';
import SprintDuels from './pages/SprintDuels/SprintDuels';
import LifePool from './pages/LifePool';
import LifePoolSingle from './pages/LifePool/LifePoolSingle';
import LifePoolLobby from './pages/LifePool/LifePoolLobby';
import LifePoolMultiGame from './pages/LifePool/LifePoolMultiGame';
import MotionCounter from './pages/MotionCounter';

const App: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/detection" element={<Detection />} />
        <Route path="/body-pose" element={<BodyPose />} />
        <Route path="/yoyo" element={<YoYoTest />} />
        <Route path="/sprint-duels" element={<SprintDuels />} />
        
        {/* Life Pool Routes */}
        <Route path="/life-pool" element={<LifePool />} />
        <Route path="/life-pool/single" element={<LifePoolSingle />} />
        <Route path="/life-pool/lobby" element={<LifePoolLobby />} />
        <Route path="/life-pool/game/:lobbyId" element={<LifePoolMultiGame />} />
        
        {/* Standalone Tools */}
        <Route path="/motion-counter" element={<MotionCounter />} />
        
        {/* Anderson Routes */}
        <Route path="/anderson/lobby" element={<AndersonLobby />} />
        <Route path="/anderson/game/:lobbyId" element={<AndersonGame />} />

        {/* Motion Gate Routes */}
        <Route path="/motion-gate" element={<MotionGateMenu />} />
        
        {/* Motion Gate Multi-Device Cloud Routes */}
        <Route path="/motion-gate/lobby" element={<MotionGateLobby />} />
        <Route path="/motion-gate/game/:lobbyId" element={<MotionGateGame />} />

        {/* Motion Gate WebRTC Routes */}
        <Route path="/motion-gate-webrtc/lobby" element={<MotionGateWebRTCLobby />} />
        <Route path="/motion-gate-webrtc/auto" element={<MotionGateAutoDiscovery />} />
        <Route path="/motion-gate-webrtc/lan" element={<MotionGateLanServer />} />
        <Route path="/motion-gate-webrtc/game/:lobbyId" element={<MotionGateWebRTCGame />} />

        {/* Motion Gate NFC Routes */}
        <Route path="/motion-gate-nfc/lobby" element={<MotionGateNFCLobby />} />

        {/* Motion Gate Bluetooth Routes */}
        <Route path="/motion-gate-bluetooth/lobby" element={<MotionGateBluetoothLobby />} />

        {/* Motion Gate Offline Routes */}
        <Route path="/motion-gate-offline" element={<MotionGateOffline />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
