import { useEffect, useRef, useState, useCallback, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, Hash, Link, Menu, Users, VenetianMask } from "lucide-react";
import { socket, connectSocket, disconnectSocket } from "@/lib/socket";
import {
  checkFileSecurity,
  getSecurityReason,
  createSenderPeer,
  createReceiverPeer,
  triggerDownload,
  PeerSession,
} from "@/lib/webrtc";
import Sidebar, { SidebarContent } from "@/components/chat/Sidebar";
import MessageBubble from "@/components/chat/MessageBubble";
import InputBar from "@/components/chat/InputBar";
import { ChatMessage, ChatUser, FileMeta, ReplyTo } from "@/types/chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

const VALID = /^[A-Za-z0-9_]{1,24}$/;
const INLINE_IMAGE_LIMIT = 750 * 1024;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function isInlineImage(file: File) {
  return file.type.startsWith("image/") && file.size <= INLINE_IMAGE_LIMIT;
}

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch { /* AudioContext blocked */ }
}

export default function ChatPage() {
  const { room: roomParam } = useParams<{ room: string }>();
  const navigate = useNavigate();
  const room = roomParam ?? "";

  const [name, setName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  const [users, setUsers] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [unread, setUnread] = useState(0);

  const tabFocused = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasJoinedRoom = useRef(false); // guard: emit join_room only once

  // WebRTC
  const peerRefs = useRef<Map<string, PeerSession>>(new Map());
  const socketIdMap = useRef<Map<string, string>>(new Map());

  // ─── Validate room name ────────────────────────────────────────────────────
  useEffect(() => {
    if (!VALID.test(room)) navigate("/", { replace: true });
  }, [room, navigate]);

  // ─── Tab focus / unread ───────────────────────────────────────────────────
  useEffect(() => {
    const onFocus = () => { tabFocused.current = true; setUnread(0); };
    const onBlur = () => { tabFocused.current = false; };
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) #${room} — Annet` : `#${room} — Annet`;
  }, [unread, room]);

  useEffect(() => () => { document.title = "Annet"; }, []);

  // ─── Socket event handlers — registered ONCE, never torn down mid-session ─
  // We use refs for name/room so handlers always see current values without
  // needing to be re-registered (which would cause the reconnect bug).
  const nameRef = useRef(name);
  const roomRef = useRef(room);
  useEffect(() => { nameRef.current = name; }, [name]);
  useEffect(() => { roomRef.current = room; }, [room]);

  useEffect(() => {
    // ── connect handler: emit join_room exactly once ──
    const onConnect = () => {
      setConnected(true);
      if (!hasJoinedRoom.current && nameRef.current && roomRef.current) {
        hasJoinedRoom.current = true;
        socket.emit("join_room", { name: nameRef.current, room: roomRef.current });
      }
    };

    const onDisconnect = () => {
      setConnected(false);
      // Reset join guard so we re-join after a genuine reconnect
      hasJoinedRoom.current = false;
    };

    const onRoomUsers = (list: unknown) => {
      if (!Array.isArray(list)) return;
      setUsers(list.map((u) =>
        typeof u === "string" ? { name: u } : { id: u?.id, name: u?.name ?? String(u) }
      ));
    };

    const onUserJoined = (payload: { name: string }) =>
      setMessages((m) => [...m, { kind: "system", id: uid(), message: `${payload.name} joined`, ts: Date.now() }]);

    const onUserLeft = (payload: { name: string }) =>
      setMessages((m) => [...m, { kind: "system", id: uid(), message: `${payload.name} left`, ts: Date.now() }]);

    const onReceiveMessage = (payload: { room: string; author: string; message: string }) => {
      const CODE_PREFIX = /^code:\s*/i;
      const REPLY_PREFIX = /^__reply__(.+?)__endreply__\n?/s;
      let rawMsg = payload.message;
      let parsedReplyTo: ReplyTo | undefined;
      const replyMatch = rawMsg.match(REPLY_PREFIX);
      if (replyMatch) {
        try { parsedReplyTo = JSON.parse(replyMatch[1]); } catch { /* ignore */ }
        rawMsg = rawMsg.replace(REPLY_PREFIX, "");
      }
      const isCode = CODE_PREFIX.test(rawMsg);
      const content = isCode ? rawMsg.replace(CODE_PREFIX, "") : rawMsg;
      if (!tabFocused.current) setUnread((n) => n + 1);
      playNotificationSound();
      setMessages((m) => [
        ...m,
        isCode
          ? { kind: "code", id: uid(), author: payload.author, code: content, mine: false, ts: Date.now() }
          : { kind: "message", id: uid(), author: payload.author, message: content, mine: false, ts: Date.now(), replyTo: parsedReplyTo },
      ]);
    };

    const onReceiveImage = (payload: { author: string; dataUrl: string; fileMeta: FileMeta }) => {
      if (!tabFocused.current) setUnread((n) => n + 1);
      playNotificationSound();
      setMessages((m) => [...m, {
        kind: "image", id: uid(), author: payload.author, mine: false,
        dataUrl: payload.dataUrl, fileMeta: payload.fileMeta, ts: Date.now(),
      }]);
    };

    const onWebrtcOffer = (payload: {
      offer: RTCSessionDescriptionInit;
      fileMeta: FileMeta;
      msgId: string;
      senderSocketId: string;
    }) => {
      const { fileMeta, msgId, senderSocketId } = payload;
      const check = checkFileSecurity(fileMeta.name, fileMeta.size, fileMeta.mimeType ?? "");
      if (!check.ok) {
        toast.error(`Blocked incoming file: ${getSecurityReason(check)}`);
        return;
      }
      socketIdMap.current.set(msgId, senderSocketId);
      setMessages((m) => [...m, {
        kind: "file_offer", id: msgId, author: "peer", mine: false,
        fileMeta, offer: payload.offer, received: false,
        transferState: "idle" as const, ts: Date.now(),
      }]);
    };

    const onWebrtcAnswer = async (payload: {
      answer: RTCSessionDescriptionInit;
      msgId: string;
      receiverSocketId?: string;
    }) => {
      const session = peerRefs.current.get(payload.msgId);
      if (!session) return;
      if (payload.receiverSocketId) {
        socketIdMap.current.set(payload.msgId + "_receiver", payload.receiverSocketId);
        const flush = socketIdMap.current.get(payload.msgId + "_flush");
        if (flush && typeof flush === "function") {
          (flush as unknown as (id: string) => void)(payload.receiverSocketId);
          socketIdMap.current.delete(payload.msgId + "_flush");
        }
      }
      try {
        await session.setRemoteDescription(payload.answer);
      } catch (e) {
        console.error("[webrtc] setRemoteDescription failed", e);
      }
    };

    const onIceCandidate = async (payload: { candidate: RTCIceCandidateInit; msgId: string }) => {
      const session = peerRefs.current.get(payload.msgId);
      if (!session) return;
      try {
        await session.addIceCandidate(payload.candidate);
      } catch (e) {
        console.error("[webrtc] addIceCandidate failed", e);
      }
    };

    const onError = (msg: unknown) => {
      const text = typeof msg === "string" ? msg : (msg as any)?.message ?? "Unknown error";
      toast.error(text);
    };

    // Register all handlers
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room_users", onRoomUsers);
    socket.on("user_joined", onUserJoined);
    socket.on("user_left", onUserLeft);
    socket.on("receive_message", onReceiveMessage);
    socket.on("receive_image", onReceiveImage);
    socket.on("webrtc_offer", onWebrtcOffer);
    socket.on("webrtc_answer", onWebrtcAnswer);
    socket.on("ice_candidate", onIceCandidate);
    socket.on("error", onError);

    // Cleanup: remove handlers only when component unmounts (not on re-renders)
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room_users", onRoomUsers);
      socket.off("user_joined", onUserJoined);
      socket.off("user_left", onUserLeft);
      socket.off("receive_message", onReceiveMessage);
      socket.off("receive_image", onReceiveImage);
      socket.off("webrtc_offer", onWebrtcOffer);
      socket.off("webrtc_answer", onWebrtcAnswer);
      socket.off("ice_candidate", onIceCandidate);
      socket.off("error", onError);
      peerRefs.current.forEach((s) => s.close());
      peerRefs.current.clear();
      socketIdMap.current.clear();
    };
  }, []); // ← empty deps: register once, never re-register

  // ─── Connect + join once nickname is confirmed ─────────────────────────────
  useEffect(() => {
    if (!joined || !name || !room) return;
    connectSocket();
    // If already connected (e.g. fast reconnect), emit join immediately
    if (socket.connected && !hasJoinedRoom.current) {
      hasJoinedRoom.current = true;
      socket.emit("join_room", { name, room });
    }
  }, [joined]); // ← only runs when joined flips to true

  // ─── Auto-scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleNicknameSubmit = (e: FormEvent) => {
    e.preventDefault();
    setNameError(null);
    if (!VALID.test(nameInput)) {
      setNameError("1-24 chars, letters, numbers, underscores only.");
      return;
    }
    setName(nameInput);
    setJoined(true);
  };

  const handleSend = (text: string) => {
    const CODE_PREFIX = /^code:\s*/i;
    const isCode = CODE_PREFIX.test(text);
    const payload = isCode ? text.replace(CODE_PREFIX, "") : text;
    let wireMessage = text;
    if (replyTo) wireMessage = `__reply__${JSON.stringify(replyTo)}__endreply__\n${text}`;
    socket.emit("send_message", { room, author: name, message: wireMessage });
    setMessages((m) => [
      ...m,
      isCode
        ? { kind: "code", id: uid(), author: name, code: payload, mine: true, ts: Date.now() }
        : { kind: "message", id: uid(), author: name, message: payload, mine: true, ts: Date.now(), replyTo: replyTo ?? undefined },
    ]);
    setReplyTo(null);
  };

  const handleFile = async (file: File) => {
    const fileMeta: FileMeta = { name: file.name, size: file.size, mimeType: file.type };

    const check = checkFileSecurity(file.name, file.size, file.type);
    if (!check.ok) {
      toast.error(getSecurityReason(check));
      return;
    }

    if (isInlineImage(file)) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        setMessages((m) => [...m, { kind: "image", id: uid(), author: name, mine: true, dataUrl, fileMeta, ts: Date.now() }]);
        socket.emit("send_image", { room, author: name, dataUrl, fileMeta });
      };
      reader.readAsDataURL(file);
      return;
    }

    // Route PDFs, other non-images, and larger images through WebRTC so we
    // avoid Socket.IO payload limits and render them as downloadable files.
    const msgId = uid();

    setMessages((m) => [...m, {
      kind: "file_offer", id: msgId, author: name, mine: true,
      fileMeta, offer: null, received: false,
      transferState: "connecting" as const, transferPercent: 0, ts: Date.now(),
    }]);

    const updateMsg = (patch: Partial<Extract<ChatMessage, { kind: "file_offer" }>>) =>
      setMessages((m) => m.map((msg) =>
        msg.id === msgId && msg.kind === "file_offer" ? { ...msg, ...patch } : msg
      ));

    // Buffer ICE candidates until receiver's socketId is known
    const pendingIce: RTCIceCandidateInit[] = [];
    let receiverKnown = false;

    const flushIce = (targetSocketId: string) => {
      receiverKnown = true;
      for (const c of pendingIce) {
        socket.emit("ice_candidate", { candidate: c, msgId, targetSocketId });
      }
      pendingIce.length = 0;
    };

    socketIdMap.current.set(msgId + "_flush", flushIce as unknown as string);

    try {
      const { session, offer } = await createSenderPeer(
        file,
        (candidate) => {
          const targetSocketId = socketIdMap.current.get(msgId + "_receiver") ?? "";
          if (!receiverKnown || !targetSocketId) {
            pendingIce.push(candidate);
          } else {
            socket.emit("ice_candidate", { candidate, msgId, targetSocketId });
          }
        },
        {
          onProgress: ({ percent }) => updateMsg({ transferState: "transferring", transferPercent: percent }),
          onComplete: () => {
            updateMsg({ transferState: "done", transferPercent: 100 });
            peerRefs.current.get(msgId)?.close();
            peerRefs.current.delete(msgId);
          },
          onError: (err) => {
            toast.error(`Transfer failed: ${err}`);
            updateMsg({ transferState: "error", transferError: err });
            peerRefs.current.get(msgId)?.close();
            peerRefs.current.delete(msgId);
          },
        },
      );

      peerRefs.current.set(msgId, session);
      socket.emit("webrtc_offer", { room, offer, fileMeta, msgId });
    } catch (e) {
      toast.error("Failed to initiate file transfer.");
      console.error("[webrtc] sender init failed", e);
    }
  };

  const handleReceiveFile = async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg || msg.kind !== "file_offer" || msg.mine) return;

    const offer = msg.offer as RTCSessionDescriptionInit;
    const fileMeta = msg.fileMeta;
    const targetSocketId = socketIdMap.current.get(msgId) ?? "";

    const updateMsg = (patch: Partial<Extract<ChatMessage, { kind: "file_offer" }>>) =>
      setMessages((m) => m.map((m2) =>
        m2.id === msgId && m2.kind === "file_offer" ? { ...m2, ...patch } : m2
      ));

    updateMsg({ received: true, transferState: "connecting", transferPercent: 0 });

    try {
      const { session, answer } = await createReceiverPeer(
        offer,
        { name: fileMeta.name, size: fileMeta.size, mimeType: fileMeta.mimeType ?? "" },
        (candidate) => socket.emit("ice_candidate", { candidate, msgId, targetSocketId }),
        {
          onProgress: ({ percent }) => updateMsg({ transferState: "transferring", transferPercent: percent }),
          onComplete: (blob, fileName) => {
            updateMsg({ transferState: "done", transferPercent: 100, downloadBlob: blob });
            peerRefs.current.get(msgId)?.close();
            peerRefs.current.delete(msgId);
          },
          onError: (err) => {
            toast.error(`Transfer failed: ${err}`);
            updateMsg({ transferState: "error", transferError: err });
            peerRefs.current.get(msgId)?.close();
            peerRefs.current.delete(msgId);
          },
        },
      );

      peerRefs.current.set(msgId, session);
      socket.emit("webrtc_answer", { answer, msgId, targetSocketId });
    } catch (e) {
      toast.error("Failed to accept file transfer.");
      console.error("[webrtc] receiver init failed", e);
    }
  };

  const handleDownloadFile = useCallback((msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg || msg.kind !== "file_offer" || !msg.downloadBlob) return;
    triggerDownload(msg.downloadBlob, msg.fileMeta.name);
  }, [messages]);

  const handleReact = useCallback((msgId: string, emoji: string) => {
    setMessages((m) =>
      m.map((msg) => {
        if (msg.id !== msgId || msg.kind === "system") return msg;
        const reactions = { ...("reactions" in msg ? msg.reactions ?? {} : {}) };
        const existing = reactions[emoji];
        if (existing) {
          reactions[emoji] = {
            emoji,
            count: existing.reactedByMe ? existing.count - 1 : existing.count + 1,
            reactedByMe: !existing.reactedByMe,
          };
          if (reactions[emoji].count <= 0) delete reactions[emoji];
        } else {
          reactions[emoji] = { emoji, count: 1, reactedByMe: true };
        }
        return { ...msg, reactions } as typeof msg;
      })
    );
  }, []);

  const handleReply = useCallback((msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg || msg.kind === "system") return;
    const preview =
      msg.kind === "message" ? msg.message.slice(0, 80) :
      msg.kind === "code" ? msg.code.slice(0, 80) :
      msg.kind === "image" ? `[image] ${msg.fileMeta.name}` :
      msg.fileMeta.name;
    setReplyTo({ id: msgId, author: msg.author, preview });
  }, [messages]);

  const leave = () => {
    peerRefs.current.forEach((s) => s.close());
    peerRefs.current.clear();
    socketIdMap.current.clear();
    hasJoinedRoom.current = false;
    disconnectSocket();
    navigate("/");
  };

  const copyInviteLink = () => {
    const url = `${window.location.origin}/anonet/${encodeURIComponent(room)}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  if (!VALID.test(room)) return null;

  // ─── Nickname prompt ───────────────────────────────────────────────────────
  if (!joined) {
    return (
      <div className="min-h-full flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8 select-none">
            <div className="h-12 w-12 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mb-4 shadow-[0_0_40px_-10px_hsl(var(--primary)/0.6)]">
              <VenetianMask className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Joining <span className="text-primary">#{room}</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">Pick a nickname to enter</p>
          </div>
          <form onSubmit={handleNicknameSubmit} className="bg-card/70 backdrop-blur border border-border rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Nickname</label>
              <Input
                autoFocus
                placeholder="e.g. shadow_42"
                value={nameInput}
                maxLength={24}
                onChange={(e) => setNameInput(e.target.value)}
                className="bg-secondary/60 border-border h-11"
              />
            </div>
            {nameError && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                {nameError}
              </div>
            )}
            <Button type="submit" className="w-full h-11 text-base font-semibold">Enter Room</Button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Chat UI ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[100svh] md:h-[100dvh] overflow-hidden">
      <Sidebar users={users} currentName={name} />

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="p-0 w-72 flex flex-col bg-card/95 backdrop-blur">
          <SheetTitle className="sr-only">Online users</SheetTitle>
          <SidebarContent users={users} currentName={name} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 min-w-0 overflow-hidden">
        <main className="chat-container">
          <div className="bg-layer" aria-hidden="true" />
          <div className="overlay-layer" aria-hidden="true" />
          <div className="noise-layer" aria-hidden="true" />

          <div className="chat-content">
            <header
              className="shrink-0 border-b border-white/10 bg-black/20 backdrop-blur-md flex items-center justify-center px-4 py-2 relative"
              style={{ minHeight: "56px" }}
            >
              <div className="absolute left-2 flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="md:hidden h-9 w-9" aria-label="Open user list">
                  <Menu className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={leave} aria-label="Leave" className="h-9 w-9">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-col items-center select-none">
                <span className="text-[10px] font-mono tracking-[0.3em] text-white/20 uppercase leading-none">
                  ANNET
                </span>
                <div className="flex items-center gap-1 mt-0.5">
                  <Hash className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-sm font-semibold truncate max-w-[160px]">{room}</span>
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${connected ? "bg-primary" : "bg-destructive"}`} />
                </div>
              </div>

              <div className="absolute right-2 flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={copyInviteLink} aria-label="Copy invite link" className="h-9 w-9">
                  {linkCopied ? <Check className="h-4 w-4 text-primary" /> : <Link className="h-4 w-4" />}
                </Button>
                <div className="flex items-center gap-1 text-xs text-muted-foreground pr-1">
                  <Users className="h-3.5 w-3.5" />
                  <span>{users.length}</span>
                </div>
              </div>
            </header>

            <div ref={scrollRef} className="messages-scroll flex-1 overflow-y-auto scrollbar-thin px-3 md:px-6 py-4 overscroll-contain">
              <div className="max-w-5xl mx-auto">
                {messages.length === 0 && (
                  <div className="text-center text-muted-foreground text-sm py-12">No messages yet. Say hi 👋</div>
                )}
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    msg={m}
                    onReceiveFile={handleReceiveFile}
                    onDownloadFile={handleDownloadFile}
                    onReact={handleReact}
                    onReply={handleReply}
                  />
                ))}
              </div>
            </div>

            <div className="chat-compose shrink-0">
              <InputBar
                onSend={handleSend}
                onFile={handleFile}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
