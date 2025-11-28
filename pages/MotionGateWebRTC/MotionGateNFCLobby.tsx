
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/Ui/Header';
import { Button } from '../../components/Ui/Button';
import { Nfc, Wifi, ArrowRight, Loader2, Smartphone, Scan, AlertCircle, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const MotionGateNFCLobby: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'IDLE' | 'SCANNING' | 'WRITING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [log, setLog] = useState<string>('');
  const [hasNFC, setHasNFC] = useState(false);
  const [isIframe, setIsIframe] = useState(false);

  useEffect(() => {
    // Check if running in iframe (Web NFC security restriction)
    try {
      if (window.self !== window.top) {
        setIsIframe(true);
        setLog("NFC requires a top-level browsing context. Please open in a full browser tab.");
      }
    } catch (e) {
      setIsIframe(true);
    }

    if ('NDEFReader' in window) {
      setHasNFC(true);
    } else {
      if (!isIframe) {
         setLog("Web NFC is not supported on this device or browser. Use Chrome on Android.");
      }
    }
  }, []);

  const openInNewTab = () => {
    window.open(window.location.href, '_blank');
  };

  const startHost = async () => {
    if (!hasNFC) return;
    const lobbyId = Math.floor(100 + Math.random() * 900).toString();
    setStatus('WRITING');
    setLog('Tap an NFC tag to write session ID...');

    try {
      // @ts-ignore
      const ndef = new NDEFReader();
      await ndef.write({
        records: [{ recordType: "text", data: lobbyId }]
      });
      setLog(`Success! Written ID: ${lobbyId}`);
      setStatus('SUCCESS');
      setTimeout(() => navigate(`/motion-gate-webrtc/game/${lobbyId}`), 1000);
    } catch (error) {
      console.error(error);
      const msg = String(error);
      if (msg.includes("top-level")) {
        setLog("Error: App is running inside a preview frame. Open in new tab.");
        setIsIframe(true);
      } else {
        setLog(`Write failed: ${msg}`);
      }
      setStatus('ERROR');
    }
  };

  const startJoin = async () => {
    if (!hasNFC) return;
    setStatus('SCANNING');
    setLog('Tap the NFC tag to read session ID...');

    try {
      // @ts-ignore
      const ndef = new NDEFReader();
      await ndef.scan();
      // @ts-ignore
      ndef.onreading = (event: any) => {
        const textDecoder = new TextDecoder();
        for (const record of event.message.records) {
          if (record.recordType === "text") {
            const text = textDecoder.decode(record.data);
            // Basic validation for 3 digit code
            if (text.length === 3 && !isNaN(Number(text))) {
               setLog(`Found ID: ${text}. Joining...`);
               setStatus('SUCCESS');
               setTimeout(() => navigate(`/motion-gate-webrtc/game/${text}`), 500);
               return;
            }
          }
        }
        setLog("Tag scanned, but no valid session ID found.");
        setStatus('ERROR');
      };
      // @ts-ignore
      ndef.onreadingerror = () => {
         setLog("Error reading tag. Please try again.");
         setStatus('ERROR');
      }
    } catch (error) {
      console.error(error);
      const msg = String(error);
      if (msg.includes("top-level")) {
        setLog("Error: App is running inside a preview frame. Open in new tab.");
        setIsIframe(true);
      } else {
        setLog(`Scan failed: ${msg}`);
      }
      setStatus('ERROR');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center">
      <Header 
        title="NFC + WebRTC"
        icon={<Nfc size={18} className="text-cyan-400" />}
        onBack={() => navigate('/motion-gate')}
      />

      <div className="w-full max-w-md flex-1 p-6 flex flex-col items-center justify-center space-y-8">
        
        {/* Status Display */}
        <div className="text-center space-y-4">
            <div className={`mx-auto w-24 h-24 rounded-full flex items-center justify-center border-4 transition-all duration-500
                ${status === 'IDLE' ? 'bg-gray-900 border-gray-800 text-gray-600' :
                  status === 'SCANNING' || status === 'WRITING' ? 'bg-cyan-900/20 border-cyan-500 text-cyan-400 animate-pulse shadow-[0_0_30px_rgba(6,182,212,0.3)]' :
                  status === 'SUCCESS' ? 'bg-emerald-900/20 border-emerald-500 text-emerald-400 scale-110' :
                  'bg-red-900/20 border-red-500 text-red-400'
                }
            `}>
                {status === 'IDLE' && <Nfc size={48} />}
                {(status === 'SCANNING' || status === 'WRITING') && <Loader2 size={48} className="animate-spin" />}
                {status === 'SUCCESS' && <Wifi size={48} />}
                {status === 'ERROR' && <AlertCircle size={48} />}
            </div>

            <div className="min-h-[4rem]">
                <h2 className="text-xl font-bold text-white mb-2">
                    {status === 'IDLE' ? 'Tap to Connect' : 
                     status === 'WRITING' ? 'Ready to Write' :
                     status === 'SCANNING' ? 'Ready to Scan' :
                     status === 'SUCCESS' ? 'Connected!' : 'Error'}
                </h2>
                <p className={`text-sm max-w-xs mx-auto animate-in fade-in ${status === 'ERROR' ? 'text-red-400' : 'text-gray-400'}`}>
                    {log || "Use an NFC tag to instantly pair devices via WebRTC."}
                </p>
            </div>
        </div>

        {/* Controls */}
        <div className="w-full space-y-4">
            {!hasNFC && !isIframe && (
                <div className="p-4 bg-red-900/20 border border-red-800 rounded-xl text-center">
                    <p className="text-red-300 text-sm">NFC not supported on this browser.</p>
                </div>
            )}

            {isIframe && (
                 <Button 
                    variant="primary" 
                    fullWidth
                    onClick={openInNewTab}
                    className="bg-yellow-600 hover:bg-yellow-500 text-white border-none"
                 >
                    <ExternalLink className="mr-2" size={20} /> Open in New Tab
                 </Button>
            )}

            <button 
                onClick={startHost}
                disabled={!hasNFC || status === 'WRITING' || status === 'SCANNING' || isIframe}
                className="w-full bg-gray-900 border border-gray-800 p-6 rounded-xl hover:border-cyan-500 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <div className="flex items-center gap-4 mb-2">
                    <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-lg group-hover:bg-cyan-500/20 transition-colors">
                        <Smartphone size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-white">Host Session</h3>
                        <p className="text-xs text-gray-400">Write ID to NFC Tag</p>
                    </div>
                    <ArrowRight className="ml-auto text-gray-600 group-hover:text-cyan-400" />
                </div>
            </button>

            <button 
                onClick={startJoin}
                disabled={!hasNFC || status === 'WRITING' || status === 'SCANNING' || isIframe}
                className="w-full bg-gray-900 border border-gray-800 p-6 rounded-xl hover:border-emerald-500 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <div className="flex items-center gap-4 mb-2">
                    <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                        <Scan size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-white">Join Session</h3>
                        <p className="text-xs text-gray-400">Read ID from NFC Tag</p>
                    </div>
                    <ArrowRight className="ml-auto text-gray-600 group-hover:text-emerald-400" />
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
