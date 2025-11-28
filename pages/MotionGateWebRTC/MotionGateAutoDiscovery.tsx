
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/Ui/Header';
import { Button } from '../../components/Ui/Button';
import { Wand2, Wifi, Network, HelpCircle, Loader2, WifiOff } from 'lucide-react';

export const MotionGateAutoDiscovery: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'SCANNING' | 'SUCCESS' | 'ERROR'>('SCANNING');
  const [log, setLog] = useState('Analyzing network configuration...');
  const [manualSubnet, setManualSubnet] = useState('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  // Refs to prevent double-execution
  const hasRun = useRef(false);

  useEffect(() => {
    window.addEventListener('online', () => setIsOffline(false));
    window.addEventListener('offline', () => setIsOffline(true));

    if (!hasRun.current) {
      hasRun.current = true;
      discover();
    }
  }, []);

  const discover = async () => {
    setStatus('SCANNING');
    setLog('Detecting Local IP Subnet...');

    try {
      // 1. Try to get Local IP via WebRTC Candidate Gathering (Works Offline)
      const localIp = await getLocalIP();
      
      if (localIp) {
        processIp(localIp);
      } else {
        throw new Error('Browser concealed Local IP (mDNS).');
      }

    } catch (error) {
      console.warn("Auto-IP detection failed:", error);
      setLog("Could not automatically detect Local IP due to browser privacy settings.");
      setStatus('ERROR');
    }
  };

  /**
   * WebRTC Trick to leak Local IP Address without internet
   * Creates a dummy data channel to trigger ICE candidate gathering.
   */
  const getLocalIP = async (): Promise<string | null> => {
    return new Promise((resolve) => {
        const pc = new RTCPeerConnection({ iceServers: [] }); // No external STUN servers = Offline friendly
        pc.createDataChannel('');
        
        let found = false;

        pc.onicecandidate = (e) => {
            if (!e.candidate || !e.candidate.candidate) return;
            // Regex to find IPv4 pattern
            const result = /([0-9]{1,3}(\.[0-9]{1,3}){3})/.exec(e.candidate.candidate);
            if (result && result[1]) {
                // Ignore localhost
                if (result[1].startsWith('127.')) return;
                
                if (!found) {
                    found = true;
                    resolve(result[1]);
                    pc.close();
                }
            }
        };

        pc.createOffer().then((sdp) => pc.setLocalDescription(sdp));

        // Timeout if mDNS blocks it (common in modern Chrome/Safari)
        setTimeout(() => {
            if (!found) {
                resolve(null);
                pc.close();
            }
        }, 1500);
    });
  };

  const processIp = (ip: string) => {
      // Logic: Devices on same LAN share the same subnet.
      // E.g. 192.168.1.50 and 192.168.1.51
      // We extract the subnet (e.g. "192.168.1") and hash it to a Lobby ID.
      
      const parts = ip.split('.');
      let seed = ip;

      if (parts.length === 4) {
          // Use the first 3 octets as the unique identifier for this LAN
          seed = parts.slice(0, 3).join('.');
          setLog(`Network Detected: ${seed}.x`);
      } else {
          setLog(`IP Detected: ${ip}`);
      }

      // Simple hash to 3-digit code
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
      }
      
      const positiveHash = Math.abs(hash);
      const lobbyId = (positiveHash % 1000).toString().padStart(3, '0');

      setStatus('SUCCESS');
      
      // Auto-redirect
      setTimeout(() => {
        navigate(`/motion-gate-webrtc/game/${lobbyId}`);
      }, 1500);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      let input = manualSubnet.trim();
      
      // If just a number (e.g. "1"), assume it's the 3rd octet of a standard 192.168 network
      if (/^\d+$/.test(input) && input.length <= 3) {
          input = `192.168.${input}.1`;
      } 
      // If partial IP (e.g. "10.0.0"), pad it
      else if (input.split('.').length === 3) {
          input = `${input}.1`;
      }

      processIp(input);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center">
      <Header 
        title="Auto Discovery"
        icon={<Wand2 size={18} className="text-violet-400" />}
        onBack={() => navigate('/motion-gate')}
      />

      <div className="w-full max-w-md flex-1 p-6 flex flex-col items-center justify-center space-y-8">
        
        <div className="text-center space-y-4">
            <div className={`mx-auto w-24 h-24 rounded-full flex items-center justify-center border-4 transition-all duration-500
                ${status === 'SCANNING' ? 'bg-violet-900/20 border-violet-500 text-violet-400 animate-pulse shadow-[0_0_30px_rgba(139,92,246,0.3)]' :
                  status === 'SUCCESS' ? 'bg-emerald-900/20 border-emerald-500 text-emerald-400 scale-110' :
                  'bg-gray-800 border-gray-700 text-gray-500'
                }
            `}>
                {status === 'SCANNING' && <Loader2 size={48} className="animate-spin" />}
                {status === 'SUCCESS' && <Wifi size={48} />}
                {status === 'ERROR' && <Network size={48} />}
            </div>

            <div className="min-h-[4rem]">
                <h2 className="text-xl font-bold text-white mb-2">
                    {status === 'SCANNING' ? 'Scanning LAN...' :
                     status === 'SUCCESS' ? 'Match Found' : 'Auto-Detect Failed'}
                </h2>
                <p className={`text-sm max-w-xs mx-auto animate-in fade-in ${status === 'ERROR' ? 'text-orange-400' : 'text-gray-400'}`}>
                    {log}
                </p>
                {status === 'SUCCESS' && isOffline && (
                    <div className="mt-4 p-2 bg-yellow-900/30 border border-yellow-700/50 rounded-lg flex items-center gap-2 text-xs text-yellow-200 text-left">
                        <WifiOff size={16} className="shrink-0" />
                        <div>
                            <strong>Offline Detected:</strong> Devices will share the Lobby ID, but you must pair them via QR code inside the game.
                        </div>
                    </div>
                )}
            </div>
        </div>

        {status === 'ERROR' && (
             <div className="w-full space-y-6 animate-in slide-in-from-bottom duration-500">
                 <div className="bg-gray-900 p-4 rounded-xl border border-gray-800">
                    <div className="flex items-start gap-3 mb-4">
                        <HelpCircle className="text-violet-400 shrink-0 mt-1" size={20} />
                        <div className="text-xs text-gray-400">
                            Since you know the IP addresses, verify they are on the same subnet (e.g. 192.168.<b>1</b>.x).
                            <br/><br/>
                            Enter the <strong>3rd number</strong> of the IP address below to generate the shared Lobby ID.
                        </div>
                    </div>

                    <form onSubmit={handleManualSubmit} className="flex gap-2">
                        <input 
                            type="text" 
                            placeholder="e.g. 1" 
                            className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-violet-500 outline-none font-mono placeholder:text-gray-700"
                            value={manualSubnet}
                            onChange={(e) => setManualSubnet(e.target.value)}
                            required
                        />
                        <Button type="submit" variant="primary">
                            Connect
                        </Button>
                    </form>
                 </div>

                 <Button fullWidth onClick={() => navigate('/motion-gate-webrtc/lobby')} variant="secondary">
                     Or Enter Lobby Code Manually
                 </Button>
             </div>
        )}

        {status === 'SCANNING' && (
            <div className="text-xs text-gray-600 font-mono">
                Fingerprinting local network configuration...
            </div>
        )}
      </div>
    </div>
  );
};
