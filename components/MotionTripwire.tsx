import React, { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";

interface MotionTripwireProps {
  isActive: boolean;
  onTrigger: () => void;
  color?: "red" | "green" | "blue"; // Visual indicator color
  showDebug?: boolean;
  blurRadius?: number;
  cooldownMs?: number;
  sensitivity?: number; // Pixel difference threshold (0-255)
  tripwireWidth?: number;
  tripwireHeight?: number; // Percentage of screen height (0-100)
  enableTorch?: boolean;
  allowVerticalDrag?: boolean;
  useWebGL?: boolean; // Enable GPU-accelerated motion detection
}

// WebGL Shaders for GPU-accelerated motion detection
const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const DIFF_FRAGMENT_SHADER = `
  precision mediump float;
  uniform sampler2D u_currentFrame;
  uniform sampler2D u_prevFrame;
  uniform float u_sensitivity;
  uniform vec4 u_zone; // x, y, width, height (normalized 0-1, Top-Down)
  varying vec2 v_texCoord;

  void main() {
    // Check if pixel is in zone
    // v_texCoord is (0,0) Top-Left to (1,1) Bottom-Right based on buffer
    bool inZone = v_texCoord.x >= u_zone.x &&
                  v_texCoord.x <= u_zone.x + u_zone.z &&
                  v_texCoord.y >= u_zone.y &&
                  v_texCoord.y <= u_zone.y + u_zone.w;

    if (!inZone) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }

    vec4 current = texture2D(u_currentFrame, v_texCoord);
    vec4 prev = texture2D(u_prevFrame, v_texCoord);

    float diff = abs(current.r - prev.r) + abs(current.g - prev.g) + abs(current.b - prev.b);
    float threshold = u_sensitivity / 255.0 * 3.0;

    // Output 1.0 if motion detected, 0.0 otherwise
    float motion = diff > threshold ? 1.0 : 0.0;
    gl_FragColor = vec4(motion, motion, motion, 1.0);
  }
`;

// WebGL helper class for motion detection
class WebGLMotionDetector {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private currentTexture: WebGLTexture | null = null;
  private prevTexture: WebGLTexture | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private outputTexture: WebGLTexture | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private canvas: HTMLCanvasElement;
  private width = 0;
  private height = 0;
  private isInitialized = false;
  private frameCount = 0; // Track frames to skip first comparison

  constructor() {
    this.canvas = document.createElement("canvas");
  }

  init(width: number, height: number): boolean {
    if (this.isInitialized && this.width === width && this.height === height) {
      return true;
    }

    // Reset frame count on re-init
    this.frameCount = 0;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;

    this.gl = this.canvas.getContext("webgl", {
      preserveDrawingBuffer: true,
      antialias: false,
      depth: false,
      stencil: false,
    });

    if (!this.gl) {
      console.warn("WebGL not available, falling back to CPU");
      return false;
    }

    // Compile shaders
    const vertexShader = this.compileShader(
      this.gl.VERTEX_SHADER,
      VERTEX_SHADER
    );
    const fragmentShader = this.compileShader(
      this.gl.FRAGMENT_SHADER,
      DIFF_FRAGMENT_SHADER
    );

    if (!vertexShader || !fragmentShader) return false;

    // Create program
    this.program = this.gl.createProgram()!;
    this.gl.attachShader(this.program, vertexShader);
    this.gl.attachShader(this.program, fragmentShader);
    this.gl.linkProgram(this.program);

    if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
      console.error(
        "Program link failed:",
        this.gl.getProgramInfoLog(this.program)
      );
      return false;
    }

    // Create buffers
    // Full screen quad
    this.positionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      this.gl.STATIC_DRAW
    );

    // Texture Coordinates: (0,0) Top-Left, (1,1) Bottom-Right
    // Maps to Vertex Buffer order: BL, BR, TL, TR
    // BL (-1,-1) -> (0,1)
    // BR (1,-1) -> (1,1)
    // TL (-1,1) -> (0,0)
    // TR (1,1) -> (1,0)
    this.texCoordBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]),
      this.gl.STATIC_DRAW
    );

    // Create textures
    this.currentTexture = this.createTexture();
    this.prevTexture = this.createTexture();
    this.outputTexture = this.createTexture();

    // Allocate Output Texture (Once)
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.outputTexture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      width,
      height,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      null
    );

    // Create framebuffer for reading results
    this.framebuffer = this.gl.createFramebuffer();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    this.gl.framebufferTexture2D(
      this.gl.FRAMEBUFFER,
      this.gl.COLOR_ATTACHMENT0,
      this.gl.TEXTURE_2D,
      this.outputTexture,
      0
    );

    this.isInitialized = true;
    return true;
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;
    const shader = this.gl.createShader(type)!;
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error("Shader compile failed:", this.gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  private createTexture(): WebGLTexture | null {
    if (!this.gl) return null;
    const texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_S,
      this.gl.CLAMP_TO_EDGE
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_T,
      this.gl.CLAMP_TO_EDGE
    );
    // Use NEAREST to avoid interpolation noise at edges
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.NEAREST
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MAG_FILTER,
      this.gl.NEAREST
    );
    return texture;
  }

  detectMotion(
    source: HTMLVideoElement | HTMLCanvasElement,
    zone: { x: number; y: number; width: number; height: number }, // Pixel Coords (Top-Left Origin)
    sensitivity: number
  ): number {
    if (!this.gl || !this.program || !this.isInitialized) return 0;

    const gl = this.gl;

    // Swap textures (current becomes prev)
    const temp = this.prevTexture;
    this.prevTexture = this.currentTexture;
    this.currentTexture = temp;

    // Upload current frame to texture
    gl.bindTexture(gl.TEXTURE_2D, this.currentTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    // Need at least 2 frames before we can detect motion
    this.frameCount++;
    if (this.frameCount < 2) {
      // Initialize prevTexture with current frame too
      gl.bindTexture(gl.TEXTURE_2D, this.prevTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      return 0;
    }

    // Use program
    gl.useProgram(this.program);

    // Set up attributes
    const positionLoc = gl.getAttribLocation(this.program, "a_position");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const texCoordLoc = gl.getAttribLocation(this.program, "a_texCoord");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

    // Set uniforms
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.currentTexture);
    gl.uniform1i(gl.getUniformLocation(this.program, "u_currentFrame"), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.prevTexture);
    gl.uniform1i(gl.getUniformLocation(this.program, "u_prevFrame"), 1);

    gl.uniform1f(
      gl.getUniformLocation(this.program, "u_sensitivity"),
      sensitivity
    );

    // Calculate Normalized Zone for Shader (Top-Down)
    gl.uniform4f(
      gl.getUniformLocation(this.program, "u_zone"),
      zone.x / this.width,
      zone.y / this.height,
      zone.width / this.width,
      zone.height / this.height
    );

    // Bind Output & Framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.width, this.height);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Read Pixels
    // Framebuffer is Bottom-Up. JS Zone is Top-Down.
    // Convert Top-Down Zone Y to Bottom-Up Read Y.
    const readY = Math.max(0, this.height - (zone.y + zone.height));
    const readW = Math.max(1, Math.floor(zone.width));
    const readH = Math.max(1, Math.floor(zone.height));

    const pixels = new Uint8Array(readW * readH * 4);

    // Read only the zone area to save bandwidth
    gl.readPixels(
      Math.floor(zone.x),
      Math.floor(readY),
      readW,
      readH,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels
    );

    // Count motion pixels (Red channel > 128)
    // Shader outputs 1.0 (255) for motion, 0.0 (0) for none.
    let motionPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 128) motionPixels++;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return motionPixels / (readW * readH);
  }

  dispose() {
    if (this.gl) {
      if (this.program) this.gl.deleteProgram(this.program);
      if (this.currentTexture) this.gl.deleteTexture(this.currentTexture);
      if (this.prevTexture) this.gl.deleteTexture(this.prevTexture);
      if (this.outputTexture) this.gl.deleteTexture(this.outputTexture);
      if (this.framebuffer) this.gl.deleteFramebuffer(this.framebuffer);
      if (this.positionBuffer) this.gl.deleteBuffer(this.positionBuffer);
      if (this.texCoordBuffer) this.gl.deleteBuffer(this.texCoordBuffer);
    }
    this.isInitialized = false;
    this.frameCount = 0;
  }

  reset() {
    this.frameCount = 0;
  }
}

