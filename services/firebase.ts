
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, get, update, runTransaction, child, remove } from 'firebase/database';
import { Player, ANDERSON_NAMES, MotionGateRole, MotionGateRun } from '../types';

// Configuration using the provided Realtime Database URL
const firebaseConfig = {
  databaseURL: "https://timer-app-1751097782-default-rtdb.europe-west1.firebasedatabase.app/",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- Time Synchronization ---
let serverTimeOffset = 0;
const offsetRef = ref(db, ".info/serverTimeOffset");
onValue(offsetRef, (snap) => {
  serverTimeOffset = snap.val() || 0;
});

/**
 * Returns the estimated time on the server. 
 * Essential for synchronizing multiple devices with different system clocks.
 */
export const getServerTime = () => {
  return Date.now() + serverTimeOffset;
};

// --- Refs ---
export const getLobbyRef = (lobbyId: string) => ref(db, `lobbies/${lobbyId}`);
export const getMotionGateRef = (lobbyId: string) => ref(db, `lobbies/${lobbyId}/motionGate`);

// --- Anderson Logic ---

/**
 * Initializes a lobby if it doesn't exist with the default player list.
 * Checks existence first (requires connection or cache).
 */
export const joinLobby = async (lobbyId: string): Promise<boolean> => {
  const lobbyRef = getLobbyRef(lobbyId);
  const snapshot = await get(lobbyRef);

  if (!snapshot.exists()) {
    await initializeLobbyWithDefaults(lobbyId);
  }
  return true;
};

/**
 * Directly initializes the lobby with default players.
 * Uses runTransaction to avoid overwriting sibling nodes (like motionGate).
 */
export const initializeLobbyWithDefaults = async (lobbyId: string) => {
  const lobbyRef = getLobbyRef(lobbyId);
  const initialPlayers: Player[] = ANDERSON_NAMES.map(name => ({
    name,
    score: 0
  }));
  
  await runTransaction(lobbyRef, (current) => {
    // If no data exists, create it
    if (!current) {
      return {
        players: initialPlayers,
        createdAt: Date.now()
      };
    }
    // If data exists but players are missing, add them without wiping other properties
    if (!current.players) {
      return {
        ...current,
        players: initialPlayers
      };
    }
    // Already valid
    return undefined;
  });
};

/**
 * Updates a single player's score.
 */
export const updatePlayerScore = async (lobbyId: string, playerName: string, delta: number) => {
  const lobbyRef = getLobbyRef(lobbyId);
  
  await runTransaction(lobbyRef, (currentData) => {
    if (currentData && currentData.players) {
      const updatedPlayers = currentData.players.map((p: Player) => {
        if (p.name === playerName) {
          return { ...p, score: p.score + delta };
        }
        return p;
      });
      return { ...currentData, players: updatedPlayers, lastUpdated: Date.now() };
    }
    return currentData;
  });
};

/**
 * Updates scores for all players, optionally filtered by a list of names.
 * If includedNames is provided, only players in that list will be updated.
 */
export const updateAllScores = async (lobbyId: string, delta: number, includedNames?: string[]) => {
  const lobbyRef = getLobbyRef(lobbyId);
  
  await runTransaction(lobbyRef, (currentData) => {
    if (currentData && currentData.players) {
      const updatedPlayers = currentData.players.map((p: Player) => {
        // If filter is provided and player is not in it, skip update
        if (includedNames && !includedNames.includes(p.name)) {
          return p;
        }
        return {
          ...p,
          score: p.score + delta
        };
      });
      return { ...currentData, players: updatedPlayers, lastUpdated: Date.now() };
    }
    return currentData;
  });
};

// --- Motion Gate Logic ---

export const initMotionGateSession = async (lobbyId: string) => {
  const mgRef = getMotionGateRef(lobbyId);
  
  await runTransaction(mgRef, (current) => {
    // If completely empty, initialize
    if (current === null) {
       return {
        status: 'IDLE',
        startTime: null,
        finishTime: null,
        runId: Date.now().toString(),
        devices: {}
      };
    }
    
    // If exists (maybe implicitly created by device registration), ensure status fields exist
    // preventing accidental wipes if only 'devices' child exists
    if (!current.status) {
        return {
            ...current,
            status: 'IDLE',
            startTime: null,
            finishTime: null,
            runId: current.runId || Date.now().toString(),
        };
    }
    
    return undefined;
  });
};

export const registerDevice = async (lobbyId: string, deviceId: string, name: string) => {
  const deviceRef = ref(db, `lobbies/${lobbyId}/motionGate/devices/${deviceId}`);
  // We don't want to overwrite the role if it's already set
  await runTransaction(deviceRef, (current) => {
    if (current) {
      return { ...current, name, lastSeen: getServerTime() };
    }
    return {
      id: deviceId,
      name,
      role: 'UNASSIGNED',
      lastSeen: getServerTime()
    };
  });
};

export const heartbeatDevice = async (lobbyId: string, deviceId: string) => {
  const lastSeenRef = ref(db, `lobbies/${lobbyId}/motionGate/devices/${deviceId}/lastSeen`);
  await set(lastSeenRef, getServerTime());
};

export const updateDeviceRole = async (lobbyId: string, deviceId: string, role: MotionGateRole) => {
  const roleRef = ref(db, `lobbies/${lobbyId}/motionGate/devices/${deviceId}/role`);
  await set(roleRef, role);
};

export const removeDevice = async (lobbyId: string, deviceId: string) => {
  const deviceRef = ref(db, `lobbies/${lobbyId}/motionGate/devices/${deviceId}`);
  await remove(deviceRef);
};

export const triggerMotionStart = async (lobbyId: string, timestamp: number) => {
  const mgRef = getMotionGateRef(lobbyId);
  await runTransaction(mgRef, (current) => {
    if (!current || current.status === 'IDLE' || current.status === 'FINISHED') {
      return {
        ...current,
        status: 'RUNNING',
        startTime: timestamp,
        finishTime: null,
        runId: Date.now().toString()
      };
    }
    return current;
  });
};

export const triggerMotionFinish = async (lobbyId: string, timestamp: number) => {
  const mgRef = getMotionGateRef(lobbyId);
  await runTransaction(mgRef, (current) => {
    if (current && current.status === 'RUNNING') {
      const newRun: MotionGateRun = {
          runId: current.runId,
          startTime: current.startTime,
          finishTime: timestamp
      };
      return {
        ...current,
        status: 'FINISHED',
        finishTime: timestamp,
        history: {
            ...(current.history || {}),
            [current.runId]: newRun
        }
      };
    }
    return current;
  });
};

export const resetMotionGate = async (lobbyId: string) => {
    const mgRef = getMotionGateRef(lobbyId);
    await update(mgRef, {
        status: 'IDLE',
        startTime: null,
        finishTime: null
    });
};

export const clearMotionGateHistory = async (lobbyId: string) => {
    const historyRef = ref(db, `lobbies/${lobbyId}/motionGate/history`);
    await remove(historyRef);
};

export { db, onValue };