
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/Ui/Header';
import { Button } from '../../components/Ui/Button';
import { Server, Wifi, AlertTriangle, CheckCircle, ExternalLink, Loader2 } from 'lucide-react';

export const MotionGateLanServer: React.FC = () => {
  const navigate = useNavigate();
  const [ip, setIp] = useState(() => localStorage.getItem('mg_wss_ip') || '192.168.178.101');
  const [port, setPort] = useState(() => localStorage.getItem('mg_wss_port') || '8443');
  const [lobbyId, setLobbyId] = useState(() => localStorage.getItem('mg_wss_lobby') || '123');
  
  const [status, setStatus] = useState<'IDLE' | 'TESTING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [errorMsg, setErrorMsg] = useState('');

  // Save to local storage on change
  useEffect(() => {
    localStorage.setItem('mg_wss_ip', ip);
    localStorage.setItem('mg_wss_port', port);
    localStorage.setItem('mg_wss_lobby', lobbyId);
  }, [ip, port, lobbyId]);

  const getUrl = () => `wss://${ip}:${port}`;
  // Updated to point specifically to the /cert endpoint provided by the server
  const getCertUrl = () => `https://${ip}:${port}/cert`;

  const testConnection = () => {
    setStatus('TESTING');
    setErrorMsg('');

    const ws = new WebSocket(getUrl());
    
    // Set a timeout
    const timeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
            ws.close();
            setStatus('ERROR');
            setErrorMsg('Connection timed out. Did you accept the certificate?');
        }
    }, 5000);

    ws.onopen = () => {
        clearTimeout(timeout);
        setStatus('SUCCESS');
        ws.close();
        // Auto navigate on success after short delay
        setTimeout(() => {
            navigate(`/motion-gate-webrtc/game/${lobbyId}`, { 
                state: { wssUrl: getUrl() } 
            });
        }, 800);
    };

    ws.onerror = () => {
        clearTimeout(timeout);
        setStatus('ERROR');
        // A common error is the self-signed cert rejection
        setErrorMsg('Connection failed. Likely a certificate issue or wrong IP.');
    };
  };

  const openCertLink = () => {
      window.open(getCertUrl(), '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center">
      <Header 
        title="LAN Server"
        icon={<Server size={18} className="text-blue-400" />}
        onBack={() => navigate('/motion-gate')}
      />

      <div className="w-full max-w-md flex-1 p-6 flex flex-col space-y-8">
        
        {/* Connection Status Header */}
        <div className="flex flex-col items-center justify-center space-y-4 py-4">
             <div className={`w-20 h-20 rounded-full flex items-center justify-center border-4 transition-all duration-300 ${
                 status === 'IDLE' ? 'bg-gray-900 border-gray-800 text-gray-500' :
                 status === 'TESTING' ? 'bg-blue-900/20 border-blue-500 text-blue-400 animate-pulse' :
                 status === 'SUCCESS' ? 'bg-emerald-900/20 border-emerald-500 text-emerald-400' :
                 'bg-red-900/20 border-red-500 text-red-400'
             }`}>
                 {status === 'IDLE' && <Wifi size={32} />}
                 {status === 'TESTING' && <Loader2 size={32} className="animate-spin" />}
                 {status === 'SUCCESS' && <CheckCircle size={32} />}
                 {status === 'ERROR' && <AlertTriangle size={32} />}
             </div>
             
             <div className="text-center">
                 <h2 className="text-white font-bold text-lg">
                    {status === 'SUCCESS' ? 'Server Found' : 'Server Configuration'}
                 </h2>
                 <p className="text-xs text-gray-400">
                     {status === 'ERROR' ? errorMsg : 'Enter details of your Sprint Timing Server.'}
                 </p>
             </div>
        </div>

        {/* Form */}
        <div className="space-y-4">
            <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Server IP Address</label>
                <input 
                    type="text" 
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                    placeholder="192.168.178.101"
                    className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-white font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Port</label>
                    <input 
                        type="text" 
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        placeholder="8443"
                        className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-white font-mono focus:border-blue-500 outline-none"
                    />
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Lobby ID</label>
                    <input 
                        type="text" 
                        value={lobbyId}
                        onChange={(e) => setLobbyId(e.target.value)}
                        placeholder="123"
                        className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-white font-mono focus:border-blue-500 outline-none"
                    />
                </div>
            </div>

            {/* Certificate Warning/Action */}
            <div className="p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg flex items-start gap-3">
                <AlertTriangle size={16} className="text-yellow-500 shrink-0 mt-0.5" />
                <div className="text-xs text-gray-400">
                    <p className="mb-2"><strong>Security Warning:</strong> Local servers use self-signed certificates. You must verify and accept the certificate in your browser once.</p>
                    <button 
                        onClick={openCertLink}
                        className="text-yellow-400 underline hover:text-yellow-300 font-bold flex items-center gap-1"
                    >
                        Open Certificate Page <ExternalLink size={10} />
                    </button>
                    <p className="mt-1 text-[10px] opacity-70">Click "Advanced" {'>'} "Proceed to..." if prompted.</p>
                </div>
            </div>
        </div>

        <div className="flex-1" />

        <Button 
            fullWidth 
            onClick={testConnection} 
            disabled={status === 'TESTING'}
            className={status === 'SUCCESS' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-blue-600 hover:bg-blue-500'}
        >
            {status === 'TESTING' ? 'Connecting...' : status === 'SUCCESS' ? 'Enter Game' : 'Connect & Save'}
        </Button>

      </div>
    </div>
  );
};
