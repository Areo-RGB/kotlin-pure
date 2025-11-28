

export interface Player {
  name: string;
  score: number;
}

export interface LobbyData {
  players: Player[];
  lastUpdated: number;
}

export type MotionGateRole = 'START' | 'FINISH' | 'DISPLAY' | 'UNASSIGNED' | 'GAME';

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

export const ANDERSON_NAMES = [
  'Eray',
  'Silas',
  'Finley',
  'Kayden',
  'Erik',
  'Arvid',
  'Lion',
  'Jakob',
  'Paul',
  'Lennox',
  'Levi',
  'Lasse',
  'Metin',
  'Berat'
];