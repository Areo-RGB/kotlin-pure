
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Ui/Button';
import { ChevronLeft, QrCode, Scan, Wifi, Zap, Play, Square, RefreshCw, Loader2, Download, CheckCircle } from 'lucide-react';
import { MotionTripwire } from '../../components/MotionTripwire';

// --- Types ---
type ConnectionState = 'IDLE' | 'HOST_GENERATING' | 'HOST_WAITING_SCAN' | 'PEER_SCANNING' | 'PEER_GENERATING' | 'PEER_SHOWING_ANSWER' | 'HOST_SCANNING_ANSWER' | 'CONNECTED';

interface SignalData {
    type: 'OFFER' | 'ANSWER';
    sdp: string;
}

// --- Config ---
const CHUNK_SIZE = 1500; // Increased size for fewer chunks
const ROTATION_INTERVAL = 700; // ms

// --- Globals ---
declare const pako: any;

const MotionGateOffline: React.FC = () => {
    const navigate = useNavigate();

    // --- UI State ---
    const [mode, setMode] = useState<'NONE' | 'HOST' | 'PEER'>('NONE');
    const [status, setStatus] = useState<ConnectionState>('IDLE');
    const [logs, setLogs] = useState<string[]>([]);
    const [libsLoaded, setLibsLoaded] = useState(false);
    const [libError, setLibError] = useState(false);

    // QR Chunking State
    const [qrChunks, setQrChunks] = useState<string[]>([]);
    const [currentQrIndex, setCurrentQrIndex] = useState(0);

    // Scanning State
    const [scanProgress, setScanProgress] = useState<{ curr: number, total: number } | null>(null);
    const scannedPartsRef = useRef<Map<number, string>>(new Map());

    // --- Game State ---
    const [gameState, setGameState] = useState<'IDLE' | 'RUNNING' | 'FINISHED'>('IDLE');
    const [displayTime, setDisplayTime] = useState(0);
    const [startTime, setStartTime] = useState<number | null>(null);
    const [isLocalArmed, setIsLocalArmed] = useState(false);

    // --- Refs ---
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const dcRef = useRef<RTCDataChannel | null>(null);
    const qrCanvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const scanCanvasRef = useRef<HTMLCanvasElement>(null);
    const scanRafRef = useRef<number>(0);

    // --- Logger ---
    const log = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString().split(' ')[0]}] ${msg}`, ...prev].slice(0, 5));

    // --- Initialization ---
    useEffect(() => {
        let attempts = 0;
        const checkLibs = setInterval(() => {
            // @ts-ignore
            if (window.QRCode && window.jsQR && window.pako) {
                setLibsLoaded(true);
                clearInterval(checkLibs);
            } else {
                attempts++;
                if (attempts > 20) { // 10 seconds
                    setLibError(true);
                }
            }
        }, 500);
        return () => clearInterval(checkLibs);
    }, []);

    const handleRetryLibs = () => {
        setLibError(false);
        // @ts-ignore
        if (!window.jsQR && !document.getElementById('dynamic-jsqr')) { /* ... */ }
        // @ts-ignore
        if (!window.QRCode && !document.getElementById('dynamic-qrcode')) { /* ... */ }
        // @ts-ignore
        if (!window.pako && !document.getElementById('dynamic-pako')) {
            const s = document.createElement('script');
            s.id = 'dynamic-pako';
            s.src = "https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js";
            document.head.appendChild(s);
        }
    };

    // --- Cleanup ---
    useEffect(() => {
        return () => {
            if (pcRef.current) pcRef.current.close();
            if (scanRafRef.current) cancelAnimationFrame(scanRafRef.current);
            stopCamera();
        };
    }, []);

    // --- QR Rotation Effect ---
    useEffect(() => {
        if (qrChunks.length > 1) {
            const interval = setInterval(() => {
                setCurrentQrIndex(prev => (prev + 1) % qrChunks.length);
            }, ROTATION_INTERVAL);
            return () => clearInterval(interval);
        }
    }, [qrChunks]);

    // --- QR Rendering Effect ---
    useEffect(() => {
        if (qrCanvasRef.current && qrChunks.length > 0) {
            const chunk = qrChunks[currentQrIndex];
            // @ts-ignore
            if (window.QRCode) {
                // @ts-ignore
                window.QRCode.toCanvas(qrCanvasRef.current, chunk, {
                    width: 256,
                    margin: 2,
                    errorCorrectionLevel: 'L' // Low correction for max data
                }, (error: any) => {
                    if (error) console.error(error);
                });
            }
        }
    }, [currentQrIndex, qrChunks]);

    // --- WebRTC Setup ---
    const initPC = () => {
        const pc = new RTCPeerConnection({ iceServers: [] });
        pc.onconnectionstatechange = () => { /* ... */ };
        pcRef.current = pc;
        return pc;
    };

    const setupDataChannel = (dc: RTCDataChannel) => {
        dcRef.current = dc;
        dc.onopen = () => log("DataChannel OPEN");
        dc.onmessage = (e) => handleMessage(e.data);
    };

    // --- Host Logic ---
    const startHost = async () => {
        setMode('HOST');
        setStatus('HOST_GENERATING');
        const pc = initPC();
        const dc = pc.createDataChannel("motion-gate");
        setupDataChannel(dc);

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            await new Promise<void>(resolve => {
                if (pc.iceGatheringState === 'complete') resolve();
                else pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') resolve() });
            });

            const payload: SignalData = { type: 'OFFER', sdp: JSON.stringify(pc.localDescription) };
            generateQR(JSON.stringify(payload));
            setStatus('HOST_WAITING_SCAN');
        } catch (e) {
            log("Error creating offer: " + e);
            setStatus('IDLE');
        }
    };

    const startHostScanning = () => {
        setStatus('HOST_SCANNING_ANSWER');
        scannedPartsRef.current.clear();
        setScanProgress(null);
        startScanner(async (data) => {
            try {
                const signal = JSON.parse(data) as SignalData;
                if (signal.type === 'ANSWER' && pcRef.current) {
                    const desc = JSON.parse(signal.sdp);
                    await pcRef.current.setRemoteDescription(desc);
                    log("Remote description set. Connecting...");
                    stopCamera();
                }
            } catch (e) {
                log("Invalid QR Code Data");
            }
        });
    };

    // --- Peer Logic ---
    const startPeer = () => {
        setMode('PEER');
        setStatus('PEER_SCANNING');
        scannedPartsRef.current.clear();
        setScanProgress(null);
        startScanner(async (data) => {
            try {
                const signal = JSON.parse(data) as SignalData;
                if (signal.type === 'OFFER') {
                    stopCamera();
                    setStatus('PEER_GENERATING');
                    await handleOffer(signal.sdp);
                }
            } catch (e) {
                log("Invalid QR: " + e);
            }
        });
    };

    const handleOffer = async (offerStr: string) => {
        const pc = initPC();
        pc.ondatachannel = (e) => setupDataChannel(e.channel);

        try {
            await pc.setRemoteDescription(JSON.parse(offerStr));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await new Promise<void>(resolve => {
                if (pc.iceGatheringState === 'complete') resolve();
                else pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') resolve() });
            });

            const payload: SignalData = { type: 'ANSWER', sdp: JSON.stringify(pc.localDescription) };
            generateQR(JSON.stringify(payload));
            setStatus('PEER_SHOWING_ANSWER');
        } catch (e) {
            log("Peer Error: " + e);
            setStatus('IDLE');
        }
    };

    // --- Shared QR Logic (with Compression) ---
    const generateQR = (data: string) => {
        // 1. Compress
        const compressed = pako.deflate(data);
        // 2. To Base64
        const binaryString = Array.from(compressed).map(byte => String.fromCharCode(byte as number)).join('');
        const base64String = btoa(binaryString);

        log(`Original: ${data.length}B, Compressed: ${base64String.length}B`);

        const totalChunks = Math.ceil(base64String.length / CHUNK_SIZE);
        const chunks = [];

        for (let i = 0; i < totalChunks; i++) {
            const chunk = base64String.substr(i * CHUNK_SIZE, CHUNK_SIZE);
            // Format: C|index|total|data ('C' for compressed)
            chunks.push(`C|${i}|${totalChunks}|${chunk}`);
        }

        setQrChunks(chunks);
        setCurrentQrIndex(0);
        log(`Generated ${totalChunks} QR part(s).`);
    };

    const startScanner = async (onScanComplete: (data: string) => void) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.setAttribute("playsinline", "true");
                videoRef.current.play();
                requestAnimationFrame(() => scanLoop(onScanComplete));
            }
        } catch (e) {
            alert("Camera permission denied");
            setStatus('IDLE');
        }
    };

    const stopCamera = () => { /* ... */ };

    const scanLoop = (onScanComplete: (data: string) => void) => {
        if (!videoRef.current || !scanCanvasRef.current) return;
        const ctx = scanCanvasRef.current.getContext('2d');
        if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA && ctx) {
            scanCanvasRef.current.height = videoRef.current.videoHeight;
            scanCanvasRef.current.width = videoRef.current.videoWidth;
            ctx.drawImage(videoRef.current, 0, 0, scanCanvasRef.current.width, scanCanvasRef.current.height);
            const imageData = ctx.getImageData(0, 0, scanCanvasRef.current.width, scanCanvasRef.current.height);
            // @ts-ignore
            const code = window.jsQR && window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });

            if (code && code.data) {
                const raw = code.data;
                if (raw.startsWith('C|')) {
                    const parts = raw.split('|');
                    const idx = parseInt(parts[1]);
                    const total = parseInt(parts[2]);
                    const content = parts.slice(3).join('|');

                    if (!scannedPartsRef.current.has(idx)) {
                        scannedPartsRef.current.set(idx, content);
                        setScanProgress({ curr: scannedPartsRef.current.size, total });
                    }

                    if (scannedPartsRef.current.size === total) {
                        const fullBase64 = Array.from({ length: total }).map((_, i) => scannedPartsRef.current.get(i) || '').join('');
                        const compressedBinaryString = atob(fullBase64);

                        const compressedArray = new Uint8Array(compressedBinaryString.length);
                        for (let i = 0; i < compressedBinaryString.length; i++) {
                            compressedArray[i] = compressedBinaryString.charCodeAt(i);
                        }

                        const decompressed = pako.inflate(compressedArray, { to: 'string' });
                        onScanComplete(decompressed);
                        return;
                    }
                } else {
                    // Non-compressed fallback
                    onScanComplete(raw);
                    return;
                }
            }
        }
        scanRafRef.current = requestAnimationFrame(() => scanLoop(onScanComplete));
    };

    // --- Game Messaging & State ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const send = (msg: any) => { /* ... */ };
    const handleMessage = (json: string) => { /* ... */ };
    const handleTrigger = () => { /* ... */ };
    const handleReset = () => { /* ... */ };
    useEffect(() => { /* ...timer loop... */ }, [gameState, startTime]);

    // --- Render ---
    if (!libsLoaded) { /* ...loading UI... */ }
    if (status === 'CONNECTED') { /* ...game UI... */ }

    return (
        <div className="min-h-screen bg-gray-950 p-6 flex flex-col items-center justify-center text-white overflow-y-auto">
            {/* ... rest of the JSX is identical to the previous version ... */}
            <div className="w-full max-w-md space-y-6">
                {status === 'IDLE' ? (
                    <>
                        <div className="flex items-center gap-4 mb-8">
                            <Button variant="icon" onClick={() => navigate('/motion-gate')}>
                                <ChevronLeft />
                            </Button>
                            <div>
                                <h1 className="text-2xl font-bold">Offline Connect</h1>
                                <p className="text-xs text-gray-400">Pair devices without internet</p>
                            </div>
                        </div>

                        <div className="grid gap-4">
                            <button onClick={startHost} className="bg-gray-900 border border-gray-800 p-6 rounded-xl hover:border-indigo-500 transition-all text-left group">
                                <div className="flex items-center gap-4 mb-2">
                                    <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg">
                                        <Wifi size={24} />
                                    </div>
                                    <h3 className="font-bold text-lg">Host (Start Line)</h3>
                                </div>
                                <p className="text-sm text-gray-400">Create a session and generate a QR code for the other device.</p>
                            </button>

                            <button onClick={startPeer} className="bg-gray-900 border border-gray-800 p-6 rounded-xl hover:border-emerald-500 transition-all text-left group">
                                <div className="flex items-center gap-4 mb-2">
                                    <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg">
                                        <Scan size={24} />
                                    </div>
                                    <h3 className="font-bold text-lg">Join (Finish Line)</h3>
                                </div>
                                <p className="text-sm text-gray-400">Scan the Host's QR code to connect.</p>
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center text-center space-y-6">
                        <h2 className="text-xl font-bold text-gray-200">
                            {status === 'HOST_GENERATING' ? 'Creating Session...' :
                                status === 'HOST_WAITING_SCAN' ? 'Scan with Other Device' :
                                    status === 'PEER_SCANNING' ? 'Scan Host QR' :
                                        status === 'PEER_GENERATING' ? 'Generating Answer...' :
                                            status === 'PEER_SHOWING_ANSWER' ? 'Show this to Host' :
                                                status === 'HOST_SCANNING_ANSWER' ? 'Scan Peer Answer' : 'Connecting...'}
                        </h2>

                        {(status === 'HOST_WAITING_SCAN' || status === 'PEER_SHOWING_ANSWER') && (
                            <div className="flex flex-col items-center gap-4">
                                <div className="p-4 bg-white rounded-xl shadow-2xl shadow-white/5">
                                    <canvas ref={qrCanvasRef} className="w-64 h-64" />
                                </div>
                                {qrChunks.length > 1 && (
                                    <div className="flex flex-col items-center gap-2 text-center">
                                        <div className="flex items-center gap-2 text-sm font-mono text-indigo-400">
                                            <Loader2 size={14} className="animate-spin" />
                                            <span>Part {currentQrIndex + 1} / {qrChunks.length}</span>
                                        </div>
                                        <div className="flex gap-1.5 mt-2">
                                            {qrChunks.map((_, index) => (
                                                <div
                                                    key={index}
                                                    className={`h-2 rounded-full transition-all duration-300 ${index === currentQrIndex ? 'w-6 bg-indigo-400' : 'w-2 bg-gray-600'
                                                        }`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {(status === 'PEER_SCANNING' || status === 'HOST_SCANNING_ANSWER') && (
                            <div className="relative w-full max-w-xs mx-auto">
                                <div className="relative rounded-xl overflow-hidden border-2 border-indigo-500 w-full aspect-square bg-black">
                                    <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" />
                                    <canvas ref={scanCanvasRef} className="hidden" />
                                    <div className="absolute inset-0 border-[40px] border-black/50 flex items-center justify-center">
                                        <div className="w-full h-0.5 bg-red-500/50 shadow-[0_0_10px_red] animate-pulse" />
                                    </div>
                                    {scanProgress && (
                                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 px-3 py-1 rounded-full flex items-center gap-2 border border-indigo-500/50 backdrop-blur-md">
                                            <CheckCircle size={14} className="text-emerald-400" />
                                            <span className="text-xs font-bold text-white">
                                                Part {scanProgress.curr} / {scanProgress.total}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-2 animate-pulse">
                                    {scanProgress ? "Keep scanning..." : "Point at the cycling QR code"}
                                </p>
                            </div>
                        )}

                        {status === 'HOST_WAITING_SCAN' && (
                            <Button variant="primary" fullWidth onClick={startHostScanning} className="mt-4">
                                <Scan className="mr-2" size={20} /> Peer Scanned, Now Scan Peer's Code
                            </Button>
                        )}

                        <Button variant="secondary" onClick={() => { setStatus('IDLE'); stopCamera(); }}>
                            Cancel
                        </Button>

                        {logs.length > 0 && (
                            <div className="w-full text-left bg-gray-900/50 p-2 rounded text-[10px] font-mono text-gray-500 h-24 overflow-y-auto custom-scrollbar">
                                {logs.map((l, i) => <div key={i} className="border-b border-gray-800/50 pb-1 mb-1">{l}</div>)}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MotionGateOffline;