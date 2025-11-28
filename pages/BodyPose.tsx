import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Ui/Button";
import {
  ChevronLeft,
  Settings,
  Loader2,
  Camera,
  Video,
  VideoOff,
  Box,
  Square,
  FileVideo,
  Upload,
  Play,
  Pause,
  SkipBack,
  SkipForward,
} from "lucide-react";
import {
  FilesetResolver,
  PoseLandmarker,
  PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import * as THREE from "three";

// Config Types
type ModelComplexity = "Lite" | "Full" | "Heavy";
type FacingMode = "user" | "environment";
type ViewMode = "2d" | "3d";
type VideoSource = "camera" | "file";

const BodyPose: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [actualFps, setActualFps] = useState(0);

  // Model Configuration
  const [modelComplexity, setModelComplexity] =
    useState<ModelComplexity>("Lite");
  const [showVideoBackground, setShowVideoBackground] = useState(false);
  const [smoothingFactor, setSmoothingFactor] = useState(0.5);
  const [facingMode, setFacingMode] = useState<FacingMode>("user");
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [videoSource, setVideoSource] = useState<VideoSource>("camera");
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refs for logic
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const processingRef = useRef(false);
  const showVideoBackgroundRef = useRef(showVideoBackground);
  const smoothingFactorRef = useRef(smoothingFactor);
  const smoothedLandmarksRef = useRef<any[][] | null>(null);
  const frameCountRef = useRef(0);
  const fpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cache for paused frame detection
  const cachedResultRef = useRef<PoseLandmarkerResult | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const isPlayingRef = useRef(isPlaying);

  // 3D refs
  const threeContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const jointSpheresRef = useRef<THREE.Mesh[]>([]);
  const boneLinesRef = useRef<THREE.Line[]>([]);
  const neckLineRef = useRef<THREE.Line | null>(null);
  const neckSphereRef = useRef<THREE.Mesh | null>(null);
  const viewModeRef = useRef(viewMode);

  const facingModeRef = useRef(facingMode);
  const videoSourceRef = useRef(videoSource);

  // Keep refs in sync with state
  useEffect(() => {
    showVideoBackgroundRef.current = showVideoBackground;
    // Update 3D scene background when video mode changes
    if (sceneRef.current && rendererRef.current) {
      sceneRef.current.background = showVideoBackground
        ? null
        : new THREE.Color(0x111111);
      rendererRef.current.setClearColor(0x000000, showVideoBackground ? 0 : 1);
    }
  }, [showVideoBackground]);

  useEffect(() => {
    smoothingFactorRef.current = smoothingFactor;
  }, [smoothingFactor]);

  useEffect(() => {
    facingModeRef.current = facingMode;
  }, [facingMode]);

  useEffect(() => {
    videoSourceRef.current = videoSource;
  }, [videoSource]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    // Clear cache when resuming playback
    if (isPlaying) {
      cachedResultRef.current = null;
      lastVideoTimeRef.current = -1;
    }
  }, [isPlaying]);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  // 3D scene rotation
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastTouchRef = useRef({ x: 0, y: 0 });

  // Track if component is mounted
  const mountedRef = useRef(true);
  const initializedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      try {
        await setupCamera();
        await loadModel();
        initializedRef.current = true;
      } catch (err) {
        console.error("Initialization error:", err);
        setModelError(
          "Failed to initialize camera or AI model: " + (err as Error).message
        );
        setIsLoading(false);
      }
    };
    init();

    // FPS counter interval
    fpsIntervalRef.current = setInterval(() => {
      setActualFps(frameCountRef.current * 2);
      frameCountRef.current = 0;
    }, 500);

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, []);

  const cleanup = async () => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = 0;
    }
    if (fpsIntervalRef.current) {
      clearInterval(fpsIntervalRef.current);
      fpsIntervalRef.current = null;
    }

    if (landmarkerRef.current) {
      landmarkerRef.current.close();
      landmarkerRef.current = null;
    }

    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    // Clear video file source if any
    if (videoRef.current?.src) {
      URL.revokeObjectURL(videoRef.current.src);
      videoRef.current.src = "";
    }
  };

  // Handle video file selection
  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file || !videoRef.current) return;

    // Stop camera stream if running
    if (videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    // Create object URL for the video file
    const videoUrl = URL.createObjectURL(file);
    videoRef.current.src = videoUrl;
    videoRef.current.loop = true; // Loop for continuous testing
    setVideoFileName(file.name);
    setVideoSource("file");

    return new Promise<void>((resolve, reject) => {
      if (videoRef.current) {
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current
              .play()
              .then(() => {
                if (canvasRef.current && videoRef.current) {
                  canvasRef.current.width = videoRef.current.videoWidth;
                  canvasRef.current.height = videoRef.current.videoHeight;
                }
                console.log("Video file loaded:", file.name);
                resolve();
              })
              .catch(reject);
          }
        };
        videoRef.current.onerror = () => reject(new Error("Video file error"));
      }
    });
  };

  // Switch to camera from file
  const switchToCamera = async () => {
    if (videoRef.current?.src) {
      URL.revokeObjectURL(videoRef.current.src);
      videoRef.current.src = "";
    }
    setVideoSource("camera");
    setVideoFileName(null);
    setIsPlaying(true);
    await setupCamera();
  };

  // Video playback controls
  const togglePlayPause = () => {
    if (!videoRef.current || videoSource !== "file") return;

    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Step forward one frame (~1/30th second)
  const stepForward = () => {
    if (!videoRef.current || videoSource !== "file") return;
    videoRef.current.pause();
    setIsPlaying(false);
    // Clear cache so new frame gets detected
    cachedResultRef.current = null;
    lastVideoTimeRef.current = -1;
    videoRef.current.currentTime = Math.min(
      videoRef.current.currentTime + 1 / 30,
      videoRef.current.duration
    );
  };

  // Step backward one frame (~1/30th second)
  const stepBackward = () => {
    if (!videoRef.current || videoSource !== "file") return;
    videoRef.current.pause();
    setIsPlaying(false);
    // Clear cache so new frame gets detected
    cachedResultRef.current = null;
    lastVideoTimeRef.current = -1;
    videoRef.current.currentTime = Math.max(
      videoRef.current.currentTime - 1 / 30,
      0
    );
  };

  // Handle seek bar change
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current || videoSource !== "file") return;
    const time = parseFloat(e.target.value);
    // Clear cache so new frame gets detected
    cachedResultRef.current = null;
    lastVideoTimeRef.current = -1;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  // Update time display
  useEffect(() => {
    if (videoSource !== "file" || !videoRef.current) return;

    const video = videoRef.current;
    const updateTime = () => setCurrentTime(video.currentTime);
    const updateDuration = () => setVideoDuration(video.duration);

    video.addEventListener("timeupdate", updateTime);
    video.addEventListener("loadedmetadata", updateDuration);

    return () => {
      video.removeEventListener("timeupdate", updateTime);
      video.removeEventListener("loadedmetadata", updateDuration);
    };
  }, [videoSource]);

  // Format time as MM:SS.ms
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms
      .toString()
      .padStart(2, "0")}`;
  };

  const setupCamera = async (facing: FacingMode = facingModeRef.current) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        "Browser API navigator.mediaDevices.getUserMedia not available"
      );
    }

    // Stop existing camera first
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 60, min: 30 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        return new Promise<void>((resolve, reject) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              if (videoRef.current) {
                videoRef.current
                  .play()
                  .then(() => {
                    if (canvasRef.current && videoRef.current) {
                      canvasRef.current.width = videoRef.current.videoWidth;
                      canvasRef.current.height = videoRef.current.videoHeight;
                    }

                    const settings = stream.getVideoTracks()[0]?.getSettings();
                    console.log(
                      "Camera started at",
                      settings?.frameRate || "unknown",
                      "fps"
                    );

                    resolve();
                  })
                  .catch(reject);
              }
            };
            videoRef.current.onerror = () =>
              reject(new Error("Video element error"));
          } else {
            reject(new Error("Video ref not available"));
          }
        });
      }
    } catch (err) {
      console.error("Camera error:", err);
      throw err;
    }
  };

  // Reload model when configuration changes
  useEffect(() => {
    if (initializedRef.current && !isLoading) {
      loadModel();
    }
  }, [modelComplexity]);

  // Switch camera when facing mode changes
  useEffect(() => {
    if (initializedRef.current && !isLoading) {
      setupCamera(facingMode).catch((err) => {
        console.error("Camera switch error:", err);
        setModelError("Failed to switch camera: " + (err as Error).message);
      });
    }
  }, [facingMode]);

  const loadModel = async () => {
    if (!mountedRef.current) return;

    setIsLoading(true);
    setModelError(null);

    if (landmarkerRef.current) {
      landmarkerRef.current.close();
      landmarkerRef.current = null;
    }

    try {
      console.log("Loading MediaPipe vision tasks...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm"
      );

      if (!mountedRef.current) return;

      let modelAssetPath = "";
      if (modelComplexity === "Lite") {
        modelAssetPath =
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
      } else if (modelComplexity === "Full") {
        modelAssetPath =
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
      } else {
        modelAssetPath =
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task";
      }

      console.log("Loading pose landmarker model:", modelComplexity);
      landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelAssetPath,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      if (!mountedRef.current) return;

      console.log("Model loaded successfully");
      setIsLoading(false);
      runFrameLoop();
    } catch (err) {
      console.error("Model loading error:", err);
      if (mountedRef.current) {
        setModelError(
          "Failed to load MediaPipe model: " + (err as Error).message
        );
        setIsLoading(false);
      }
    }
  };

  const runFrameLoop = () => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);

    const loop = async () => {
      if (landmarkerRef.current && videoRef.current && canvasRef.current) {
        if (videoRef.current.videoWidth > 0 && !processingRef.current) {
          processingRef.current = true;
          try {
            const currentVideoTime = videoRef.current.currentTime;
            const isPaused = videoRef.current.paused || !isPlayingRef.current;

            // Check if we're on a paused frame we've already processed
            if (
              isPaused &&
              cachedResultRef.current &&
              Math.abs(currentVideoTime - lastVideoTimeRef.current) < 0.001
            ) {
              // Use cached result - no need to re-detect
              drawResults(cachedResultRef.current);
            } else {
              // New frame or playing - detect and cache
              const startTimeMs = performance.now();
              const result = landmarkerRef.current.detectForVideo(
                videoRef.current,
                startTimeMs
              );

              // Cache result for paused frame
              if (isPaused) {
                cachedResultRef.current = result;
                lastVideoTimeRef.current = currentVideoTime;
              }

              drawResults(result);
              frameCountRef.current++;
            }
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

  // Helper to filter out unwanted parts
  // Keep: ears (5,6), shoulders and below (11+)
  // Filter: nose (0), eyes (1-4), mouth (7-10), fingers (17-22)
  const isExcluded = (index: number) => {
    // Nose, eyes, mouth
    if (index >= 0 && index <= 4) return true;
    if (index >= 7 && index <= 10) return true;
    // Fingers/hands
    if (index >= 17 && index <= 22) return true;
    return false;
  };

  // Exponential Moving Average (EMA) smoothing for landmarks
  const smoothLandmarks = (rawLandmarks: any[][]): any[][] => {
    const alpha = 1 - smoothingFactorRef.current;

    if (
      !smoothedLandmarksRef.current ||
      smoothedLandmarksRef.current.length !== rawLandmarks.length
    ) {
      smoothedLandmarksRef.current = rawLandmarks.map((pose) =>
        pose.map((lm) => ({ ...lm }))
      );
      return smoothedLandmarksRef.current;
    }

    const smoothed = rawLandmarks.map((pose, poseIdx) => {
      const prevPose = smoothedLandmarksRef.current![poseIdx];
      if (!prevPose) return pose.map((lm) => ({ ...lm }));

      return pose.map((lm, lmIdx) => {
        const prev = prevPose[lmIdx];
        if (!prev) return { ...lm };

        return {
          x: alpha * lm.x + (1 - alpha) * prev.x,
          y: alpha * lm.y + (1 - alpha) * prev.y,
          z: alpha * (lm.z ?? 0) + (1 - alpha) * (prev.z ?? 0),
          visibility: lm.visibility,
        };
      });
    });

    smoothedLandmarksRef.current = smoothed;
    return smoothed;
  };

  const drawResults = (result: PoseLandmarkerResult) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !videoRef.current || !canvasRef.current) return;

    const shouldMirror = videoSourceRef.current === "camera";

    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    if (showVideoBackgroundRef.current) {
      ctx.save();
      if (shouldMirror) {
        ctx.scale(-1, 1);
        ctx.translate(-canvasRef.current.width, 0);
      }
      ctx.drawImage(
        videoRef.current,
        0,
        0,
        canvasRef.current.width,
        canvasRef.current.height
      );
      ctx.restore();
    } else {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }

    if (result.landmarks && result.landmarks.length > 0) {
      const smoothed = smoothLandmarks(result.landmarks);
      for (const landmarks of smoothed) {
        // Update 2D canvas
        if (viewModeRef.current === "2d") {
          drawConnectors(ctx, landmarks, shouldMirror);
          drawLandmarks(ctx, landmarks, shouldMirror);
        }
        // Update 3D scene
        if (viewModeRef.current === "3d") {
          updateThreePose(landmarks, shouldMirror);
        }
      }
    }
  };

  const drawLandmarks = (
    ctx: CanvasRenderingContext2D,
    landmarks: any[],
    mirror: boolean
  ) => {
    ctx.fillStyle = "#818cf8";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;

    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    landmarks.forEach((lm, index) => {
      if (isExcluded(index)) return;

      const x = mirror ? (1 - lm.x) * width : lm.x * width;
      const y = lm.y * height;

      // Lower threshold to 0.1 to show partially occluded joints
      if ((lm.visibility ?? 1) > 0.1) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      }
    });
  };

  const drawConnectors = (
    ctx: CanvasRenderingContext2D,
    landmarks: any[],
    mirror: boolean
  ) => {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 3;

    const connections = PoseLandmarker.POSE_CONNECTIONS;
    if (connections) {
      connections.forEach((conn) => {
        if (isExcluded(conn.start) || isExcluded(conn.end)) return;

        const start = landmarks[conn.start];
        const end = landmarks[conn.end];

        // Lower threshold to 0.1 to show partially occluded joints
        if (
          start &&
          end &&
          (start.visibility ?? 1) > 0.1 &&
          (end.visibility ?? 1) > 0.1
        ) {
          const x1 = mirror ? (1 - start.x) * width : start.x * width;
          const y1 = start.y * height;
          const x2 = mirror ? (1 - end.x) * width : end.x * width;
          const y2 = end.y * height;

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      });
    }

    // Draw custom neck line: from ear to midpoint between shoulders
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftEar = landmarks[7]; // Actually landmark 7 is left ear outer
    const rightEar = landmarks[8]; // Actually landmark 8 is right ear outer
    // Use landmarks 5 (left ear) and 6 (right ear) for inner ear
    const ear5 = landmarks[5];
    const ear6 = landmarks[6];

    if (leftShoulder && rightShoulder) {
      // Calculate shoulder midpoint (neck base)
      const neckBaseX = (leftShoulder.x + rightShoulder.x) / 2;
      const neckBaseY = (leftShoulder.y + rightShoulder.y) / 2;
      const neckBaseZ = ((leftShoulder.z ?? 0) + (rightShoulder.z ?? 0)) / 2;

      // Try to use the most visible ear
      let ear = ear5;
      if (ear6 && (ear6.visibility ?? 0) > (ear5?.visibility ?? 0)) {
        ear = ear6;
      }

      if (ear && (ear.visibility ?? 0) > 0.1) {
        const earX = mirror ? (1 - ear.x) * width : ear.x * width;
        const earY = ear.y * height;
        const neckX = mirror ? (1 - neckBaseX) * width : neckBaseX * width;
        const neckY = neckBaseY * height;

        ctx.beginPath();
        ctx.moveTo(earX, earY);
        ctx.lineTo(neckX, neckY);
        ctx.stroke();

        // Draw neck base point
        ctx.fillStyle = "#818cf8";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(neckX, neckY, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      }
    }
  };

  // Initialize Three.js scene
  const initThreeScene = () => {
    if (!threeContainerRef.current || sceneRef.current) return;

    const container = threeContainerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    // Set background based on video mode - null for transparent when video enabled
    scene.background = showVideoBackgroundRef.current
      ? null
      : new THREE.Color(0x111111);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.set(0, 0, 2.5);
    cameraRef.current = camera;

    // Renderer - enable alpha for transparent background
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, showVideoBackgroundRef.current ? 0 : 1);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 1, 1);
    scene.add(directionalLight);

    // Create joint spheres (33 landmarks)
    const jointMaterial = new THREE.MeshStandardMaterial({ color: 0x818cf8 });
    const jointGeometry = new THREE.SphereGeometry(0.02, 16, 16);

    jointSpheresRef.current = [];
    for (let i = 0; i < 33; i++) {
      const sphere = new THREE.Mesh(jointGeometry, jointMaterial);
      sphere.visible = false;
      scene.add(sphere);
      jointSpheresRef.current.push(sphere);
    }

    // Create bone lines
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x22d3ee,
      linewidth: 2,
    });
    boneLinesRef.current = [];

    const connections = PoseLandmarker.POSE_CONNECTIONS;
    if (connections) {
      connections.forEach(() => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3)
        );
        const line = new THREE.Line(geometry, lineMaterial);
        line.visible = false;
        scene.add(line);
        boneLinesRef.current.push(line);
      });
    }

    // Create neck line (ear to shoulder midpoint)
    const neckGeometry = new THREE.BufferGeometry();
    neckGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3)
    );
    const neckLine = new THREE.Line(neckGeometry, lineMaterial);
    neckLine.visible = false;
    scene.add(neckLine);
    neckLineRef.current = neckLine;

    // Create neck base sphere
    const neckSphere = new THREE.Mesh(jointGeometry, jointMaterial);
    neckSphere.visible = false;
    scene.add(neckSphere);
    neckSphereRef.current = neckSphere;

    // Animation loop
    const animate = () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current)
        return;
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      requestAnimationFrame(animate);
    };
    animate();
  };

  // Clean up Three.js
  const cleanupThreeScene = () => {
    if (rendererRef.current) {
      rendererRef.current.dispose();
      if (rendererRef.current.domElement.parentElement) {
        rendererRef.current.domElement.parentElement.removeChild(
          rendererRef.current.domElement
        );
      }
      rendererRef.current = null;
    }
    sceneRef.current = null;
    cameraRef.current = null;
    jointSpheresRef.current = [];
    boneLinesRef.current = [];
    neckLineRef.current = null;
    neckSphereRef.current = null;
  };

  // Update 3D pose
  const updateThreePose = (landmarks: any[], mirror: boolean) => {
    if (!sceneRef.current || !cameraRef.current) return;

    // Apply rotation from touch controls
    if (sceneRef.current.children.length > 0) {
      sceneRef.current.rotation.y = rotation.y * 0.01;
      sceneRef.current.rotation.x = rotation.x * 0.01;
    }

    // Update joint positions
    landmarks.forEach((lm, index) => {
      if (index < jointSpheresRef.current.length) {
        const sphere = jointSpheresRef.current[index];
        // Lower threshold to 0.1 to show partially occluded joints
        if (isExcluded(index) || (lm.visibility ?? 1) < 0.1) {
          sphere.visible = false;
        } else {
          sphere.visible = true;
          // Convert MediaPipe coords to Three.js (centered)
          // Mirror X only for camera feed
          const xPos = mirror ? (0.5 - lm.x) * 2 : (lm.x - 0.5) * 2;
          sphere.position.set(
            xPos,
            (0.5 - lm.y) * 2, // Center Y and invert
            -(lm.z ?? 0) * 2 // Z depth (invert for correct orientation)
          );
        }
      }
    });

    // Update bone lines
    const connections = PoseLandmarker.POSE_CONNECTIONS;
    if (connections) {
      connections.forEach((conn, idx) => {
        if (idx >= boneLinesRef.current.length) return;

        const line = boneLinesRef.current[idx];

        if (isExcluded(conn.start) || isExcluded(conn.end)) {
          line.visible = false;
          return;
        }

        const start = landmarks[conn.start];
        const end = landmarks[conn.end];

        // Lower threshold to 0.1 to show partially occluded joints
        if (
          start &&
          end &&
          (start.visibility ?? 1) > 0.1 &&
          (end.visibility ?? 1) > 0.1
        ) {
          line.visible = true;
          const positions = line.geometry.attributes
            .position as THREE.BufferAttribute;
          const startX = mirror ? (0.5 - start.x) * 2 : (start.x - 0.5) * 2;
          const endX = mirror ? (0.5 - end.x) * 2 : (end.x - 0.5) * 2;
          positions.setXYZ(0, startX, (0.5 - start.y) * 2, -(start.z ?? 0) * 2);
          positions.setXYZ(1, endX, (0.5 - end.y) * 2, -(end.z ?? 0) * 2);
          positions.needsUpdate = true;
        } else {
          line.visible = false;
        }
      });
    }

    // Update neck line (ear to shoulder midpoint)
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const ear5 = landmarks[5];
    const ear6 = landmarks[6];

    if (
      neckLineRef.current &&
      neckSphereRef.current &&
      leftShoulder &&
      rightShoulder
    ) {
      // Calculate shoulder midpoint (neck base)
      const neckBaseX = (leftShoulder.x + rightShoulder.x) / 2;
      const neckBaseY = (leftShoulder.y + rightShoulder.y) / 2;
      const neckBaseZ = ((leftShoulder.z ?? 0) + (rightShoulder.z ?? 0)) / 2;

      // Use most visible ear
      let ear = ear5;
      if (ear6 && (ear6.visibility ?? 0) > (ear5?.visibility ?? 0)) {
        ear = ear6;
      }

      if (ear && (ear.visibility ?? 0) > 0.1) {
        const earX = mirror ? (0.5 - ear.x) * 2 : (ear.x - 0.5) * 2;
        const earY = (0.5 - ear.y) * 2;
        const earZ = -(ear.z ?? 0) * 2;

        const neckX = mirror ? (0.5 - neckBaseX) * 2 : (neckBaseX - 0.5) * 2;
        const neckY = (0.5 - neckBaseY) * 2;
        const neckZ = -neckBaseZ * 2;

        // Update neck line
        neckLineRef.current.visible = true;
        const positions = neckLineRef.current.geometry.attributes
          .position as THREE.BufferAttribute;
        positions.setXYZ(0, earX, earY, earZ);
        positions.setXYZ(1, neckX, neckY, neckZ);
        positions.needsUpdate = true;

        // Update neck sphere
        neckSphereRef.current.visible = true;
        neckSphereRef.current.position.set(neckX, neckY, neckZ);
      } else {
        neckLineRef.current.visible = false;
        neckSphereRef.current.visible = false;
      }
    }
  };

  // Handle 3D view touch/mouse rotation
  const handle3DPointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    lastTouchRef.current = { x: e.clientX, y: e.clientY };
  };

  const handle3DPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - lastTouchRef.current.x;
    const deltaY = e.clientY - lastTouchRef.current.y;
    setRotation((prev) => ({
      x: prev.x + deltaY,
      y: prev.y + deltaX,
    }));
    lastTouchRef.current = { x: e.clientX, y: e.clientY };
  };

  const handle3DPointerUp = () => {
    isDraggingRef.current = false;
  };

  // Initialize/cleanup 3D scene when view mode changes
  useEffect(() => {
    if (viewMode === "3d") {
      // Small delay to ensure container is rendered
      setTimeout(() => initThreeScene(), 100);
    } else {
      cleanupThreeScene();
    }
    return () => {
      if (viewMode === "3d") {
        cleanupThreeScene();
      }
    };
  }, [viewMode]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col text-white overflow-hidden touch-none">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent pt-[calc(1rem+env(safe-area-inset-top))] pointer-events-none">
        <Button
          variant="icon"
          onClick={() => navigate("/tools")}
          className="bg-black/50 backdrop-blur-md border-gray-700 pointer-events-auto"
        >
          <ChevronLeft size={20} />
        </Button>
        <div className="bg-black/50 backdrop-blur-md px-3 py-1 rounded-full border border-gray-700 flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-mono text-blue-400 font-bold uppercase tracking-wider">
            BodyPose
          </span>
        </div>
        <Button
          variant="icon"
          onClick={() => setShowSettings(!showSettings)}
          className={`pointer-events-auto backdrop-blur-md border-gray-700 transition-colors ${
            showSettings
              ? "bg-blue-600 text-white"
              : "bg-black/50 text-gray-300"
          }`}
        >
          <Settings size={20} />
        </Button>
      </div>

      {/* Main Viewport */}
      <div className="relative flex-1 w-full bg-gray-900 flex items-center justify-center overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-sm">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin mb-4" />
            <p className="text-blue-200 font-medium">
              Loading MediaPipe Model...
            </p>
          </div>
        )}

        {modelError ? (
          <div className="text-center p-6 max-w-xs">
            <Camera size={48} className="mx-auto text-red-400 mb-4" />
            <p className="text-red-300">{modelError}</p>
            <Button
              onClick={() => loadModel()}
              className="mt-4"
              variant="secondary"
            >
              Retry
            </Button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className={`absolute inset-0 w-full h-full object-cover ${
                videoSource === "camera" ? "transform scale-x-[-1]" : ""
              } ${
                viewMode === "3d" && showVideoBackground
                  ? "opacity-100"
                  : "opacity-0"
              }`}
              playsInline
              muted
              autoPlay
            />
            {/* 2D Canvas View */}
            <canvas
              ref={canvasRef}
              className={`w-full h-full object-contain ${
                viewMode === "3d" ? "hidden" : ""
              }`}
            />
            {/* 3D View Container */}
            {viewMode === "3d" && (
              <div
                ref={threeContainerRef}
                className="absolute inset-0 w-full h-full"
                onPointerDown={handle3DPointerDown}
                onPointerMove={handle3DPointerMove}
                onPointerUp={handle3DPointerUp}
                onPointerLeave={handle3DPointerUp}
              />
            )}
          </>
        )}

        {/* FPS Counter - stays in corner */}
        <div className="absolute bottom-2 right-2 font-mono text-xs bg-black/60 px-2 py-1 rounded border border-gray-800">
          <span
            className={
              actualFps >= 50
                ? "text-green-400"
                : actualFps >= 30
                ? "text-yellow-400"
                : "text-red-400"
            }
          >
            {actualFps} FPS
          </span>
        </div>
      </div>

      {/* Video Playback Controls - OUTSIDE viewport, only show for file source */}
      {videoSource === "file" && videoFileName && (
        <div className="bg-gray-900 border-t border-gray-800 px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <div className="max-w-lg mx-auto space-y-2">
            {/* Seek bar */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-gray-400 w-14">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min="0"
                max={videoDuration || 100}
                step="0.001"
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <span className="text-[10px] font-mono text-gray-400 w-14 text-right">
                {formatTime(videoDuration)}
              </span>
            </div>
            {/* Playback buttons */}
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={stepBackward}
                className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 transition-colors"
                title="Previous frame"
              >
                <SkipBack size={16} />
              </button>
              <button
                onClick={togglePlayPause}
                className="p-3 rounded-lg bg-blue-600 hover:bg-blue-500 border border-blue-500 text-white transition-colors"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
              </button>
              <button
                onClick={stepForward}
                className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 transition-colors"
                title="Next frame"
              >
                <SkipForward size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Drawer */}
      {showSettings && (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-gray-900/95 backdrop-blur border-t border-gray-800 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl animate-in slide-in-from-bottom duration-200 max-h-[70vh] overflow-y-auto">
          <div className="max-w-md mx-auto space-y-4">
            {/* Video Source */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Video Source
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={switchToCamera}
                  className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    videoSource === "camera"
                      ? "bg-blue-900/30 border-blue-500 text-blue-300"
                      : "bg-gray-800 border-gray-700 text-gray-400"
                  }`}
                >
                  <Camera size={16} />
                  Camera
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    videoSource === "file"
                      ? "bg-blue-900/30 border-blue-500 text-blue-300"
                      : "bg-gray-800 border-gray-700 text-gray-400"
                  }`}
                >
                  <FileVideo size={16} />
                  File
                </button>
              </div>
              {videoFileName && (
                <p className="text-[10px] text-green-400 text-center truncate">
                  📁 {videoFileName}
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Camera Selection - only show when using camera */}
            {videoSource === "camera" && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Camera
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setFacingMode("user")}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                      facingMode === "user"
                        ? "bg-blue-900/30 border-blue-500 text-blue-300"
                        : "bg-gray-800 border-gray-700 text-gray-400"
                    }`}
                  >
                    Front
                  </button>
                  <button
                    onClick={() => setFacingMode("environment")}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                      facingMode === "environment"
                        ? "bg-blue-900/30 border-blue-500 text-blue-300"
                        : "bg-gray-800 border-gray-700 text-gray-400"
                    }`}
                  >
                    Rear
                  </button>
                </div>
              </div>
            )}

            {/* Display Mode Toggle */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Display Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowVideoBackground(false)}
                  className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    !showVideoBackground
                      ? "bg-blue-900/30 border-blue-500 text-blue-300"
                      : "bg-gray-800 border-gray-700 text-gray-400"
                  }`}
                >
                  <VideoOff size={16} />
                  Stickman
                </button>
                <button
                  onClick={() => setShowVideoBackground(true)}
                  className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    showVideoBackground
                      ? "bg-blue-900/30 border-blue-500 text-blue-300"
                      : "bg-gray-800 border-gray-700 text-gray-400"
                  }`}
                >
                  <Video size={16} />
                  Video
                </button>
              </div>
            </div>

            {/* View Mode (2D/3D) */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                View Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setViewMode("2d")}
                  className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    viewMode === "2d"
                      ? "bg-blue-900/30 border-blue-500 text-blue-300"
                      : "bg-gray-800 border-gray-700 text-gray-400"
                  }`}
                >
                  <Square size={16} />
                  2D
                </button>
                <button
                  onClick={() => setViewMode("3d")}
                  className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    viewMode === "3d"
                      ? "bg-blue-900/30 border-blue-500 text-blue-300"
                      : "bg-gray-800 border-gray-700 text-gray-400"
                  }`}
                >
                  <Box size={16} />
                  3D
                </button>
              </div>
              <p className="text-[10px] text-gray-500 text-center">
                {viewMode === "3d"
                  ? "Drag to rotate view"
                  : "Standard flat view"}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Smoothing
              </label>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">Off</span>
                <input
                  type="range"
                  min="0"
                  max="0.9"
                  step="0.1"
                  value={smoothingFactor}
                  onChange={(e) =>
                    setSmoothingFactor(parseFloat(e.target.value))
                  }
                  className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="text-xs text-gray-500">Max</span>
              </div>
              <p className="text-[10px] text-gray-500 text-center">
                Reduces jitter (current: {Math.round(smoothingFactor * 100)}%)
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Model Complexity
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setModelComplexity("Lite")}
                  className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                    modelComplexity === "Lite"
                      ? "bg-blue-900/30 border-blue-500 text-blue-300"
                      : "bg-gray-800 border-gray-700 text-gray-400"
                  }`}
                >
                  Lite
                </button>
                <button
                  onClick={() => setModelComplexity("Full")}
                  className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                    modelComplexity === "Full"
                      ? "bg-blue-900/30 border-blue-500 text-blue-300"
                      : "bg-gray-800 border-gray-700 text-gray-400"
                  }`}
                >
                  Full
                </button>
                <button
                  onClick={() => setModelComplexity("Heavy")}
                  className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                    modelComplexity === "Heavy"
                      ? "bg-blue-900/30 border-blue-500 text-blue-300"
                      : "bg-gray-800 border-gray-700 text-gray-400"
                  }`}
                >
                  Heavy
                </button>
              </div>
              <p className="text-[10px] text-gray-500 text-center">
                Lite = fastest, Heavy = most accurate
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BodyPose;
