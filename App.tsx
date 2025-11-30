
import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';

// Eager load only the landing page for fastest initial load
import Landing from './pages/Landing';

// Lazy load all other pages for code-splitting
const Tools = lazy(() => import('./pages/Tools'));
const Detection = lazy(() => import('./pages/Detection'));
const MotionGateMenu = lazy(() => import('./pages/MotionGate/MotionGateMenu'));
const MotionGateLobby = lazy(() => import('./pages/MotionGate/MotionGateLobby'));
const MotionGateGame = lazy(() => import('./pages/MotionGate/MotionGateGame'));
const MotionGateWebRTCLobby = lazy(() => import('./pages/MotionGateWebRTC/MotionGateWebRTCLobby'));
const MotionGateWebRTCGame = lazy(() => import('./pages/MotionGateWebRTC/MotionGateWebRTCGame'));
const MotionGateOffline = lazy(() => import('./pages/MotionGateWebRTC/MotionGateOffline'));
const MotionGateLanServerNative = lazy(() => import('./pages/MotionGateWebRTC/MotionGateLanServerNative').then(m => ({ default: m.MotionGateLanServerNative })));
const BodyPose = lazy(() => import('./pages/BodyPose'));
const YoYoTest = lazy(() => import('./pages/YoYo/YoYoTest'));
const SprintDuels = lazy(() => import('./pages/SprintDuels/SprintDuels'));
const LifePool = lazy(() => import('./pages/LifePool'));
const LifePoolSingle = lazy(() => import('./pages/LifePool/LifePoolSingle'));
const LifePoolLobby = lazy(() => import('./pages/LifePool/LifePoolLobby'));
const LifePoolMultiGame = lazy(() => import('./pages/LifePool/LifePoolMultiGame'));
const MotionCounter = lazy(() => import('./pages/MotionCounter'));

// Loading fallback component
const LoadingFallback = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    fontSize: '18px',
    color: '#666'
  }}>
    Loading...
  </div>
);

const App: React.FC = () => {
  return (
    <HashRouter>
      <Suspense fallback={<LoadingFallback />}>
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


          {/* Motion Gate Routes */}
          <Route path="/motion-gate" element={<MotionGateMenu />} />

          {/* Motion Gate Multi-Device Cloud Routes */}
          <Route path="/motion-gate/lobby" element={<MotionGateLobby />} />
          <Route path="/motion-gate/game/:lobbyId" element={<MotionGateGame />} />

          {/* Motion Gate WebRTC Routes */}
          <Route path="/motion-gate-webrtc/lobby" element={<MotionGateWebRTCLobby />} />
          <Route path="/motion-gate-webrtc/lan-native" element={<MotionGateLanServerNative />} />
          <Route path="/motion-gate-webrtc/game/:lobbyId" element={<MotionGateWebRTCGame />} />

          {/* Motion Gate Offline Routes */}
          <Route path="/motion-gate-offline" element={<MotionGateOffline />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
};

export default App;
