import { io, Socket } from "socket.io-client";

// Production backend URL (Render)
// Falls back to same-host:3001 for local development
const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ??
  `${window.location.protocol}//${window.location.hostname}:3001`;

// Singleton socket — created once at module load, never recreated.
export const socket: Socket = io(BACKEND_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
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
