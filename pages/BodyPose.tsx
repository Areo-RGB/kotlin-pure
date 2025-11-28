
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Ui/Button';
import { ChevronLeft, Settings, Loader2, Camera } from 'lucide-react';
import { FilesetResolver, PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision';

// Config Types
type ModelComplexity = 'Lite' | 'Full' | 'Heavy';

const BodyPose: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [fps, setFps] = useState(0);
  
  // Model Configuration
  const [modelComplexity, setModelComplexity] = useState<ModelComplexity>('Lite');

  // Refs for logic
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const processingRef = useRef(false);

  // --- Initialization ---

  useEffect(() => {
    const init = async () => {
      try {
        await setupCamera();
        await loadModel();
      } catch (err) {
        console.error("Initialization error:", err);
        setModelError("Failed to initialize camera or AI model.");
        setIsLoading(false);
      }
    };
    init();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (landmarkerRef.current) {
          landmarkerRef.current.close();
          landmarkerRef.current = null;
      }
    };
  }, []);

  // Reload model when configuration changes
  useEffect(() => {
    if (!isLoading) {
       loadModel();
    }
  }, [modelComplexity]);

  const setupCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Browser API navigator.mediaDevices.getUserMedia not available');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 }
      }
    });
    
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      return new Promise<void>((resolve) => {
        if (videoRef.current) {
          videoRef.current.onloadedmetadata = () => {
            if (videoRef.current) {
               videoRef.current.play();
               if (canvasRef.current) {
                 canvasRef.current.width = videoRef.current.videoWidth;
                 canvasRef.current.height = videoRef.current.videoHeight;
               }
               resolve();
            }
          };
        }
      });
    }
  };

  const loadModel = async () => {
    setIsLoading(true);
    setModelError(null);
    
    // Clean up old landmarker if needed
    if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
    }

    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm"
      );

      let modelAssetPath = "";
      if (modelComplexity === 'Lite') {
          modelAssetPath = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
      } else if (modelComplexity === 'Full') {
          modelAssetPath = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
      } else {
          modelAssetPath = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task";
      }

      landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelAssetPath,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      setIsLoading(false);
      runFrameLoop();
    } catch (err) {
      console.error("Model loading error:", err);
      setModelError("Failed to load MediaPipe model.");
      setIsLoading(false);
    }
  };

  const runFrameLoop = () => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);

    const loop = async () => {
      if (landmarkerRef.current && videoRef.current && canvasRef.current) {
        const now = performance.now();
        const delta = now - lastFrameTimeRef.current;
        
        if (delta >= 500) { // Update FPS every 500ms to avoid jitter
            setFps(Math.round(1000 / (delta || 16)));
            lastFrameTimeRef.current = now;
        }

        // Only process if video is ready and we aren't already processing a frame (though detectForVideo is sync-ish in JS wrapper, it relies on WASM)
        if (videoRef.current.videoWidth > 0 && !processingRef.current) {
             processingRef.current = true;
             try {
                 const startTimeMs = performance.now();
                 const result = landmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);
                 drawResults(result);
             } catch (e) {
                 console.warn("Detection error", e);
             }
             processingRef.current = false;
        }
      }
      requestRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  // --- Drawing Logic ---

  // Helper to filter out unwanted parts
  const isExcluded = (index: number) => {
    // 0-10: Face landmarks (nose, eyes, ears, mouth)
    // 17-22: Hand fingers (pinky, index, thumb)
    return (index >= 0 && index <= 10) || (index >= 17 && index <= 22);
  };

  const drawResults = (result: PoseLandmarkerResult) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !videoRef.current || !canvasRef.current) return;

    // Clear and draw video
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.save();
    // Mirror effect for user-facing camera
    ctx.scale(-1, 1);
    ctx.translate(-canvasRef.current.width, 0);
    ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.restore();

    // Draw Landmarks
    if (result.landmarks) {
      for (const landmarks of result.landmarks) {
        drawConnectors(ctx, landmarks);
        drawLandmarks(ctx, landmarks);
      }
    }
  };

  // Helper to draw dots
  const drawLandmarks = (ctx: CanvasRenderingContext2D, landmarks: any[]) => {
     ctx.fillStyle = '#818cf8'; // Indigo-400
     ctx.strokeStyle = '#ffffff';
     ctx.lineWidth = 2;
     
     const width = ctx.canvas.width;
     const height = ctx.canvas.height;

     landmarks.forEach((lm, index) => {
       if (isExcluded(index)) return;

       // MediaPipe normalized coordinates
       const x = (1 - lm.x) * width; 
       const y = lm.y * height;

       if ((lm.visibility ?? 1) > 0.5) {
         ctx.beginPath();
         ctx.arc(x, y, 4, 0, 2 * Math.PI);
         ctx.fill();
         ctx.stroke();
       }
     });
  };

  // Helper to draw skeleton lines
  const drawConnectors = (ctx: CanvasRenderingContext2D, landmarks: any[]) => {
      const width = ctx.canvas.width;
      const height = ctx.canvas.height;

      ctx.strokeStyle = '#22d3ee'; // Cyan-400
      ctx.lineWidth = 3;

      const connections = PoseLandmarker.POSE_CONNECTIONS;
      if (connections) {
          connections.forEach((conn) => {
              // Skip drawing connection if either point is excluded
              if (isExcluded(conn.start) || isExcluded(conn.end)) return;

              const start = landmarks[conn.start];
              const end = landmarks[conn.end];

              if (start && end && (start.visibility ?? 1) > 0.5 && (end.visibility ?? 1) > 0.5) {
                  const x1 = (1 - start.x) * width;
                  const y1 = start.y * height;
                  const x2 = (1 - end.x) * width;
                  const y2 = end.y * height;

                  ctx.beginPath();
                  ctx.moveTo(x1, y1);
                  ctx.lineTo(x2, y2);
                  ctx.stroke();
              }
          });
      }
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col text-white overflow-hidden touch-none">
       {/* Header */}
       <div className="absolute top-0 left-0 right-0 z-20 p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent pt-[calc(1rem+env(safe-area-inset-top))] pointer-events-none">
        <Button variant="icon" onClick={() => navigate('/tools')} className="bg-black/50 backdrop-blur-md border-gray-700 pointer-events-auto">
          <ChevronLeft size={20} />
        </Button>
        <div className="bg-black/50 backdrop-blur-md px-3 py-1 rounded-full border border-gray-700 flex items-center gap-2">
           <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
           <span className="text-sm font-mono text-blue-400 font-bold uppercase tracking-wider">BodyPose</span>
        </div>
        <Button 
           variant="icon" 
           onClick={() => setShowSettings(!showSettings)} 
           className={`pointer-events-auto backdrop-blur-md border-gray-700 transition-colors ${showSettings ? 'bg-blue-600 text-white' : 'bg-black/50 text-gray-300'}`}
        >
          <Settings size={20} />
        </Button>
      </div>

      {/* Main Viewport */}
      <div className="relative flex-1 w-full h-full bg-gray-900 flex items-center justify-center">
          {isLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-sm">
                  <Loader2 className="w-10 h-10 text-blue-400 animate-spin mb-4" />
                  <p className="text-blue-200 font-medium">Loading MediaPipe Model...</p>
              </div>
          )}

          {modelError ? (
              <div className="text-center p-6 max-w-xs">
                  <Camera size={48} className="mx-auto text-red-400 mb-4" />
                  <p className="text-red-300">{modelError}</p>
                  <Button onClick={() => loadModel()} className="mt-4" variant="secondary">Retry</Button>
              </div>
          ) : (
            <>
               {/* Video hidden but used for processing */}
               <video 
                 ref={videoRef} 
                 className="absolute inset-0 w-full h-full object-cover opacity-0"
                 playsInline 
                 muted 
                 autoPlay
               />
               <canvas 
                 ref={canvasRef}
                 className="w-full h-full object-contain" 
               />
            </>
          )}

          {/* FPS Counter */}
          <div className="absolute bottom-4 right-4 font-mono text-xs text-gray-500 bg-black/60 px-2 py-1 rounded border border-gray-800">
              {fps} FPS
          </div>
      </div>

      {/* Settings Drawer */}
      {showSettings && (
          <div className="absolute bottom-0 left-0 right-0 z-30 bg-gray-900/95 backdrop-blur border-t border-gray-800 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl animate-in slide-in-from-bottom duration-200">
              <div className="max-w-md mx-auto space-y-4">
                  <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Model Complexity</label>
                      <div className="grid grid-cols-3 gap-2">
                            <button 
                                onClick={() => setModelComplexity('Lite')}
                                className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${modelComplexity === 'Lite' ? 'bg-blue-900/30 border-blue-500 text-blue-300' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                            >
                                Lite
                            </button>
                            <button 
                                onClick={() => setModelComplexity('Full')}
                                className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${modelComplexity === 'Full' ? 'bg-blue-900/30 border-blue-500 text-blue-300' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                            >
                                Full
                            </button>
                            <button 
                                onClick={() => setModelComplexity('Heavy')}
                                className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${modelComplexity === 'Heavy' ? 'bg-blue-900/30 border-blue-500 text-blue-300' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                            >
                                Heavy
                            </button>
                      </div>
                  </div>
                  
                  <p className="text-[10px] text-gray-500 text-center pt-2">
                     Default: Lite (Fastest on Mobile)
                  </p>
              </div>
          </div>
      )}
    </div>
  );
};

export default BodyPose;