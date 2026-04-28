// server/index.js — server entry point
// Wires Express, HTTP server, Socket.IO, and CORS together, then starts listening.

const http = require('node:http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { setupSocket } = require('./socket');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: 'http://localhost:5173' }));

setupSocket(io);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`[server] Anonet backend listening on port ${PORT}`);
});
