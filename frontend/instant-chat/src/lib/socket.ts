import { io, Socket } from "socket.io-client";

const DEFAULT_PRODUCTION_BACKEND_URL = "https://annet-q0ai.onrender.com";

function getBackendUrl() {
  const configuredUrl = import.meta.env.VITE_BACKEND_URL?.trim();
  if (configuredUrl) return configuredUrl;

  const { hostname, protocol } = window.location;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

  if (!isLocalhost) return DEFAULT_PRODUCTION_BACKEND_URL;

  return `${protocol}//${hostname}:3001`;
}

const BACKEND_URL = getBackendUrl();

// Singleton socket — created once at module load, never recreated.
export const socket: Socket = io(BACKEND_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
  timeout: 8000,
  tryAllTransports: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

export function connectSocket() {
  if (!socket.connected) {
    socket.connect();
  }
}

export function disconnectSocket() {
  socket.disconnect();
}
