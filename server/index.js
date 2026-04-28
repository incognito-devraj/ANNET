// server/index.js — server entry point
// Wires Express, HTTP server, Socket.IO, and CORS together, then starts listening.

const http = require('node:http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { setupSocket } = require('./socket');

const app = express();
const server = http.createServer(app);

// Allow any origin on port 8080 (covers localhost and LAN IPs like 192.168.x.x)
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl) or any port-8080 host
    if (!origin || origin.includes(':8080') || origin.includes('localhost')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
};

const io = new Server(server, { cors: corsOptions });

app.use(cors(corsOptions));

setupSocket(io);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`[server] Annet backend listening on port ${PORT}`);
});
