
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
    db,
    getServerTime
} from '../../services/firebase';
import { ref, onChildAdded, set, remove, onValue, update, onDisconnect, push } from 'firebase/database';
import { Button } from '../../components/Ui/Button';
import { ChevronLeft, RefreshCw, Settings, Smartphone, Square, Play, Sliders, Zap, ChevronDown, WifiOff, QrCode, Scan, Loader2, CheckCircle, Server } from 'lucide-react';
import { MotionTripwire } from '../../components/MotionTripwire';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionGateRole } from '../../types';

// --- Globals (from index.html) ---
declare const pako: any;
declare const QRCode: any;
declare const jsQR: any;

// --- Types ---
interface WebRTCPeer {
    id: string;
    name: string;
    role: MotionGateRole;
    lastSeen: number;
    connectionState: RTCPeerConnectionState;
    dataChannelState: RTCDataChannelState;
    isManual?: boolean; // True if connected via QR/Offline
}

// --- QR Constants ---
const CHUNK_SIZE = 1500;
const ROTATION_INTERVAL = 700;

const MotionGateWebRTCGame: React.FC = () => {
    const { lobbyId } = useParams<{ lobbyId: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    // Check if we came from the LAN Server page with a specific WSS URL
    const wssUrl = location.state?.wssUrl as string | undefined;
    const isHost = location.state?.isHost as boolean | undefined;

    // --- Identity ---
    const [deviceId] = useState(() => {
        const stored = sessionStorage.getItem('mg_webrtc_device_id');
        if (stored) return stored;
        const newId = Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('mg_webrtc_device_id', newId);
        return newId;
    });
    const [deviceName] = useState(`Device ${deviceId.substr(0, 3).toUpperCase()}`);

    // --- Logic State ---
    const [peers, setPeers] = useState<Record<string, WebRTCPeer>>({});
    const [myRole, setMyRole] = useState<MotionGateRole>('UNASSIGNED');

    // Connectivity
    const [isConnectedToSignaling, setIsConnectedToSignaling] = useState(false);
    const [showQrBridge, setShowQrBridge] = useState(false);
    const [isWssMode, setIsWssMode] = useState(!!wssUrl);

    // Game State
    const [gameState, setGameState] = useState<'IDLE' | 'RUNNING' | 'FINISHED'>('IDLE');
    const [startTime, setStartTime] = useState<number | null>(null);
    const [displayTime, setDisplayTime] = useState(0);
    const [splitTimes, setSplitTimes] = useState<{ timestamp: number; duration: number; deviceId: string; deviceName: string }[]>([]);
    const [finishTime, setFinishTime] = useState<number | null>(null);
    const [history, setHistory] = useState<{ id: number, duration: number, splits: { duration: number; deviceName: string }[] }[]>([]);

    // UI State
    const [showSettings, setShowSettings] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [flash, setFlash] = useState(false);
    const [isLocalArmed, setIsLocalArmed] = useState(false);
    const [blurRadius, setBlurRadius] = useState(4);
    const [cooldownMs, setCooldownMs] = useState(500);
    const [logs, setLogs] = useState<string[]>([]);

    // --- Refs ---
    const stateRef = useRef({ myRole, gameState, startTime, isLocalArmed, splitTimes });
    useEffect(() => { stateRef.current = { myRole, gameState, startTime, isLocalArmed, splitTimes }; }, [myRole, gameState, startTime, isLocalArmed, splitTimes]);

    const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
    const dataChannels = useRef<Record<string, RTCDataChannel>>({});
    const wsRef = useRef<WebSocket | null>(null);

    // --- Logger ---
    const addLog = (msg: string) => {
        console.log(`[RTC] ${msg}`);
        setLogs(prev => [`${new Date().toLocaleTimeString().split(' ')[0]} ${msg}`, ...prev].slice(0, 50));
    };

    // --- Initialization ---

    useEffect(() => {
        if (!lobbyId) return;
        addLog(`Session ${lobbyId} initialized`);

        if (wssUrl) {
            // --- MODE 1: LAN WebSocket Server ---
            addLog(`Connecting to LAN Server: ${wssUrl}`);
            setIsWssMode(true);
            connectWebSocket();
        } else {
            // --- MODE 2: Firebase (Internet) ---
            addLog("Connecting to Cloud Signaling (Firebase)...");
            connectFirebase();
        }

        return () => {
            cleanupFirebase();
            if (wsRef.current) wsRef.current.close();
            (Object.values(peerConnections.current) as RTCPeerConnection[]).forEach(pc => pc.close());
        };
    }, [lobbyId, wssUrl]);

    // --- WebSocket Logic (LAN) ---
    const connectWebSocket = () => {
        if (!wssUrl) return;
        const ws = new WebSocket(wssUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnectedToSignaling(true);
            addLog("✅ Connected to LAN Server");
            // Register logic: Send Join Message
            ws.send(JSON.stringify({
                type: 'join',
                lobbyId,
                deviceId,
                info: { name: deviceName, role: 'UNASSIGNED' }
            }));
        };

        ws.onmessage = async (event) => {
            try {
                const msg = JSON.parse(event.data);

                if (msg.type === 'peer-joined') {
                    const targetId = msg.deviceId;
                    addLog(`Peer detected on LAN: ${targetId}`);
                    if (targetId !== deviceId && !peerConnections.current[targetId]) {
                        // Tie-breaker: Lower ID initiates offer
                        if (deviceId < targetId) {
                            initiateConnection(targetId, false);
                        }
                    }
                }
                else if (msg.type === 'peer-left') {
                    const targetId = msg.deviceId;
                    addLog(`Peer left: ${targetId}`);
                    if (peerConnections.current[targetId]) {
                        peerConnections.current[targetId].close();
                        delete peerConnections.current[targetId];
                        delete dataChannels.current[targetId];
                        setPeers(prev => {
                            const next = { ...prev };
                            delete next[targetId];
                            return next;
                        });
                    }
                }
                else if (msg.type === 'signal') {
                    // msg.senderId, msg.payload
                    handleSignal(msg.senderId, msg.payload, false);
                }
                // If server relays broadcast
                else if (msg.type === 'peers') {
                    // list of existing peers
                    msg.peers.forEach((p: any) => {
                        if (p.deviceId !== deviceId && !peerConnections.current[p.deviceId]) {
                            if (deviceId < p.deviceId) {
                                initiateConnection(p.deviceId, false);
                            }
                        }
                    });
                }

            } catch (e) {
                console.error("WS Parse Error", e);
            }
        };

        ws.onclose = () => {
            setIsConnectedToSignaling(false);
            addLog("❌ Disconnected from LAN Server");
            // Simple reconnect attempt
            setTimeout(() => {
                if (wsRef.current?.readyState === WebSocket.CLOSED) {
                    addLog("Attempting reconnect...");
                    connectWebSocket();
                }
            }, 3000);
        };
    };

    const sendWsSignal = (targetId: string, payload: any) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'signal',
                targetId,
                senderId: deviceId,
                payload
            }));
        }
    };


    // --- Firebase Logic (Internet) ---
    const firebaseRefs = useRef<any[]>([]);

    const connectFirebase = () => {
        // 1. Monitor Internet/Firebase Connection
        const connectedRef = ref(db, ".info/connected");
        const unsubConnected = onValue(connectedRef, (snap) => {
            const connected = snap.val();
            setIsConnectedToSignaling(!!connected);
            if (!connected) {
                addLog("⚠️ Offline: Cloud signaling paused.");
                if (Object.keys(peerConnections.current).length === 0) {
                    setShowQrBridge(true);
                }
            } else {
                addLog("✅ Online: Cloud signaling active.");
            }
        });
        firebaseRefs.current.push(unsubConnected);

        // Register Presence
        const userRef = ref(db, `lobbies/${lobbyId}/webrtc/participants/${deviceId}`);
        const userPayload = { id: deviceId, name: deviceName, role: 'UNASSIGNED', lastSeen: getServerTime() };

        set(userRef, userPayload).catch(() => { });
        onDisconnect(userRef).remove().catch(() => { });

        // Heartbeat
        const hbInterval = setInterval(() => {
            update(userRef, { lastSeen: getServerTime() }).catch(() => { });
        }, 4000);
        // @ts-ignore
        firebaseRefs.current.push(() => clearInterval(hbInterval));

        // Listen for Peers
        const participantsRef = ref(db, `lobbies/${lobbyId}/webrtc/participants`);
        const unsubParticipants = onValue(participantsRef, (snapshot) => {
            const val = snapshot.val();
            if (val) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Object.values(val).forEach((p: any) => {
                    if (p.id !== deviceId) {
                        if (!peerConnections.current[p.id]) {
                            if (deviceId < p.id) {
                                initiateConnection(p.id, false);
                            }
                        }
                    }
                });
            }
        });
        firebaseRefs.current.push(unsubParticipants);

        // Listen for Signals
        const signalsRef = ref(db, `lobbies/${lobbyId}/webrtc/signals/${deviceId}`);
        const unsubSignals = onChildAdded(signalsRef, async (snapshot) => {
            const data = snapshot.val();
            if (data && data.senderId && data.type) {
                await handleSignal(data.senderId, data, false);
                remove(ref(db, `lobbies/${lobbyId}/webrtc/signals/${deviceId}/${snapshot.key}`)).catch(() => { });
            }
        });
        firebaseRefs.current.push(unsubSignals);
    };

    const cleanupFirebase = () => {
        firebaseRefs.current.forEach(fn => fn());
        // Attempt cleanup
        const userRef = ref(db, `lobbies/${lobbyId}/webrtc/participants/${deviceId}`);
        remove(userRef).catch(() => { });
    };

    // --- WebRTC Core (Abstracted Transport) ---

    // Common function to send signal via active transport
    const sendSignal = (targetId: string, payload: any) => {
        if (isWssMode) {
            sendWsSignal(targetId, payload);
        } else {
            const targetSignalRef = ref(db, `lobbies/${lobbyId}/webrtc/signals/${targetId}`);
            const newRef = push(targetSignalRef);
            set(newRef, { ...payload, senderId: deviceId });
        }
    };

    const createPC = (peerId: string, isManual = false) => {
        // If we are on WSS (LAN), we probably don't have internet for STUN.
        // But we are on the same LAN, so mDNS or local IP candidates should work fine without STUN.
        // If we are Manual (QR), definitely no STUN.
        // If Cloud, use Google STUN.
        const iceServers = (isManual || isWssMode) ? [] : [{ urls: 'stun:stun.l.google.com:19302' }];

        const pc = new RTCPeerConnection({
            iceServers,
            iceTransportPolicy: 'all'
        });

        pc.onconnectionstatechange = () => {
            addLog(`Peer ${peerId.substr(0, 4)} state: ${pc.connectionState}`);
            updatePeerUI(peerId, pc.connectionState, dataChannels.current[peerId]?.readyState || 'closed', isManual);
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                pc.close();
                delete peerConnections.current[peerId];
                delete dataChannels.current[peerId];
                updatePeerUI(peerId, 'closed', 'closed', isManual);
            }
        };

        peerConnections.current[peerId] = pc;
        return pc;
    };

    const setupDataChannel = (peerId: string, channel: RTCDataChannel, isManual: boolean) => {
        dataChannels.current[peerId] = channel;

        channel.onopen = () => {
            addLog(`Channel OPEN with ${peerId}`);
            updatePeerUI(peerId, 'connected', 'open', isManual);
            playBeep(1200);

            sendToPeer(peerId, {
                type: 'ROLE_UPDATE',
                timestamp: Date.now(),
                senderId: deviceId,
                payload: { role: stateRef.current.myRole }
            });
        };

        channel.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                handleGameMessage(msg);
            } catch (e) {
                console.error("Failed to parse message", e);
            }
        };
    };

    const updatePeerUI = (id: string, connState: RTCPeerConnectionState, dcState: RTCDataChannelState, isManual: boolean) => {
        setPeers(prev => {
            if (connState === 'closed' || connState === 'failed') {
                const next = { ...prev };
                delete next[id];
                return next;
            }
            return {
                ...prev,
                [id]: {
                    id,
                    name: prev[id]?.name || `Device ${id.substr(0, 3)}`,
                    role: prev[id]?.role || 'UNASSIGNED',
                    lastSeen: Date.now(),
                    connectionState: connState,
                    dataChannelState: dcState,
                    isManual
                }
            };
        });
    };

    // --- Signaling Handlers ---

    const initiateConnection = async (targetId: string, isManual: boolean) => {
        addLog(`Initiating connection to ${targetId.substr(0, 4)}...`);
        const pc = createPC(targetId, isManual);
        const dc = pc.createDataChannel("motion-gate");
        setupDataChannel(targetId, dc, isManual);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                // Standard Trickle ICE
                sendSignal(targetId, { type: 'candidate', candidate: event.candidate });
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // If manual/offline, we might wait for gathering to complete to send one big blob
        if (isManual) {
            // (Manual flow handled by QR component typically, but here we reuse logic if needed)
        } else {
            sendSignal(targetId, { type: 'offer', sdp: offer });
        }
    };

    const handleSignal = async (senderId: string, data: any, isManual: boolean) => {
        let pc = peerConnections.current[senderId];
        if (!pc) {
            if (data.type === 'offer') {
                pc = createPC(senderId, isManual);
                pc.ondatachannel = (e) => setupDataChannel(senderId, e.channel, isManual);
                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        sendSignal(senderId, { type: 'candidate', candidate: event.candidate });
                    }
                };
            } else {
                // Ignore candidates for unknown peers
                return;
            }
        }

        try {
            if (data.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendSignal(senderId, { type: 'answer', sdp: answer });
            }
            else if (data.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            }
            else if (data.type === 'candidate') {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (err) {
            console.error("Signaling Error", err);
        }
    };

    // --- Game Logic (Same as before) ---
    const sendToPeer = (peerId: string, msg: any) => {
        const dc = dataChannels.current[peerId];
        if (dc && dc.readyState === 'open') {
            dc.send(JSON.stringify(msg));
        }
    };

    const broadcast = (msg: any) => {
        Object.keys(dataChannels.current).forEach(id => sendToPeer(id, msg));
    };

    const handleGameMessage = (msg: any) => {
        if (msg.type === 'ROLE_UPDATE') {
            setPeers(prev => ({
                ...prev,
                [msg.senderId]: { ...prev[msg.senderId], role: msg.payload.role }
            }));
        }
        else if (msg.type === 'ROLE_ASSIGNMENT') {
            // Host assigned us a role
            const newRole = msg.payload.role;
            setMyRole(newRole);
            addLog(`Host assigned role: ${newRole}`);
            // Broadcast confirmation
            broadcast({
                type: 'ROLE_UPDATE',
                timestamp: Date.now(),
                senderId: deviceId,
                payload: { role: newRole }
            });
        }
        else if (msg.type === 'START') {
            setGameState('RUNNING');
            setStartTime(msg.timestamp);
            setDisplayTime(0);
            setSplitTimes([]);
            setFinishTime(null);
            setFlash(true);
            setTimeout(() => setFlash(false), 200);
        }
        else if (msg.type === 'SPLIT') {
            if (stateRef.current.gameState === 'RUNNING') {
                const duration = msg.timestamp - (stateRef.current.startTime || 0);
                setSplitTimes(prev => [...prev, {
                    timestamp: msg.timestamp,
                    duration,
                    deviceId: msg.senderId,
                    deviceName: msg.deviceName || `Device ${msg.senderId.substr(0, 3)}`
                }]);
                setFlash(true);
                setTimeout(() => setFlash(false), 150);
            }
        }
        else if (msg.type === 'FINISH') {
            if (stateRef.current.gameState === 'RUNNING') {
                setGameState('FINISHED');
                const duration = msg.timestamp - (stateRef.current.startTime || 0);
                setDisplayTime(duration);
                setFinishTime(msg.timestamp);
                setHistory(prev => [{
                    id: Date.now(),
                    duration,
                    splits: stateRef.current.splitTimes.map(s => ({ duration: s.duration, deviceName: s.deviceName }))
                }, ...prev]);
            }
        }
        else if (msg.type === 'RESET') {
            setGameState('IDLE');
            setStartTime(null);
            setDisplayTime(0);
            setSplitTimes([]);
            setFinishTime(null);
        }
    };

    // --- Tripwire Handlers ---
    const handleMotionTrigger = () => {
        const now = Date.now();

        if (myRole === 'START' && (gameState === 'IDLE' || gameState === 'FINISHED')) {
            setGameState('RUNNING');
            setStartTime(now);
            setSplitTimes([]);
            setFinishTime(null);
            setIsLocalArmed(false);
            // Broadcast Start
            broadcast({ type: 'START', timestamp: now, senderId: deviceId });
            playBeep(1200);
        }
        else if (myRole === 'SPLIT' && gameState === 'RUNNING') {
            const duration = now - (startTime || 0);
            setSplitTimes(prev => [...prev, {
                timestamp: now,
                duration,
                deviceId,
                deviceName
            }]);
            setIsLocalArmed(false);
            // Broadcast Split
            broadcast({ type: 'SPLIT', timestamp: now, senderId: deviceId, deviceName });
            playBeep(1000);
            setFlash(true);
            setTimeout(() => setFlash(false), 150);
        }
        else if (myRole === 'FINISH' && gameState === 'RUNNING') {
            setGameState('FINISHED');
            const duration = now - (startTime || 0);
            setDisplayTime(duration);
            setFinishTime(now);
            setIsLocalArmed(false);
            setHistory(prev => [{
                id: now,
                duration,
                splits: splitTimes.map(s => ({ duration: s.duration, deviceName: s.deviceName }))
            }, ...prev]);
            // Broadcast Finish
            broadcast({ type: 'FINISH', timestamp: now, senderId: deviceId });
            playBeep(1200);
        }
    };

    const handleReset = () => {
        setGameState('IDLE');
        setStartTime(null);
        setDisplayTime(0);
        setSplitTimes([]);
        setFinishTime(null);
        broadcast({ type: 'RESET', timestamp: Date.now(), senderId: deviceId });
    };

    const playBeep = (freq = 1000) => {
        try {
            // @ts-ignore
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.2);
        } catch (e) { }
    };

    // --- Render Loops ---
    useEffect(() => {
        let fid: number;
        const loop = () => {
            if (gameState === 'RUNNING' && startTime) {
                setDisplayTime(Date.now() - startTime);
                fid = requestAnimationFrame(loop);
            }
        };
        if (gameState === 'RUNNING') loop();
        return () => cancelAnimationFrame(fid);
    }, [gameState, startTime]);


    // --- Render ---
    const isSetupMode = myRole === 'UNASSIGNED' || showSettings;
    const isSensorActive = isLocalArmed && (
        (myRole === 'START' && (gameState === 'IDLE' || gameState === 'FINISHED')) ||
        (myRole === 'SPLIT' && gameState === 'RUNNING') ||
        (myRole === 'FINISH' && gameState === 'RUNNING')
    );

    return (
        <div className="fixed inset-0 bg-black flex flex-col overflow-hidden touch-none text-white">
            {/* ... (Visuals same as other game modes) ... */}
            <AnimatePresence>
                {flash && (
                    <motion.div
                        initial={{ opacity: 0.5 }}
                        animate={{ opacity: 0 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-white z-30 pointer-events-none"
                    />
                )}
            </AnimatePresence>

            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 z-50 p-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between pointer-events-none">
                <Button variant="icon" onClick={() => navigate('/motion-gate')} className="bg-black/60 backdrop-blur-md border-gray-600 text-white pointer-events-auto">
                    <ChevronLeft size={20} />
                </Button>

                {!isSetupMode && (
                    <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-gray-600 flex items-center gap-2 shadow-lg pointer-events-auto" onClick={() => setShowSettings(true)}>
                        <span className={`w-2 h-2 rounded-full ${isConnectedToSignaling ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {isWssMode ? <Server size={12} className="text-blue-400" /> : <Zap size={12} className="text-yellow-400" />}
                        <span className="text-xs font-mono font-bold text-white">#{lobbyId}</span>
                    </div>
                )}

                <Button
                    variant="icon"
                    onClick={() => setShowSettings(!showSettings)}
                    className={`pointer-events-auto backdrop-blur-md border-gray-600 transition-colors ${showSettings ? 'bg-indigo-600 text-white' : 'bg-black/60 text-white'}`}
                >
                    <Settings size={20} />
                </Button>
            </div>

            {/* Main Game View */}
            <div className={`absolute inset-0 transition-opacity duration-500 ${isSetupMode ? 'opacity-10 pointer-events-none' : 'opacity-100'}`}>
                {myRole === 'DISPLAY' ? (
                    <div className="flex flex-col items-center justify-center h-full bg-gray-900 px-4">
                        {/* Main Timer */}
                        <div className={`text-[15vw] sm:text-[20vw] font-mono font-bold tabular-nums tracking-tighter leading-none ${gameState === 'RUNNING' ? 'text-white' : 'text-gray-500'}`}>
                            {(displayTime / 1000).toFixed(2)}s
                        </div>
                        
                        {/* Split Times Display */}
                        {(splitTimes.length > 0 || gameState === 'FINISHED') && (
                            <div className="mt-6 w-full max-w-md space-y-2">
                                {/* Start */}
                                <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-2">
                                    <span className="text-emerald-400 font-semibold text-sm">START</span>
                                    <span className="font-mono text-emerald-300 text-lg">0.00s</span>
                                </div>
                                
                                {/* Splits */}
                                {splitTimes.map((split, idx) => (
                                    <div key={idx} className="flex items-center justify-between bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-2">
                                        <span className="text-blue-400 font-semibold text-sm">SPLIT {idx + 1}</span>
                                        <div className="text-right">
                                            <span className="font-mono text-blue-300 text-lg">{(split.duration / 1000).toFixed(2)}s</span>
                                            {idx > 0 && (
                                                <span className="text-blue-500/70 text-xs ml-2">
                                                    (+{((split.duration - splitTimes[idx - 1].duration) / 1000).toFixed(2)}s)
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                
                                {/* Finish */}
                                {gameState === 'FINISHED' && (
                                    <div className="flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2">
                                        <span className="text-red-400 font-semibold text-sm">FINISH</span>
                                        <div className="text-right">
                                            <span className="font-mono text-red-300 text-lg">{(displayTime / 1000).toFixed(2)}s</span>
                                            {splitTimes.length > 0 && (
                                                <span className="text-red-500/70 text-xs ml-2">
                                                    (+{((displayTime - splitTimes[splitTimes.length - 1].duration) / 1000).toFixed(2)}s)
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="relative w-full h-full bg-gray-900">
                        <MotionTripwire
                            isActive={isSensorActive}
                            onTrigger={handleMotionTrigger}
                            color={myRole === 'START' ? 'green' : myRole === 'SPLIT' ? 'blue' : 'red'}
                            blurRadius={blurRadius}
                            cooldownMs={cooldownMs}
                        />
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
                            <div className="text-6xl font-mono font-bold tabular-nums tracking-tighter text-white drop-shadow-2xl">
                                {(displayTime / 1000).toFixed(2)}s
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Settings / Setup Overlay */}
            <AnimatePresence>
                {isSetupMode && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="absolute inset-0 z-40 bg-gray-950/90 backdrop-blur-sm flex flex-col items-center pt-24 px-4 pb-4 overflow-y-auto"
                    >
                        <div className="w-full max-w-md space-y-6">
                            {/* Connection Status Card */}
                            <div className={`bg-gray-900 rounded-xl border p-4 flex items-center justify-between ${isConnectedToSignaling ? 'border-emerald-500/50' : 'border-red-500/50'}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${isConnectedToSignaling ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                        {isConnectedToSignaling ? (isWssMode ? <Server size={20} /> : <Zap size={20} />) : <WifiOff size={20} />}
                                    </div>
                                    <div>
                                        <div className="font-bold text-sm text-white">
                                            {isConnectedToSignaling ? (isWssMode ? "LAN Server Connected" : "Cloud Connected") : "Signal Lost"}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {isConnectedToSignaling ? "Ready to pair" : "Check network or use QR"}
                                        </div>
                                    </div>
                                </div>

                                {!isConnectedToSignaling && (
                                    <Button variant="secondary" onClick={() => navigate('/motion-gate-offline')} className="text-sm py-1 px-3">
                                        <QrCode size={16} className="mr-1" /> Use QR
                                    </Button>
                                )}
                            </div>

                            {/* Device List */}
                            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                                <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-800 flex items-center justify-between">
                                    <h3 className="font-semibold text-gray-200">Devices</h3>
                                    <span className="text-xs bg-gray-800 px-2 py-1 rounded text-gray-400">
                                        {Object.keys(peers).length + 1} Active
                                    </span>
                                </div>
                                <div className="divide-y divide-gray-800">
                                    {/* Self */}
                                    <div className="p-4 flex items-center justify-between gap-3">
                                        <div className="font-medium text-white flex items-center gap-2">
                                            {deviceName} <span className="text-[10px] bg-indigo-900/50 text-indigo-300 px-1.5 py-0.5 rounded">YOU</span>
                                        </div>
                                        <select
                                            value={myRole}
                                            onChange={(e) => {
                                                const r = e.target.value as MotionGateRole;
                                                setMyRole(r);
                                                // Broadcast role update
                                                Object.keys(dataChannels.current).forEach(id => sendToPeer(id, { type: 'ROLE_UPDATE', timestamp: Date.now(), senderId: deviceId, payload: { role: r } }));
                                            }}
                                            className="bg-gray-800 text-xs font-bold uppercase p-2 rounded border border-gray-700 outline-none focus:border-indigo-500"
                                        >
                                            <option value="UNASSIGNED">Unassigned</option>
                                            <option value="START">Start Gate</option>
                                            <option value="SPLIT">Split Gate</option>
                                            <option value="FINISH">Finish Gate</option>
                                            <option value="DISPLAY">Display</option>
                                        </select>
                                    </div>
                                    {/* Peers */}
                                    {(Object.values(peers) as WebRTCPeer[]).map(peer => (
                                        <div key={peer.id} className="p-4 flex items-center justify-between gap-3 bg-gray-900/50">
                                            <div className="min-w-0">
                                                <div className="font-medium text-gray-300 truncate">{peer.name}</div>
                                                <div className="text-xs text-gray-500 flex items-center gap-1">
                                                    {peer.connectionState === 'connected' ? <span className="text-emerald-400">● Connected</span> : <span className="text-yellow-500">● {peer.connectionState}</span>}
                                                    {peer.isManual && <span className="text-gray-600">(QR)</span>}
                                                </div>
                                            </div>

                                            {isHost ? (
                                                <select
                                                    value={peer.role}
                                                    onChange={(e) => {
                                                        const newRole = e.target.value as MotionGateRole;
                                                        // Send assignment to peer
                                                        sendToPeer(peer.id, {
                                                            type: 'ROLE_ASSIGNMENT',
                                                            timestamp: Date.now(),
                                                            senderId: deviceId,
                                                            payload: { role: newRole }
                                                        });
                                                        // Optimistically update local view
                                                        setPeers(prev => ({
                                                            ...prev,
                                                            [peer.id]: { ...prev[peer.id], role: newRole }
                                                        }));
                                                    }}
                                                    className="bg-gray-800 text-xs font-bold uppercase p-2 rounded border border-gray-700 outline-none focus:border-indigo-500"
                                                >
                                                    <option value="UNASSIGNED">Unassigned</option>
                                                    <option value="START">Start Gate</option>
                                                    <option value="SPLIT">Split Gate</option>
                                                    <option value="FINISH">Finish Gate</option>
                                                    <option value="DISPLAY">Display</option>
                                                </select>
                                            ) : (
                                                <div className="text-xs font-bold uppercase bg-gray-800 px-2 py-1 rounded text-gray-400 border border-gray-700">
                                                    {peer.role}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {myRole !== 'UNASSIGNED' && (
                                <Button fullWidth onClick={() => setShowSettings(false)}>
                                    Return to Game
                                </Button>
                            )}

                            {/* Logs Debug */}
                            <div className="p-2 bg-black/50 rounded text-[10px] font-mono text-gray-500 h-24 overflow-y-auto custom-scrollbar">
                                {logs.map((l, i) => <div key={i}>{l}</div>)}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bottom Controls */}
            {!isSetupMode && myRole !== 'DISPLAY' && (
                <div className="absolute bottom-0 left-0 right-0 z-20 bg-gray-900/80 backdrop-blur border-t border-gray-800 pb-[env(safe-area-inset-bottom)] p-6 flex items-center justify-between">
                    <Button variant="secondary" onClick={handleReset} className="rounded-full w-14 h-14 p-0"><RefreshCw size={20} /></Button>

                    <button
                        onClick={() => setIsLocalArmed(!isLocalArmed)}
                        className={`h-20 w-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${isLocalArmed
                            ? 'bg-red-500/20 text-red-500 border-2 border-red-500 animate-pulse'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/30 hover:scale-105'
                            }`}
                    >
                        {isLocalArmed ? <Square size={24} fill="currentColor" /> : <Play size={32} className="ml-1" fill="currentColor" />}
                    </button>

                    <div className="w-14" />
                </div>
            )}
        </div>
    );
};

export default MotionGateWebRTCGame;
