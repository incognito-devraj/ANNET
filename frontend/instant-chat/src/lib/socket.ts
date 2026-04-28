import { io, Socket } from "socket.io-client";

// Resolve backend URL from current page host — works for localhost and LAN (192.168.x.x)
const { protocol, hostname } = window.location;
const BACKEND_URL = `${protocol}//${hostname}:3001`;

// Singleton socket — created once at module load, never recreated.
// This prevents reconnects caused by React re-renders, file picker opens,
// tab focus changes, or any other UI interaction.
export const socket: Socket = io(BACKEND_URL, {
  autoConnect: false, // we connect manually after nickname is set
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

// Connect the socket (idempotent — safe to call multiple times)
export function connectSocket() {
  if (!socket.connected) {
    socket.connect();
  }
}

// Disconnect and clean up — only call on explicit leave
export function disconnectSocket() {
  socket.disconnect();
}