export const MotionTripwire: React.FC<MotionTripwireProps> = ({
  isActive,
  onTrigger,
  color = "red",
  blurRadius = 4,
  cooldownMs = 1000,
  sensitivity = 30,
  tripwireWidth = 10,
  tripwireHeight = 100,
  enableTorch = false,
  allowVerticalDrag = false,
  useWebGL = true,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number>(0);
  const prevFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  const webglDetectorRef = useRef<WebGLMotionDetector | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  // Dragging State
  const tripwireXRef = useRef(0.5); // 0.0 to 1.0
  const tripwireYRef = useRef(0.5); // 0.0 to 1.0 (Default center)
  const isDraggingRef = useRef(false);

  // Logic Constants
  const PIXEL_COUNT_THRESHOLD = 0.1;
  const DRAG_HIT_TOLERANCE = Math.max(40, tripwireWidth);

  const lastTriggerRef = useRef<number>(0);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setHasPermission(true);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setHasPermission(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      // Turn off torch before stopping if possible
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        track
          .applyConstraints({ advanced: [{ torch: false }] as any })
          .catch(() => {});
      }
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    // Cleanup WebGL
    if (webglDetectorRef.current) {
      webglDetectorRef.current.dispose();
      webglDetectorRef.current = null;
    }
  };

  useEffect(() => {
    // Initialize WebGL detector
    webglDetectorRef.current = new WebGLMotionDetector();
    startCamera();
    return () => stopCamera();
  }, []);

  // Reset detectors when isActive changes to true (arming)
  // This prevents false triggers from stale frame comparisons
  useEffect(() => {
    if (isActive) {
      // Reset WebGL detector
      if (webglDetectorRef.current) {
        webglDetectorRef.current.reset();
      }
      // Reset CPU fallback
      prevFrameDataRef.current = null;
      // Set cooldown to prevent immediate trigger
      lastTriggerRef.current = Date.now();
    }
  }, [isActive]);

  // Torch Logic
  useEffect(() => {
    if (streamRef.current && hasPermission) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        // Attempt to toggle torch
        const applyTorch = async () => {
          try {
            const capabilities =
              ((track.getCapabilities && track.getCapabilities()) as any) || {};
            await track.applyConstraints({
              advanced: [{ torch: enableTorch }] as any,
            });
          } catch (e) {
            console.warn("Flashlight control failed or not supported:", e);
          }
        };
        applyTorch();
      }
    }
  }, [enableTorch, hasPermission]);

  // Helpers for drag mapping (Supports object-cover logic)
  const getRenderDimensions = (
    rect: DOMRect,
    videoW: number,
    videoH: number
  ) => {
    const containerW = rect.width;
    const containerH = rect.height;
    const screenAspect = containerW / containerH;
    const videoAspect = videoW / videoH;

    let renderW, renderH, offsetX, offsetY;

    if (screenAspect > videoAspect) {
      // Screen is wider than video (Cover: fit width, crop height)
      renderW = containerW;
      renderH = containerW / videoAspect;
      offsetX = 0;
      offsetY = (containerH - renderH) / 2;
    } else {
      // Screen is taller than video (Cover: fit height, crop width)
      renderH = containerH;
      renderW = containerH * videoAspect;
      offsetX = (containerW - renderW) / 2;
      offsetY = 0;
    }
    return { renderW, renderH, offsetX, offsetY };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current || !videoRef.current) return;
    const videoW = videoRef.current.videoWidth;
    const videoH = videoRef.current.videoHeight;
    if (!videoW || !videoH) return;

    const rect = containerRef.current.getBoundingClientRect();
    const { renderW, renderH, offsetX, offsetY } = getRenderDimensions(
      rect,
      videoW,
      videoH
    );

    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const zoneScreenX = tripwireXRef.current * renderW + offsetX;
    const zoneScreenY = tripwireYRef.current * renderH + offsetY;

    // Zone height on screen in pixels
    const zoneScreenH = (tripwireHeight / 100) * renderH;

    // Hit test: Check if touch is within horizontal tolerance AND vertical bounds
    const hitX = Math.abs(clickX - zoneScreenX) < DRAG_HIT_TOLERANCE;
    const hitY =
      Math.abs(clickY - zoneScreenY) < zoneScreenH / 2 + DRAG_HIT_TOLERANCE;

    if (hitX && hitY) {
      isDraggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !containerRef.current || !videoRef.current)
      return;
    const videoW = videoRef.current.videoWidth;
    const videoH = videoRef.current.videoHeight;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const { renderW, renderH, offsetX, offsetY } = getRenderDimensions(
      rect,
      videoW,
      videoH
    );

    const normalizedX = (clickX - offsetX) / renderW;
    tripwireXRef.current = Math.max(0, Math.min(1, normalizedX));

    if (allowVerticalDrag) {
      const normalizedY = (clickY - offsetY) / renderH;
      tripwireYRef.current = Math.max(0, Math.min(1, normalizedY));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    prevFrameDataRef.current = null;
    // Reset WebGL detector to avoid false triggers after drag
    if (webglDetectorRef.current) {
      webglDetectorRef.current.reset();
    }
  };

  const processFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw with Blur for display & motion detection smoothing
        ctx.filter = `blur(${blurRadius}px)`;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.filter = "none";

        // Calculate Zone Position
        const zoneCenterX = Math.floor(tripwireXRef.current * canvas.width);
        const zoneX = zoneCenterX - Math.floor(tripwireWidth / 2);

        // Calculate Height & Vertical Position based on Y ref
        const fullH = canvas.height;
        const zoneH = Math.floor((fullH * tripwireHeight) / 100);

        // Center Y based on ref
        let zoneCenterY = Math.floor(tripwireYRef.current * fullH);

        // Clamp Y so zone stays within canvas
        const minCenterY = Math.floor(zoneH / 2);
        const maxCenterY = fullH - Math.floor(zoneH / 2);
        zoneCenterY = Math.max(minCenterY, Math.min(maxCenterY, zoneCenterY));

        const zoneY = zoneCenterY - Math.floor(zoneH / 2);

        // Colors
        const activeColor =
          color === "red"
            ? "#ef4444"
            : color === "blue"
            ? "#3b82f6"
            : "#10b981";
        const overlayColor = isActive ? activeColor : "#6b7280"; // Gray if inactive

        // Draw Overlay
        ctx.fillStyle = isActive
          ? color === "red"
            ? "rgba(239, 68, 68, 0.3)"
            : color === "blue"
            ? "rgba(59, 130, 246, 0.3)"
            : "rgba(16, 185, 129, 0.3)"
          : "rgba(107, 114, 128, 0.3)";

        ctx.fillRect(zoneX, zoneY, tripwireWidth, zoneH);
        ctx.fillStyle = overlayColor;

        // Draw Edges
        ctx.fillRect(zoneX - 1, zoneY, 1, zoneH);
        ctx.fillRect(zoneX + tripwireWidth, zoneY, 1, zoneH);
        ctx.fillRect(zoneX, zoneY - 1, tripwireWidth, 1);
        ctx.fillRect(zoneX, zoneY + zoneH, tripwireWidth, 1);

        // Handle (Circle)
        ctx.beginPath();
        ctx.arc(zoneCenterX, zoneCenterY, 12, 0, 2 * Math.PI);
        ctx.fillStyle = isDraggingRef.current ? "#ffffff" : overlayColor;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Motion Logic
        if (isActive) {
          const now = Date.now();
          const isCooldown = now - lastTriggerRef.current < cooldownMs;

          if (!isCooldown && !isDraggingRef.current) {
            let motionPercent = 0;
            let webglSucceeded = false;

            // Try WebGL first if enabled
            const detector = webglDetectorRef.current;
            if (detector && useWebGL) {
              const initialized = detector.init(canvas.width, canvas.height);
              if (initialized) {
                // Pass the BLURRED canvas instead of raw video to reduce noise
                // Pass pixel coordinates for accurate zone detection
                motionPercent = detector.detectMotion(
                  canvas,
                  { x: zoneX, y: zoneY, width: tripwireWidth, height: zoneH },
                  sensitivity
                );
                webglSucceeded = true;
              }
            }

            // CPU fallback (when WebGL disabled or failed)
            if (!webglSucceeded) {
              const imageData = ctx.getImageData(
                zoneX,
                zoneY,
                tripwireWidth,
                zoneH
              );
              const data = imageData.data;

              if (
                prevFrameDataRef.current &&
                prevFrameDataRef.current.length === data.length
              ) {
                let changedPixels = 0;
                const totalPixels = data.length / 4;

                for (let i = 0; i < data.length; i += 4) {
                  const rDiff = Math.abs(data[i] - prevFrameDataRef.current[i]);
                  const gDiff = Math.abs(
                    data[i + 1] - prevFrameDataRef.current[i + 1]
                  );
                  const bDiff = Math.abs(
                    data[i + 2] - prevFrameDataRef.current[i + 2]
                  );
                  if (rDiff + gDiff + bDiff > sensitivity * 3) {
                    changedPixels++;
                  }
                }

                motionPercent = changedPixels / totalPixels;
              }
              prevFrameDataRef.current = new Uint8ClampedArray(data);
            }

            if (motionPercent > PIXEL_COUNT_THRESHOLD) {
              lastTriggerRef.current = now;
              onTrigger();
              // Reset detectors after trigger to require NEW motion for next trigger
              if (webglDetectorRef.current) {
                webglDetectorRef.current.reset();
              }
              prevFrameDataRef.current = null;
            }
          }
        }
      }
    }
    requestRef.current = requestAnimationFrame(processFrame);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(processFrame);
    return () => cancelAnimationFrame(requestRef.current);
  }, [
    isActive,
    color,
    blurRadius,
    cooldownMs,
    sensitivity,
    tripwireWidth,
    tripwireHeight,
  ]);

  if (hasPermission === false) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center">
        <div>
          <Camera size={48} className="mx-auto text-gray-500 mb-4" />
          <p className="text-gray-400">Camera permission required.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center bg-black touch-none overflow-hidden"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none"
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      />
    </div>
  );
};
