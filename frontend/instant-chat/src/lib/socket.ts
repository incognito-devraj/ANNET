import { io, Socket } from "socket.io-client";

const DEFAULT_PRODUCTION_BACKEND_URL = "https://annet-q0ai.onrender.com";
const SOCKET_TIMEOUT_MS = 20000;

function getBackendUrl() {
  // Explicit override always wins (set in .env files)
  const configuredUrl = import.meta.env.VITE_BACKEND_URL?.trim();
  if (configuredUrl) return configuredUrl;

  const { hostname, protocol, port } = window.location;

  // Any non-public IP or localhost → assume local dev server on :3001
  // This covers localhost, 127.x, 10.x, 172.16-31.x, 192.168.x LAN IPs
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^192\.168\./.test(hostname);

  if (isLocal) {
    // Use the same host but port 3001 for the backend
    return `${protocol}//${hostname}:3001`;
  }

  return DEFAULT_PRODUCTION_BACKEND_URL;
}

const BACKEND_URL = getBackendUrl();
let warmupPromise: Promise<void> | null = null;

function getWarmupUrl() {
  try {
    return new URL("/health", BACKEND_URL).toString();
  } catch {
    return `${BACKEND_URL.replace(/\/$/, "")}/health`;
  }
}

// Singleton socket - created once at module load, never recreated.
export const socket: Socket = io(BACKEND_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
  timeout: SOCKET_TIMEOUT_MS,
  tryAllTransports: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

export function warmBackend() {
  if (!warmupPromise) {
    warmupPromise = fetch(getWarmupUrl(), {
      method: "GET",
      cache: "no-store",
      mode: "cors",
    }).then(() => undefined).catch(() => undefined);
  }

  return warmupPromise;
}

export function connectSocket() {
  void warmBackend();
  if (!socket.connected) {
    socket.connect();
  }
}

export function disconnectSocket() {
  socket.disconnect();
}

export function leaveSocketRoom(payload: { room: string; name: string; sessionId: string }) {
  return new Promise<void>((resolve) => {
    if (!socket.connected) {
      resolve();
      return;
    }

    socket.emit("leave_room", payload, () => resolve());
  });
}
