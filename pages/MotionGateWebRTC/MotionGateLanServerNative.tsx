import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/Ui/Header';
import { Button } from '../../components/Ui/Button';
import { Server, Wifi, AlertTriangle, CheckCircle, Smartphone, Loader2, QrCode } from 'lucide-react';

// Type definitions for our native plugins
// Helper to safely access plugins
const getPlugins = () => {
  if (typeof (window as any).Capacitor !== 'undefined') {
    return (window as any).Capacitor.Plugins;
  }
  return {
    SignalingServer: null,
    Discovery: null,
    ForegroundService: null
  };
};

export const MotionGateLanServerNative: React.FC = () => {
  const navigate = useNavigate();
  const [ip, setIp] = useState(() => localStorage.getItem('mg_wss_ip') || 'localhost');
  const [port, setPort] = useState(() => localStorage.getItem('mg_wss_port') || '8080');
  const [lobbyId, setLobbyId] = useState(() => localStorage.getItem('mg_wss_lobby') || '123');

  const [status, setStatus] = useState<'IDLE' | 'TESTING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [errorMsg, setErrorMsg] = useState('');

  // Native app specific states
  const [isNativeApp, setIsNativeApp] = useState(false);
  const [isHosting, setIsHosting] = useState(false);
  const [localIP, setLocalIP] = useState('');
  const [discoveredHosts, setDiscoveredHosts] = useState<Array<{ name: string; ip: string; port: number }>>([]);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    // Detect if running in Capacitor WebView
    const isCapacitor = typeof (window as any).Capacitor !== 'undefined';
    setIsNativeApp(isCapacitor);

    if (isCapacitor) {
      const { Discovery } = getPlugins();

      // Get local IP on mount
      Discovery?.getLocalIP().then((result: any) => {
        setLocalIP(result.ip);
      }).catch(() => { });

      // Listen for discovered hosts
      Discovery?.addListener('hostDiscovered', (event: any) => {
        setDiscoveredHosts(prev => {
          const exists = prev.find(h => h.name === event.name);
          if (exists) return prev;
          return [...prev, event];
        });
      });

      Discovery?.addListener('hostLost', (event: any) => {
        setDiscoveredHosts(prev => prev.filter(h => h.name !== event.name));
      });
    }

    return () => {
      if (typeof (window as any).Capacitor !== 'undefined') {
        const { Discovery } = getPlugins();
        Discovery?.removeAllListeners();
      }
    };
  }, []);

  // Save to local storage on change
  useEffect(() => {
    localStorage.setItem('mg_wss_ip', ip);
    localStorage.setItem('mg_wss_port', port);
    localStorage.setItem('mg_wss_lobby', lobbyId);
  }, [ip, port, lobbyId]);

  const startHosting = async () => {
    try {
      setStatus('TESTING');

      // Start the Node.js server
      const { SignalingServer, Discovery } = getPlugins();
      await SignalingServer.startServer();

      // Start mDNS broadcast
      await Discovery.startBroadcast({
        serviceName: `SprintTiming-${lobbyId}`,
        port: 8080
      });

      setIsHosting(true);
      setIp('localhost');
      setPort('8080');
      setStatus('SUCCESS');

      setTimeout(() => {
        navigate(`/motion-gate-webrtc/game/${lobbyId}`, {
          state: {
            wssUrl: `ws://localhost:8080`,
            isHost: true
          }
        });
      }, 800);

    } catch (error: any) {
      setStatus('ERROR');
      setErrorMsg(`Failed to start server: ${error.message}`);
    }
  };

  const stopHosting = async () => {
    try {
      const { SignalingServer, Discovery } = getPlugins();
      await Discovery.stopBroadcast();
      await SignalingServer.stopServer();
      setIsHosting(false);
      setIp('');
      setStatus('IDLE');
    } catch (error) {
      console.error('Failed to stop hosting:', error);
    }
  };

  const startScanning = async () => {
    try {
      setScanning(true);
      setDiscoveredHosts([]);
      const { Discovery } = getPlugins();
      await Discovery.scanForHosts();
    } catch (error: any) {
      setErrorMsg(`Scan failed: ${error.message}`);
      setScanning(false);
    }
  };

  const stopScanning = async () => {
    try {
      const { Discovery } = getPlugins();
      await Discovery.stopScan();
      setScanning(false);
    } catch (error) {
      console.error('Failed to stop scan:', error);
    }
  };


  const connectToHost = (host: { name: string; ip: string; port: number }) => {
    setIp(host.ip);
    setPort(host.port.toString());
    stopScanning();
    testConnection();
  };

  const getUrl = () => `ws://${ip}:${port}`;

  const testConnection = () => {
    setStatus('TESTING');
    setErrorMsg('');

    const ws = new WebSocket(getUrl());

    const timeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        setStatus('ERROR');
        setErrorMsg('Connection timed out.');
      }
    }, 5000);

    ws.onopen = () => {
      clearTimeout(timeout);
      setStatus('SUCCESS');
      ws.close();
      setTimeout(() => {
        navigate(`/motion-gate-webrtc/game/${lobbyId}`, {
          state: { wssUrl: getUrl() }
        });
      }, 800);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      setStatus('ERROR');
      setErrorMsg('Connection failed. Check IP and port.');
    };
  };

  // Render native Android UI
  if (isNativeApp) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center">
        <Header
          title="LAN Server (Native)"
          icon={<Smartphone size={18} className="text-blue-400" />}
          onBack={() => navigate('/motion-gate')}
        />

        <div className="w-full max-w-md flex-1 p-6 flex flex-col space-y-6">

          {/* Status Display */}
          <div className="flex flex-col items-center justify-center space-y-4 py-4">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center border-4 transition-all duration-300 ${status === 'IDLE' ? 'bg-gray-900 border-gray-800 text-gray-500' :
              status === 'TESTING' ? 'bg-blue-900/20 border-blue-500 text-blue-400 animate-pulse' :
                status === 'SUCCESS' ? 'bg-emerald-900/20 border-emerald-500 text-emerald-400' :
                  'bg-red-900/20 border-red-500 text-red-400'
              }`}>
              {status === 'IDLE' && <Wifi size={32} />}
              {status === 'TESTING' && <Loader2 size={32} className="animate-spin" />}
              {status === 'SUCCESS' && <CheckCircle size={32} />}
              {status === 'ERROR' && <AlertTriangle size={32} />}
            </div>

            {localIP && (
              <div className="text-center">
                <p className="text-xs text-gray-400">Your IP:</p>
                <p className="text-white font-mono text-sm">{localIP}</p>
              </div>
            )}
          </div>

          {/* Host Mode */}
          {!isHosting && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                  <Server size={16} className="text-blue-400" />
                  Host a Session
                </h3>
                <p className="text-xs text-gray-400 mb-3">
                  Start the signaling server on this device. Other devices can connect to: <span className="text-white font-mono">{localIP}:8080</span>
                </p>
                <div className="mb-3">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Lobby ID</label>
                  <input
                    type="text"
                    value={lobbyId}
                    onChange={(e) => setLobbyId(e.target.value)}
                    placeholder="123"
                    className="w-full bg-gray-900 border border-gray-800 rounded-lg p-2 text-white font-mono focus:border-blue-500 outline-none"
                  />
                </div>
                <Button
                  fullWidth
                  onClick={startHosting}
                  disabled={status === 'TESTING'}
                  className="bg-blue-600 hover:bg-blue-500"
                >
                  Start Server & Host
                </Button>
              </div>

              {/* Scan for Hosts */}
              <div className="p-4 bg-green-900/20 border border-green-700/50 rounded-lg">
                <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                  <Wifi size={16} className="text-green-400" />
                  Join a Session
                </h3>
                <p className="text-xs text-gray-400 mb-3">
                  Scan for nearby servers or enter connection details manually.
                </p>

                {!scanning ? (
                  <Button
                    fullWidth
                    onClick={startScanning}
                    className="bg-green-600 hover:bg-green-500"
                  >
                    Scan for Hosts
                  </Button>
                ) : (
                  <>
                    <Button
                      fullWidth
                      onClick={stopScanning}
                      className="bg-red-600 hover:bg-red-500 mb-3"
                    >
                      Stop Scanning
                    </Button>

                    {discoveredHosts.length === 0 ? (
                      <div className="text-center py-4">
                        <Loader2 size={24} className="animate-spin text-green-400 mx-auto mb-2" />
                        <p className="text-xs text-gray-400">Searching for hosts...</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {discoveredHosts.map((host, idx) => (
                          <div
                            key={idx}
                            onClick={() => connectToHost(host)}
                            className="p-3 bg-gray-900 border border-gray-800 rounded-lg cursor-pointer hover:border-green-500 transition-colors"
                          >
                            <p className="text-white font-bold text-sm">{host.name}</p>
                            <p className="text-xs text-gray-400 font-mono">{host.ip}:{host.port}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Manual Entry */}
              <div className="p-4 bg-gray-900/50 border border-gray-800 rounded-lg">
                <h3 className="text-white font-bold mb-2 text-sm">Manual Connection</h3>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                    placeholder="Server IP"
                    className="w-full bg-gray-900 border border-gray-800 rounded-lg p-2 text-white font-mono text-sm focus:border-blue-500 outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      placeholder="Port"
                      className="w-full bg-gray-900 border border-gray-800 rounded-lg p-2 text-white font-mono text-sm focus:border-blue-500 outline-none"
                    />
                    <input
                      type="text"
                      value={lobbyId}
                      onChange={(e) => setLobbyId(e.target.value)}
                      placeholder="Lobby"
                      className="w-full bg-gray-900 border border-gray-800 rounded-lg p-2 text-white font-mono text-sm focus:border-blue-500 outline-none"
                    />
                  </div>
                  <Button
                    fullWidth
                    onClick={testConnection}
                    disabled={status === 'TESTING'}
                    className="bg-gray-700 hover:bg-gray-600 text-sm"
                  >
                    Connect Manually
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Hosting Active */}
          {isHosting && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-900/20 border border-emerald-700/50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-bold flex items-center gap-2">
                    <CheckCircle size={16} className="text-emerald-400" />
                    Server Running
                  </h3>
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                </div>

                <div className="space-y-2 mb-4">
                  <div>
                    <p className="text-xs text-gray-400">Server Address:</p>
                    <p className="text-white font-mono text-sm">{localIP}:8080</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Lobby ID:</p>
                    <p className="text-white font-mono text-sm">{lobbyId}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    fullWidth
                    onClick={stopHosting}
                    className="bg-red-600 hover:bg-red-500"
                  >
                    Stop Server
                  </Button>
                  <Button
                    fullWidth
                    onClick={() => navigate(`/motion-gate-webrtc/game/${lobbyId}`, { state: { wssUrl: `ws://localhost:8080` } })}
                    className="bg-emerald-600 hover:bg-emerald-500"
                  >
                    Enter Game
                  </Button>
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-900/20 border border-red-700/50 rounded-lg">
              <p className="text-xs text-red-400">{errorMsg}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback to original web UI (not shown for brevity - would be the original component)
  return null;
};
