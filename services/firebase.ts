import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  onValue,
  set,
  get,
  update,
  runTransaction,
  child,
  remove,
} from "firebase/database";
import { MotionGateRole, MotionGateRun } from "../types";

// Configuration using the provided Realtime Database URL
const firebaseConfig = {
  databaseURL:
    "https://timer-app-1751097782-default-rtdb.europe-west1.firebasedatabase.app/",
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
export const getMotionGateRef = (lobbyId: string) =>
  ref(db, `lobbies/${lobbyId}/motionGate`);

// --- Motion Gate Logic ---

export const initMotionGateSession = async (lobbyId: string) => {
  const mgRef = getMotionGateRef(lobbyId);

  await runTransaction(mgRef, (current) => {
    // If completely empty, initialize
    if (current === null) {
      return {
        status: "IDLE",
        startTime: null,
        finishTime: null,
        runId: Date.now().toString(),
        devices: {},
      };
    }

    // If exists (maybe implicitly created by device registration), ensure status fields exist
    // preventing accidental wipes if only 'devices' child exists
    if (!current.status) {
      return {
        ...current,
        status: "IDLE",
        startTime: null,
        finishTime: null,
        runId: current.runId || Date.now().toString(),
      };
    }

    return undefined;
  });
};

export const registerDevice = async (
  lobbyId: string,
  deviceId: string,
  name: string
) => {
  const deviceRef = ref(
    db,
    `lobbies/${lobbyId}/motionGate/devices/${deviceId}`
  );
  // We don't want to overwrite the role if it's already set
  await runTransaction(deviceRef, (current) => {
    if (current) {
      return { ...current, name, lastSeen: getServerTime() };
    }
    return {
      id: deviceId,
      name,
      role: "UNASSIGNED",
      lastSeen: getServerTime(),
    };
  });
};

export const heartbeatDevice = async (lobbyId: string, deviceId: string) => {
  const lastSeenRef = ref(
    db,
    `lobbies/${lobbyId}/motionGate/devices/${deviceId}/lastSeen`
  );
  await set(lastSeenRef, getServerTime());
};

export const updateDeviceRole = async (
  lobbyId: string,
  deviceId: string,
  role: MotionGateRole
) => {
  const roleRef = ref(
    db,
    `lobbies/${lobbyId}/motionGate/devices/${deviceId}/role`
  );
  await set(roleRef, role);
};

export const removeDevice = async (lobbyId: string, deviceId: string) => {
  const deviceRef = ref(
    db,
    `lobbies/${lobbyId}/motionGate/devices/${deviceId}`
  );
  await remove(deviceRef);
};

export const triggerMotionStart = async (
  lobbyId: string,
  timestamp: number
) => {
  const mgRef = getMotionGateRef(lobbyId);
  await runTransaction(mgRef, (current) => {
    if (
      !current ||
      current.status === "IDLE" ||
      current.status === "FINISHED"
    ) {
      return {
        ...current,
        status: "RUNNING",
        startTime: timestamp,
        finishTime: null,
        runId: Date.now().toString(),
      };
    }
    return current;
  });
};

export const triggerMotionFinish = async (
  lobbyId: string,
  timestamp: number
) => {
  const mgRef = getMotionGateRef(lobbyId);
  await runTransaction(mgRef, (current) => {
    if (current && current.status === "RUNNING") {
      const newRun: MotionGateRun = {
        runId: current.runId,
        startTime: current.startTime,
        finishTime: timestamp,
      };
      return {
        ...current,
        status: "FINISHED",
        finishTime: timestamp,
        history: {
          ...(current.history || {}),
          [current.runId]: newRun,
        },
      };
    }
    return current;
  });
};

export const resetMotionGate = async (lobbyId: string) => {
  const mgRef = getMotionGateRef(lobbyId);
  await update(mgRef, {
    status: "IDLE",
    startTime: null,
    finishTime: null,
  });
};

export const clearMotionGateHistory = async (lobbyId: string) => {
  const historyRef = ref(db, `lobbies/${lobbyId}/motionGate/history`);
  await remove(historyRef);
};

export { db, onValue };
