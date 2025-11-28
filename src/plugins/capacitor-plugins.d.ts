/**
 * TypeScript definitions for Capacitor native plugins
 */

export interface SignalingServerPlugin {
  startServer(): Promise<{ running: boolean; port: number }>;
  stopServer(): Promise<{ running: boolean }>;
  getServerStatus(): Promise<{ running: boolean; port: number }>;
}

export interface DiscoveryPlugin {
  startBroadcast(options: { serviceName?: string; port?: number }): Promise<{ serviceName: string }>;
  stopBroadcast(): Promise<void>;
  scanForHosts(): Promise<{ scanning: boolean }>;
  stopScan(): Promise<void>;
  getDiscoveredHosts(): Promise<{ hosts: Array<{ name: string; ip: string; port: number }> }>;
  getLocalIP(): Promise<{ ip: string }>;
  addListener(
    eventName: 'hostDiscovered' | 'hostLost',
    listenerFunc: (event: { name: string; ip?: string; port?: number }) => void
  ): Promise<any>;
  removeAllListeners(): Promise<void>;
}

export interface ForegroundServicePlugin {
  startForegroundService(options?: { title?: string; message?: string }): Promise<{ running: boolean }>;
  stopForegroundService(): Promise<{ running: boolean }>;
  getServiceStatus(): Promise<{ running: boolean }>;
}

declare module '@capacitor/core' {
  interface PluginRegistry {
    SignalingServer: SignalingServerPlugin;
    Discovery: DiscoveryPlugin;
    ForegroundService: ForegroundServicePlugin;
  }
}
