import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Ui/Card';
import { Wrench, ArrowRight } from 'lucide-react';

const Landing: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-indigo-900/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-blue-900/20 rounded-full blur-3xl pointer-events-none" />

      <div className="z-10 max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
            ScoreSync
          </h1>
          <p className="mt-2 text-gray-300">Professional Session Management</p>
        </div>

        <div className="grid gap-4 mt-8">
          <Card onClick={() => navigate('/tools')} className="group relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-500/10 rounded-lg text-indigo-400 group-hover:bg-indigo-500/20 transition-colors">
                  <Wrench size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Tools</h3>
                  <p className="text-sm text-gray-300">Access suite of utilities</p>
                </div>
              </div>
              <ArrowRight className="text-gray-400 group-hover:text-indigo-400 transition-colors transform group-hover:translate-x-1" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Landing;