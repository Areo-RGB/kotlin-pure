
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Network, Wifi, QrCode, Wand2, Server } from 'lucide-react';
import { MenuCard } from '../../components/Ui/MenuCard';
import { Header } from '../../components/Ui/Header';

const MotionGateMenu: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center">
      <div className="w-full max-w-md">
        <Header 
          title="Motion Gate" 
          subtitle="Select operation mode"
          onBack={() => navigate('/tools')} 
        />

        <div className="space-y-4 p-4">
          <MenuCard 
            title="LAN Server (WSS)" 
            description="Connect via your local Secure WebSocket server. Best for offline LAN with a dedicated server device."
            icon={<Server size={24} />}
            colorClass="bg-blue-500"
            tags={['Offline', 'Low Latency', 'Secure']}
            onClick={() => navigate('/motion-gate-webrtc/lan')}
          />

          <MenuCard 
            title="Auto-Discover (IP)" 
            description="Uses IP subnet matching to guess a shared Lobby ID. No server required, but needs QR to pair if offline."
            icon={<Wand2 size={24} />}
            colorClass="bg-violet-500"
            tags={['Magic', 'No Server', 'LAN']}
            onClick={() => navigate('/motion-gate-webrtc/auto')}
          />

          <MenuCard 
            title="Manual WebRTC" 
            description="Manually enter a Lobby ID. Supports both Cloud signaling and Offline QR bridging."
            icon={<Wifi size={24} />}
            colorClass="bg-cyan-500"
            tags={['Wi-Fi', 'Hybrid']}
            onClick={() => navigate('/motion-gate-webrtc/lobby')}
          />

          <MenuCard 
            title="Offline P2P (QR)" 
            description="Pure offline mode. Connect two devices purely by scanning QR codes. No Lobby ID needed."
            icon={<QrCode size={24} />}
            colorClass="bg-emerald-500"
            tags={['Air-Gapped', 'Secure']}
            onClick={() => navigate('/motion-gate-offline')}
          />
          
          <MenuCard 
            title="Multi-Device (Cloud)" 
            description="Synchronize multiple devices via the internet (Firebase). Reliable for remote setups."
            icon={<Network size={24} />}
            colorClass="bg-indigo-500"
            tags={['Internet Required', 'Firebase']}
            onClick={() => navigate('/motion-gate/lobby')}
          />

          <MenuCard 
            title="Single Device" 
            description="Uses the camera of this device as a standalone tripwire stopwatch."
            icon={<Eye size={24} />}
            colorClass="bg-red-500"
            tags={['Local', 'Offline', 'Simple']}
            onClick={() => navigate('/detection')}
          />
        </div>
      </div>
    </div>
  );
};

export default MotionGateMenu;
