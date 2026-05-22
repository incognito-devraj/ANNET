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
  // Mobile share sheets and file pickers can pause a tab briefly without meaning the user truly left.
  pingTimeout: 30000,
  pingInterval: 10000,
  maxHttpBufferSize: 50 * 1024 * 1024,
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
