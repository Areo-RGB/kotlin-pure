
import React, { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Button } from './Ui/Button';

interface MotionTripwireProps {
  isActive: boolean;
  onTrigger: () => void;
  color?: 'red' | 'green' | 'blue'; // Visual indicator color
  showDebug?: boolean;
  blurRadius?: number;
  cooldownMs?: number;
  sensitivity?: number; // Pixel difference threshold (0-255)
  tripwireWidth?: number;
  tripwireHeight?: number; // Percentage of screen height (0-100)
  enableTorch?: boolean;
  allowVerticalDrag?: boolean;
}

export const MotionTripwire: React.FC<MotionTripwireProps> = ({ 
  isActive, 
  onTrigger, 
  color = 'red',
  blurRadius = 4,
  cooldownMs = 1000,
  sensitivity = 30,
  tripwireWidth = 10,
  tripwireHeight = 100,
  enableTorch = false,
  allowVerticalDrag = false
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number>(0);
  const prevFrameDataRef = useRef<Uint8ClampedArray | null>(null);
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
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
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
         track.applyConstraints({ advanced: [{ torch: false }] as any }).catch(() => {});
      }
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  // Torch Logic
  useEffect(() => {
    if (streamRef.current && hasPermission) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        // Attempt to toggle torch
        const applyTorch = async () => {
           try {
             const capabilities = (track.getCapabilities && track.getCapabilities()) as any || {};
             await track.applyConstraints({
                advanced: [{ torch: enableTorch }] as any
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
  const getRenderDimensions = (rect: DOMRect, videoW: number, videoH: number) => {
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
    const { renderW, renderH, offsetX, offsetY } = getRenderDimensions(rect, videoW, videoH);
    
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const zoneScreenX = (tripwireXRef.current * renderW) + offsetX;
    const zoneScreenY = (tripwireYRef.current * renderH) + offsetY;
    
    // Zone height on screen in pixels
    const zoneScreenH = (tripwireHeight / 100) * renderH;

    // Hit test: Check if touch is within horizontal tolerance AND vertical bounds
    const hitX = Math.abs(clickX - zoneScreenX) < DRAG_HIT_TOLERANCE;
    const hitY = Math.abs(clickY - zoneScreenY) < (zoneScreenH / 2 + DRAG_HIT_TOLERANCE);

    if (hitX && hitY) {
      isDraggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !containerRef.current || !videoRef.current) return;
    const videoW = videoRef.current.videoWidth;
    const videoH = videoRef.current.videoHeight;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    const { renderW, renderH, offsetX, offsetY } = getRenderDimensions(rect, videoW, videoH);
    
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
  };

  const processFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw with Blur
        ctx.filter = `blur(${blurRadius}px)`;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.filter = 'none';

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
        const activeColor = color === 'red' ? '#ef4444' : color === 'blue' ? '#3b82f6' : '#10b981';
        const overlayColor = isActive ? activeColor : '#6b7280'; // Gray if inactive
        
        // Draw Overlay
        ctx.fillStyle = isActive 
          ? (color === 'red' ? 'rgba(239, 68, 68, 0.3)' : color === 'blue' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(16, 185, 129, 0.3)')
          : 'rgba(107, 114, 128, 0.3)';
        
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
        ctx.fillStyle = isDraggingRef.current ? '#ffffff' : overlayColor;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Motion Logic
        if (isActive) {
          const imageData = ctx.getImageData(zoneX, zoneY, tripwireWidth, zoneH);
          const data = imageData.data;
          
          if (prevFrameDataRef.current && prevFrameDataRef.current.length === data.length) {
            let changedPixels = 0;
            const totalPixels = data.length / 4;

            for (let i = 0; i < data.length; i += 4) {
              const rDiff = Math.abs(data[i] - prevFrameDataRef.current[i]);
              const gDiff = Math.abs(data[i + 1] - prevFrameDataRef.current[i + 1]);
              const bDiff = Math.abs(data[i + 2] - prevFrameDataRef.current[i + 2]);
              if (rDiff + gDiff + bDiff > sensitivity * 3) {
                changedPixels++;
              }
            }

            const motionPercent = changedPixels / totalPixels;
            const now = Date.now();
            const isCooldown = now - lastTriggerRef.current < cooldownMs;

            if (motionPercent > PIXEL_COUNT_THRESHOLD && !isCooldown && !isDraggingRef.current) {
              lastTriggerRef.current = now;
              onTrigger();
            }
          }
          prevFrameDataRef.current = new Uint8ClampedArray(data);
        }
      }
    }
    requestRef.current = requestAnimationFrame(processFrame);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(processFrame);
    return () => cancelAnimationFrame(requestRef.current);
  }, [isActive, color, blurRadius, cooldownMs, sensitivity, tripwireWidth, tripwireHeight]);

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
