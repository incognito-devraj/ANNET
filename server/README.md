<div align="center">

# ⚡ Annet — Backend

**Lightweight real-time chat server with WebRTC signaling relay.**

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=nodedotjs)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express)](https://expressjs.com)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?style=flat-square&logo=socketdotio)](https://socket.io)
[![Deployed on Render](https://img.shields.io/badge/Deployed-Render-46E3B7?style=flat-square&logo=render)](https://render.com)

</div>

---

## What is this?

The Annet backend is a minimal Node.js server that powers real-time anonymous chat. It handles:

- **Room management** — users join named rooms with unique nicknames
- **Message relay** — broadcasts chat messages and images to room members
- **Typing indicators** — relays `typing` / `stop_typing` events between peers
- **WebRTC signaling** — relays offer/answer/ICE payloads for peer-to-peer file transfer

All state is **in-memory only** — no database, no file storage, no authentication. The server is intentionally minimal: three files, clean module boundaries.

---

## 🏗 Architecture

```
index.js
  └── socket.js       (Socket.IO event handlers)
        └── utils/users.js  (in-memory user store)
```

```
Browser Client
      │  WebSocket / HTTP
      ▼
  index.js  ──── Express + HTTP + Socket.IO init
      │
      ▼
  socket.js ──── Event handlers (join, message, typing, WebRTC, disconnect)
      │
      ▼
  utils/users.js ── Pure in-memory store (addUser / removeUser / getUser / getUsersInRoom)
```

**Key design principles:**
- No global broadcasts — all events are scoped to a named room
- No message persistence — relay only, nothing stored
- WebRTC payloads are relayed transparently without inspection
- Duplicate nicknames are rejected per room (case-sensitive)

---

## 📡 Socket.IO Events API

### Inbound (client → server)

| Event | Payload | Description |
|---|---|---|
| `join_room` | `{ name: string, room: string }` | Join a room with a nickname. Rejected if name is taken in that room, too long (>24 chars), or contains invalid characters. |
| `send_message` | `{ room: string, author: string, message: string }` | Send a text message. Broadcast to room, excluding sender. |
| `send_image` | `{ room: string, author: string, dataUrl: string, fileMeta: FileMeta }` | Send a small inline image (base64). Broadcast to room, excluding sender. |
| `typing` | `{ name: string, room: string }` | Signal that the user is composing a message. Broadcast to room, excluding sender. |
| `stop_typing` | `{ name: string, room: string }` | Signal that the user stopped composing. Broadcast to room, excluding sender. |
| `webrtc_offer` | `{ room: string, offer: RTCSessionDescriptionInit, fileMeta: FileMeta, msgId: string }` | Initiate a WebRTC file transfer. Relayed to room with `senderSocketId` appended. |
| `webrtc_answer` | `{ answer: RTCSessionDescriptionInit, msgId: string, targetSocketId: string }` | Accept a WebRTC offer. Routed directly to the sender socket. |
| `ice_candidate` | `{ candidate: RTCIceCandidateInit, msgId: string, targetSocketId: string }` | Exchange ICE candidates. Routed directly to the target socket. |

### Outbound (server → client)

| Event | Payload | Description |
|---|---|---|
| `error` | `string` | Validation error (e.g. nickname taken, invalid chars). Sent to originating socket only. |
| `user_joined` | `{ name: string }` | A new user joined the room. Broadcast to room, excluding the joiner. |
| `user_left` | `{ name: string }` | A user disconnected. Broadcast to entire room. |
| `room_users` | `User[]` | Current snapshot of all users in the room. Broadcast to entire room after join/leave. |
| `receive_message` | `{ room: string, author: string, message: string }` | Relayed chat message. Sent to room, excluding sender. |
| `receive_image` | `{ author: string, dataUrl: string, fileMeta: FileMeta }` | Relayed inline image. Sent to room, excluding sender. |
| `typing` | `{ name: string }` | A user is typing. Sent to room, excluding the typer. |
| `stop_typing` | `{ name: string }` | A user stopped typing. Sent to room, excluding the typer. |
| `webrtc_offer` | `{ offer, fileMeta, msgId, senderSocketId }` | Relayed WebRTC offer. Sent to room, excluding sender. |
| `webrtc_answer` | `{ answer, msgId, receiverSocketId }` | Relayed WebRTC answer. Sent directly to the offer sender. |
| `ice_candidate` | `{ candidate, msgId }` | Relayed ICE candidate. Sent directly to the target peer. |

### Nickname Validation Rules

| Rule | Error message |
|---|---|
| Empty or length > 24 chars | `"Nickname must be 24 characters or fewer."` |
| Contains characters outside `[a-zA-Z0-9_]` | `"Nickname may only contain letters, numbers, and underscores."` |
| Already taken in the same room (case-sensitive) | `"Nickname already taken in this room."` |

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | [Node.js 18+](https://nodejs.org) |
| HTTP framework | [Express 5](https://expressjs.com) |
| WebSocket | [Socket.IO 4](https://socket.io) |
| State | In-memory (`users` array in `utils/users.js`) |
| Testing | [Jest 30](https://jestjs.io) + [fast-check 4](https://fast-check.dev) |
| Deployment | [Render](https://render.com) |

---

## 🚀 Local Development

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Setup

```bash
# 1. Clone and navigate to the server
git clone <your-repo-url>
cd server

# 2. Install dependencies
npm install

# 3. Start the server
npm start
# or for auto-restart during development:
npx nodemon index.js
```

The server listens on `http://localhost:3001` by default.

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port the server listens on | `3001` |

Set `PORT` in a `.env` file or directly in your shell:

```bash
PORT=4000 npm start
```

### Running Tests

```bash
npm test
```

Tests cover:
- `utils/users.js` — unit tests + property-based tests (fast-check) for all validation rules and store operations
- `socket.js` — event handler integration tests with mocked socket/io objects

---

## 🌐 Deploying to Render

1. Push this folder (`server/`) to its own GitHub repository.
2. Create a new **Web Service** on [Render](https://render.com).
3. Connect your GitHub repo.
4. Configure the service:
   - **Build command**: `npm install`
   - **Start command**: `npm start`
   - **Environment**: Node
5. Add environment variables in the Render dashboard:
   - `PORT` is set automatically by Render — no action needed
6. Deploy. Render provides a public HTTPS URL (e.g. `https://annet-backend.onrender.com`).
7. Set that URL as `VITE_BACKEND_URL` in your Vercel frontend deployment.

> **Note:** Render free-tier services spin down after inactivity. The first connection after a cold start may take ~30 seconds. Upgrade to a paid plan for always-on availability.

---

## 📁 Project Structure

```
server/
├── index.js          # Entry point — Express + HTTP + Socket.IO init + CORS
├── socket.js         # All Socket.IO event handlers (setupSocket function)
├── utils/
│   └── users.js      # In-memory user store (addUser, removeUser, getUser, getUsersInRoom)
├── __tests__/
│   └── chat-enhancements.test.js  # Unit + property-based tests
└── package.json
```

---

## 🔭 Roadmap & Future Aspects

The server is intentionally minimal today. Here's where it's headed as it scales:

### ☁️ Cloud Message Storage (Persistent Rooms)
Currently the server holds zero state between connections — all messages are relay-only. The plan is to introduce **optional persistent rooms** backed by cloud storage:
- **Redis** for hot message queues and room metadata (fast reads, TTL-based expiry)
- **S3 / Cloudflare R2** for media (images, files) with pre-signed URLs
- On join, the server replays recent messages to the new client
- Ephemeral rooms remain the default; persistence is opt-in at room creation

### 🔐 Authentication & Authorization
As the platform scales, the server will gain an auth layer:
- **JWT-based session tokens** — issued at join time, verified on every sensitive event
- **Room passwords** — hashed and stored in Redis, checked before `socket.join(room)`
- **Room ownership** — creator gets a privileged token; can kick users, close rooms, set capacity
- **Rate limiting** — per-IP and per-nickname throttling via a middleware layer (e.g. `express-rate-limit` + Redis sliding window)
- **Horizontal scaling** — Socket.IO adapter (e.g. `@socket.io/redis-adapter`) to support multiple server instances behind a load balancer

---

<div align="center">
  <sub>Built with ⚡ by the Annet team</sub>
</div>
