
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Network, Wifi, QrCode, Wand2, Server, Smartphone } from 'lucide-react';
import { MenuCard } from '../../components/Ui/MenuCard';
import { Header } from '../../components/Ui/Header';

const MotionGateMenu: React.FC = () => {
  const navigate = useNavigate();

  // Check if running in Capacitor at runtime (avoids build dependency)
  const isNativeApp = typeof (window as any).Capacitor !== 'undefined';

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center">
      <div className="w-full max-w-md">
        <Header
          title="Motion Gate"
          subtitle="Select operation mode"
          onBack={() => navigate('/tools')}
        />

        <div className="space-y-4 p-4">
          {/* Native Android Server - Only show if running in Capacitor */}
          {isNativeApp && (
            <MenuCard
              title="Native LAN Server 🔥"
              description="Run a native WebSocket signaling server on THIS device. Other devices connect directly via WiFi. No Firebase needed!"
              icon={<Smartphone size={24} />}
              colorClass="bg-gradient-to-r from-orange-500 to-red-500"
              tags={['Android', 'True Offline', 'No Internet']}
              onClick={() => navigate('/motion-gate-webrtc/lan-native')}
            />
          )}



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
