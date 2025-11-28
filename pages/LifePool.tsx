import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Smartphone, Wifi } from 'lucide-react';
import { MenuCard } from '../components/Ui/MenuCard';
import { Header } from '../components/Ui/Header';

const LifePool: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center">
      <div className="w-full max-w-md">
        <Header 
          title="Life Pool" 
          subtitle="Select mode"
          onBack={() => navigate('/tools')} 
        />

        <div className="space-y-4 p-4">
          <MenuCard 
            title="Single Device" 
            description="Use this device as a standalone motion-activated time bank."
            icon={<Smartphone size={24} />}
            colorClass="bg-pink-500"
            tags={['Local', 'Simple']}
            onClick={() => navigate('/life-pool/single')}
          />

          <MenuCard 
            title="Multi-Device" 
            description="Connect multiple devices. Assign 'Game' roles to cameras and 'Display' roles to monitors."
            icon={<Wifi size={24} />}
            colorClass="bg-purple-500"
            tags={['WebRTC', 'Split Screen', 'Multi-Camera']}
            onClick={() => navigate('/life-pool/lobby')}
          />
        </div>
      </div>
    </div>
  );
};

export default LifePool;