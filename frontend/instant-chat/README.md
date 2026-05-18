<div align="center">

# ⚡ Annet — Frontend

**Anonymous real-time chat. No accounts. No logs. Just rooms.**

[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![Deployed on Vercel](https://img.shields.io/badge/Deployed-Vercel-000000?style=flat-square&logo=vercel)](https://vercel.com)

</div>

---

## What is Annet?

Annet is a zero-friction anonymous chat app. Pick a nickname, share a room link, and start talking — no sign-up, no history, no trace. Messages live only in memory for the duration of your session.

---

## ✨ Features

| Feature | Details |
|---|---|
| 🏠 **Named rooms** | Join any room by URL — `yourapp.com/room-name` |
| 💬 **Real-time messaging** | Instant delivery via Socket.IO WebSockets |
| ⌨️ **Typing indicators** | See who's composing a message in real time |
| ↩️ **Reply threads** | Quote any message with a reply preview strip |
| 🖼️ **Inline images** | Paste or drag images — sent instantly via Socket.IO |
| 📁 **P2P file transfer** | Large files sent peer-to-peer over WebRTC (no server storage) |
| 💻 **Code blocks** | Prefix with `code:` for syntax-highlighted code snippets |
| 🔒 **Anonymous by design** | No accounts, no persistence, no tracking |
| 🚫 **Unique nicknames** | Duplicate names blocked per room |
| 🌙 **Dark UI** | Sleek dark theme with animated accents |

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Framework | [React 18](https://react.dev) |
| Language | [TypeScript 5](https://www.typescriptlang.org) |
| Build tool | [Vite 5](https://vitejs.dev) |
| Styling | [Tailwind CSS 3](https://tailwindcss.com) |
| Components | [shadcn/ui](https://ui.shadcn.com) (Radix UI primitives) |
| Real-time | [Socket.IO client 4.x](https://socket.io) |
| File transfer | [WebRTC](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API) (browser-native) |
| Testing | [Vitest](https://vitest.dev) + [Testing Library](https://testing-library.com) |
| Deployment | [Vercel](https://vercel.com) |

---

## 🚀 Local Development

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9 (or bun)

### Setup

```bash
# 1. Clone and navigate to the frontend
git clone <your-repo-url>
cd frontend/instant-chat

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.development .env.local
# Edit .env.local and set VITE_BACKEND_URL to your local server
# e.g. VITE_BACKEND_URL=http://localhost:3001

# 4. Start the dev server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Environment Variables

| Variable | Description | Example |
|---|---|---|
| `VITE_BACKEND_URL` | URL of the Annet backend server | `http://localhost:3001` |

> In production this is set to your Render backend URL in the Vercel dashboard.

### Available Scripts

```bash
npm run dev        # Start dev server with HMR
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
npm run lint       # ESLint
npm test           # Run tests once (Vitest)
npm run test:watch # Watch mode
```

---

## 🌐 Deploying to Vercel

1. Push this folder (`frontend/instant-chat`) to its own GitHub repository.
2. Import the repo in [Vercel](https://vercel.com/new).
3. Vercel auto-detects Vite — no framework config needed.
4. Add the environment variable in **Project Settings → Environment Variables**:
   - `VITE_BACKEND_URL` → your Render backend URL (e.g. `https://annet-backend.onrender.com`)
5. Deploy. Vercel handles CDN, HTTPS, and preview deployments automatically.

> The `vercel.json` in this repo configures SPA fallback routing so direct room URLs (e.g. `/my-room`) work correctly.

---

## 📁 Project Structure

```
src/
├── components/
│   ├── chat/
│   │   ├── InputBar.tsx        # Message input with typing events & file attach
│   │   ├── MessageBubble.tsx   # Renders messages, code blocks, images, files
│   │   ├── Sidebar.tsx         # Online users list
│   │   └── TypingIndicator.tsx # "X is typing…" indicator
│   └── ui/                     # shadcn/ui component library
├── hooks/                      # Custom React hooks
├── lib/
│   ├── socket.ts               # Singleton Socket.IO client
│   ├── utils.ts                # Tailwind class helpers
│   └── webrtc.ts               # WebRTC peer session helpers
├── pages/
│   ├── Chat.tsx                # Main chat page (socket wiring, state)
│   ├── Index.tsx               # Room picker / landing redirect
│   ├── Landing.tsx             # Landing page
│   └── NotFound.tsx            # 404
├── test/                       # Vitest test files
└── types/
    └── chat.ts                 # Shared TypeScript types
```

---

## 🔭 Roadmap & Future Aspects

Annet is intentionally minimal today. Here's where it's headed as it scales:

### ☁️ Cloud Message Storage (Persistent Rooms)
Currently all messages exist only in the browser session — refreshing clears the history. The plan is to introduce **optional persistent rooms** backed by cloud storage (e.g. Redis for hot messages, S3/R2 for media). Users creating a room would choose between *ephemeral* (current behavior) and *persistent* (messages stored and replayed on join). This enables async conversations and room history without compromising the ephemeral default.

### 🔐 Authentication & Authorization
As the platform scales, rooms will support **access control**:
- **Password-protected rooms** — join with a shared passphrase
- **Token-based auth** — JWT or session tokens issued at join time, verified server-side
- **Room ownership** — creators can kick users, set room capacity, or make rooms invite-only
- **Rate limiting** — per-IP and per-nickname message throttling to prevent abuse

These features will be layered on top of the existing Socket.IO event model without breaking the anonymous-by-default experience.

---

<div align="center">
  <sub>Built with ⚡ by the Annet team</sub>
</div>
