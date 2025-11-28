

export type MotionGateRole = 'START' | 'FINISH' | 'SPLIT' | 'DISPLAY' | 'UNASSIGNED' | 'GAME';

export interface MotionGateDevice {
  id: string;
  name: string;
  role: MotionGateRole;
  lastSeen: number;
  isOnline?: boolean; // computed on client
}

export interface MotionGateRun {
  runId: string;
  startTime: number;
  finishTime: number;
}

export interface MotionGateSession {
  status: 'IDLE' | 'RUNNING' | 'FINISHED';
  startTime: number | null;
  finishTime: number | null;
  runId: string; 
  devices?: Record<string, MotionGateDevice>;
  history?: Record<string, MotionGateRun>;
}