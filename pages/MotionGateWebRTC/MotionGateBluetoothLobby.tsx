
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/Ui/Header';
import { Button } from '../../components/Ui/Button';
import { Bluetooth, Wifi, ArrowRight, Loader2, Smartphone, Search, AlertCircle, HelpCircle } from 'lucide-react';

export const MotionGateBluetoothLobby: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'IDLE' | 'SCANNING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [log, setLog] = useState<string>('');
  const [isSupported, setIsSupported] = useState(false);
  const [generatedId, setGeneratedId] = useState<string | null>(null);

  useEffect(() => {
    // @ts-ignore
    if (navigator.bluetooth) {
      setIsSupported(true);
    } else {
      setLog("Web Bluetooth is not supported on this browser. Try Chrome on Android or Desktop.");
    }
  }, []);

  const generateHostId = () => {
    const id = Math.floor(100 + Math.random() * 900).toString();
    setGeneratedId(id);
    setLog(`Session ID: ${id}`);
  };

  const startScan = async () => {
    setStatus('SCANNING');
    setLog('Scanning for devices...');

    try {
      // @ts-ignore
      const device = await navigator.bluetooth.requestDevice({
        // We filter for devices that might be named with our prefix, 
        // or accept all to allow user to pick a specific renamed device.
        // Note: 'namePrefix' filter requires the device to actually advertise that name.
        // For broader compatibility in this demo, we accept all and check name after.
        acceptAllDevices: true,
        optionalServices: [] // Add services if we were reading characteristics
      });

      if (device && device.name) {
        setLog(`Selected: ${device.name}`);
        
        // Parsing logic: Look for "MG-123" or just "123" in the name
        const match = device.name.match(/MG-(\d{3})/i) || device.name.match(/(\d{3})/);
        
        if (match && match[1]) {
           const lobbyId = match[1];
           setLog(`Found Session ID: ${lobbyId}. Connecting...`);
           setStatus('SUCCESS');
           setTimeout(() => navigate(`/motion-gate-webrtc/game/${lobbyId}`), 1000);
        } else {
           setLog(`Device "${device.name}" does not contain a valid ID format (e.g. MG-123).`);
           setStatus('ERROR');
        }
      } else {
          setLog("Device selected but has no name.");
          setStatus('ERROR');
      }
    } catch (error) {
      console.error(error);
      setLog(String(error));
      setStatus('ERROR');
    }
  };

  const proceedToGame = () => {
      if(generatedId) {
          navigate(`/motion-gate-webrtc/game/${generatedId}`);
      }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center">
      <Header 
        title="Bluetooth + WebRTC"
        icon={<Bluetooth size={18} className="text-blue-400" />}
        onBack={() => navigate('/motion-gate')}
      />

      <div className="w-full max-w-md flex-1 p-6 flex flex-col items-center justify-center space-y-8">
        
        {/* Status Display */}
        <div className="text-center space-y-4">
            <div className={`mx-auto w-24 h-24 rounded-full flex items-center justify-center border-4 transition-all duration-500
                ${status === 'IDLE' ? 'bg-gray-900 border-gray-800 text-gray-600' :
                  status === 'SCANNING' ? 'bg-blue-900/20 border-blue-500 text-blue-400 animate-pulse shadow-[0_0_30px_rgba(59,130,246,0.3)]' :
                  status === 'SUCCESS' ? 'bg-emerald-900/20 border-emerald-500 text-emerald-400 scale-110' :
                  'bg-red-900/20 border-red-500 text-red-400'
                }
            `}>
                {status === 'IDLE' && <Bluetooth size={48} />}
                {status === 'SCANNING' && <Loader2 size={48} className="animate-spin" />}
                {status === 'SUCCESS' && <Wifi size={48} />}
                {status === 'ERROR' && <AlertCircle size={48} />}
            </div>

            <div className="min-h-[4rem]">
                <h2 className="text-xl font-bold text-white mb-2">
                    {status === 'IDLE' ? 'Bluetooth Discovery' : 
                     status === 'SCANNING' ? 'Searching...' :
                     status === 'SUCCESS' ? 'Connected!' : 'Error'}
                </h2>
                <p className={`text-sm max-w-xs mx-auto animate-in fade-in ${status === 'ERROR' ? 'text-red-400' : 'text-gray-400'}`}>
                    {log || "Scan for a generic BLE device named 'MG-XXX' to retrieve the Session ID."}
                </p>
            </div>
        </div>

        {/* Controls */}
        <div className="w-full space-y-4">
            {!isSupported && (
                <div className="p-4 bg-red-900/20 border border-red-800 rounded-xl text-center">
                    <p className="text-red-300 text-sm">Web Bluetooth is not supported on this browser.</p>
                </div>
            )}

            {/* Host Section */}
            {!generatedId ? (
                <button 
                    onClick={generateHostId}
                    className="w-full bg-gray-900 border border-gray-800 p-6 rounded-xl hover:border-indigo-500 transition-all text-left group"
                >
                    <div className="flex items-center gap-4 mb-2">
                        <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg group-hover:bg-indigo-500/20 transition-colors">
                            <Smartphone size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-white">Host Session</h3>
                            <p className="text-xs text-gray-400">Generate ID & Start</p>
                        </div>
                        <ArrowRight className="ml-auto text-gray-600 group-hover:text-indigo-400" />
                    </div>
                </button>
            ) : (
                <div className="w-full bg-gray-900 border border-indigo-500 p-6 rounded-xl text-left animate-in zoom-in-95">
                    <div className="mb-4">
                        <div className="text-xs text-indigo-400 font-bold uppercase tracking-wider mb-1">Active Session ID</div>
                        <div className="text-4xl font-mono font-bold text-white">{generatedId}</div>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-gray-400 bg-black/30 p-3 rounded-lg mb-4">
                        <HelpCircle size={16} className="shrink-0 mt-0.5" />
                        <p>
                           Browser limitation: Phones cannot advertise via Web Bluetooth. 
                           To let others find you via scan, rename a nearby BLE device (e.g. another phone/beacon) to 
                           <span className="text-white font-bold"> MG-{generatedId}</span>.
                        </p>
                    </div>
                    <Button fullWidth onClick={proceedToGame} className="bg-indigo-600 hover:bg-indigo-500">
                        Enter Game <ArrowRight size={16} className="ml-2" />
                    </Button>
                </div>
            )}

            {/* Join Section */}
            <button 
                onClick={startScan}
                disabled={!isSupported || status === 'SCANNING'}
                className="w-full bg-gray-900 border border-gray-800 p-6 rounded-xl hover:border-blue-500 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <div className="flex items-center gap-4 mb-2">
                    <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                        <Search size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-white">Join Session</h3>
                        <p className="text-xs text-gray-400">Scan for "MG-XXX" Device</p>
                    </div>
                    <ArrowRight className="ml-auto text-gray-600 group-hover:text-blue-400" />
                </div>
            </button>
        </div>
        
        <Button 
            variant="secondary" 
            className="text-xs text-gray-500 hover:text-gray-300" 
            onClick={() => navigate('/motion-gate-webrtc/lobby')}
        >
            Switch to Manual Code Entry
        </Button>
      </div>
    </div>
  );
};
