/**
 * TypeScript definitions for Capacitor native plugins
 */

export interface SignalingServerPlugin {
  startServer(): Promise<{ running: boolean; port: number }>;
  stopServer(): Promise<{ running: boolean }>;
  getServerStatus(): Promise<{ running: boolean; port: number }>;
}

export interface DiscoveryPlugin {
  startBroadcast(options: {
    serviceName?: string;
    port?: number;
  }): Promise<{ serviceName: string }>;
  stopBroadcast(): Promise<void>;
  scanForHosts(): Promise<{ scanning: boolean }>;
  stopScan(): Promise<void>;
  getDiscoveredHosts(): Promise<{
    hosts: Array<{ name: string; ip: string; port: number }>;
  }>;
  getLocalIP(): Promise<{ ip: string }>;
  addListener(
    eventName: "hostDiscovered" | "hostLost",
    listenerFunc: (event: { name: string; ip?: string; port?: number }) => void
  ): Promise<any>;
  removeAllListeners(): Promise<void>;
}

export interface ForegroundServicePlugin {
  startForegroundService(options?: {
    title?: string;
    message?: string;
  }): Promise<{ running: boolean }>;
  stopForegroundService(): Promise<{ running: boolean }>;
  getServiceStatus(): Promise<{ running: boolean }>;
}

// Camera Preview Plugin types (from @capgo/camera-preview)
export interface CameraPreviewOptions {
  parent?: string;
  className?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  toBack?: boolean;
  paddingBottom?: number;
  rotateWhenOrientationChanged?: boolean;
  position?: "front" | "rear";
  storeToFile?: boolean;
  disableExifHeaderStripping?: boolean;
  disableAudio?: boolean;
  lockAndroidOrientation?: boolean;
  enableOpacity?: boolean;
  aspectRatio?: "4:3" | "16:9" | "fill";
}

export interface CameraSampleOptions {
  quality?: number;
}

export interface CameraPreviewPlugin {
  start(
    options: CameraPreviewOptions
  ): Promise<{ width: number; height: number; x: number; y: number }>;
  stop(): Promise<void>;
  capture(options?: {
    quality?: number;
    width?: number;
    height?: number;
  }): Promise<{ value: string }>;
  captureSample(options?: CameraSampleOptions): Promise<{ value: string }>;
  flip(): Promise<void>;
  setFlashMode(options: {
    flashMode: "off" | "on" | "auto" | "torch";
  }): Promise<void>;
  isRunning(): Promise<{ isRunning: boolean }>;
  getAvailableDevices(): Promise<{
    devices: Array<{ deviceId: string; label: string; position: string }>;
  }>;
}

declare module "@capacitor/core" {
  interface PluginRegistry {
    SignalingServer: SignalingServerPlugin;
    Discovery: DiscoveryPlugin;
    ForegroundService: ForegroundServicePlugin;
    CameraPreview: CameraPreviewPlugin;
  }
}
