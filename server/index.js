// server/index.js - server entry point
// Wires Express, HTTP server, Socket.IO, and CORS together, then starts listening.

const http = require("node:http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const { setupSocket } = require("./socket");

const app = express();
const server = http.createServer(app);

// Allow Vercel frontend, localhost dev, and LAN access
const corsOptions = {
  origin: (origin, callback) => {
    if (
      !origin ||
      origin.includes("vercel.app") ||
      origin.includes("onrender.com") ||
      origin.includes("localhost") ||
      origin.includes(":8080")
    ) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST"],
};

const io = new Server(server, {
  cors: corsOptions,
  // pingTimeout must be long enough that a mobile file-picker / gallery
  // interruption (which can pause the tab for 10–40 s) doesn't kill the
  // socket before the client has a chance to reconnect silently.
  pingTimeout: 60000,
  pingInterval: 25000,
  // 10 MB buffer — base64 encoding adds ~33% overhead, so a 5 MB file
  // becomes ~6.7 MB on the wire. 10 MB gives comfortable headroom.
  maxHttpBufferSize: 10 * 1024 * 1024,
});

app.use(cors(corsOptions));
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

setupSocket(io);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`[server] Annet backend listening on port ${PORT}`);
});
