import { io, Socket } from "socket.io-client";

const DEFAULT_PRODUCTION_BACKEND_URL = "https://annet-q0ai.onrender.com";
const SOCKET_TIMEOUT_MS = 20000;

function getBackendUrl() {
  const configuredUrl = import.meta.env.VITE_BACKEND_URL?.trim();
  if (configuredUrl) return configuredUrl;

  const { hostname, protocol } = window.location;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

  if (!isLocalhost) return DEFAULT_PRODUCTION_BACKEND_URL;

  return `${protocol}//${hostname}:3001`;
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
