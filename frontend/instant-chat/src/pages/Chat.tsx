import { useEffect, useMemo, useRef, useState, useCallback, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, Hash, Link, Menu, Users, VenetianMask } from "lucide-react";
import { getSocket, disconnectSocket } from "@/lib/socket";
import Sidebar, { SidebarContent } from "@/components/chat/Sidebar";
import MessageBubble from "@/components/chat/MessageBubble";
import InputBar from "@/components/chat/InputBar";
import { ChatMessage, ChatUser, FileMeta, ReplyTo } from "@/types/chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

const VALID = /^[A-Za-z0-9_]{1,24}$/;
const SMALL_FILE_LIMIT = 5 * 1024 * 1024;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Notification sound (Web Audio API — no file needed) ────────────────────
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
  } catch {
    // AudioContext blocked — silently ignore
  }
}

export default function Chat() {
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

  // Unread badge
  const [unread, setUnread] = useState(0);
  const tabFocused = useRef(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const roomValid = useMemo(() => VALID.test(room), [room]);

  // Track tab focus for unread count
  useEffect(() => {
    const onFocus = () => { tabFocused.current = true; setUnread(0); };
    const onBlur = () => { tabFocused.current = false; };
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => { window.removeEventListener("focus", onFocus); window.removeEventListener("blur", onBlur); };
  }, []);

  // Update tab title with unread count
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) #${room} — Annet` : `#${room} — Annet`;
  }, [unread, room]);

  // Reset title on unmount
  useEffect(() => () => { document.title = "Annet"; }, []);

  useEffect(() => {
    if (!roomValid) navigate("/", { replace: true });
  }, [roomValid, navigate]);

  // Socket lifecycle
  useEffect(() => {
    if (!joined || !roomValid) return;
    const socket = getSocket();

    const onConnect = () => { setConnected(true); socket.emit("join_room", { name, room }); };
    const onDisconnect = () => setConnected(false);

    const onRoomUsers = (list: unknown) => {
      if (!Array.isArray(list)) return;
      setUsers(list.map((u) =>
        typeof u === "string" ? { name: u } : { id: u?.id, name: u?.name ?? String(u) }
      ));
    };

    const onUserJoined = (payload: { name: string }) => {
      setMessages((m) => [...m, { kind: "system", id: uid(), message: `${payload.name} joined`, ts: Date.now() }]);
    };

    const onUserLeft = (payload: { name: string }) => {
      setMessages((m) => [...m, { kind: "system", id: uid(), message: `${payload.name} left`, ts: Date.now() }]);
    };

    const onReceiveMessage = (payload: { room: string; author: string; message: string }) => {
      const CODE_PREFIX = /^code:\s*/i;
      const REPLY_PREFIX = /^__reply__(.+?)__endreply__\n?/s;

      let rawMsg = payload.message;
      let replyTo: ReplyTo | undefined;

      // Extract embedded reply metadata
      const replyMatch = rawMsg.match(REPLY_PREFIX);
      if (replyMatch) {
        try { replyTo = JSON.parse(replyMatch[1]); } catch { /* ignore */ }
        rawMsg = rawMsg.replace(REPLY_PREFIX, "");
      }

      const isCode = CODE_PREFIX.test(rawMsg);
      const content = isCode ? rawMsg.replace(CODE_PREFIX, "") : rawMsg;

      // Sound + unread badge for incoming messages
      if (!tabFocused.current) {
        setUnread((n) => n + 1);
        playNotificationSound();
      } else {
        playNotificationSound();
      }

      setMessages((m) => [
        ...m,
        isCode
          ? { kind: "code", id: uid(), author: payload.author, code: content, mine: false, ts: Date.now() }
          : { kind: "message", id: uid(), author: payload.author, message: content, mine: false, ts: Date.now(), replyTo },
      ]);
    };

    const onReceiveImage = (payload: { author: string; dataUrl: string; fileMeta: FileMeta }) => {
      if (!tabFocused.current) { setUnread((n) => n + 1); playNotificationSound(); }
      setMessages((m) => [...m, { kind: "image", id: uid(), author: payload.author, mine: false, dataUrl: payload.dataUrl, fileMeta: payload.fileMeta, ts: Date.now() }]);
    };

    const onWebrtcOffer = (payload: { offer: unknown; fileMeta: FileMeta; author?: string }) => {
      setMessages((m) => [...m, { kind: "file_offer", id: uid(), author: payload.author ?? "peer", mine: false, fileMeta: payload.fileMeta, offer: payload.offer, received: false, ts: Date.now() }]);
    };

    const onWebrtcAnswer = (_: unknown) => {};
    const onIceCandidate = (_: unknown) => {};
    const onError = (msg: unknown) => {
      const text = typeof msg === "string" ? msg : (msg as any)?.message ?? "Unknown error";
      toast.error(text);
    };

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

    if (socket.connected) onConnect();

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
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, roomValid, name, room]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleNicknameSubmit = (e: FormEvent) => {
    e.preventDefault();
    setNameError(null);
    if (!VALID.test(nameInput)) { setNameError("1-24 chars, letters, numbers, underscores only."); return; }
    setName(nameInput);
    setJoined(true);
  };

  const handleSend = (text: string) => {
    const socket = getSocket();
    const CODE_PREFIX = /^code:\s*/i;
    const isCode = CODE_PREFIX.test(text);
    const payload = isCode ? text.replace(CODE_PREFIX, "") : text;

    // Embed reply metadata in the wire message so receivers can parse it
    let wireMessage = text;
    if (replyTo) {
      wireMessage = `__reply__${JSON.stringify(replyTo)}__endreply__\n${text}`;
    }

    socket.emit("send_message", { room, author: name, message: wireMessage });

    setMessages((m) => [
      ...m,
      isCode
        ? { kind: "code", id: uid(), author: name, code: payload, mine: true, ts: Date.now() }
        : { kind: "message", id: uid(), author: name, message: payload, mine: true, ts: Date.now(), replyTo: replyTo ?? undefined },
    ]);
    setReplyTo(null);
  };

  const handleFile = (file: File) => {
    const socket = getSocket();
    const fileMeta: FileMeta = { name: file.name, size: file.size };

    if (file.size <= SMALL_FILE_LIMIT) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        setMessages((m) => [...m, { kind: "image", id: uid(), author: name, mine: true, dataUrl, fileMeta, ts: Date.now() }]);
        socket.emit("send_image", { room, author: name, dataUrl, fileMeta });
      };
      reader.readAsDataURL(file);
      return;
    }

    const offer = { type: "offer", placeholder: true };
    socket.emit("webrtc_offer", { room, offer, fileMeta });
    setMessages((m) => [...m, { kind: "file_offer", id: uid(), author: name, mine: true, fileMeta, offer, received: false, ts: Date.now() }]);
    toast("File offer sent", { description: fileMeta.name });
  };

  const handleReceiveFile = (id: string) => {
    const socket = getSocket();
    socket.emit("webrtc_answer", { room, answer: { type: "answer", placeholder: true } });
    setMessages((m) => m.map((msg) => msg.id === id && msg.kind === "file_offer" ? { ...msg, received: true } : msg));
  };

  // Reactions — client-side only
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

  // Reply
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

  const leave = () => { disconnectSocket(); navigate("/"); };

  const copyInviteLink = () => {
    const url = `${window.location.origin}/anonet/${encodeURIComponent(room)}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  if (!roomValid) return null;

  // Nickname prompt
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
              <Input autoFocus placeholder="e.g. shadow_42" value={nameInput} maxLength={24} onChange={(e) => setNameInput(e.target.value)} className="bg-secondary/60 border-border h-11" />
            </div>
            {nameError && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">{nameError}</div>
            )}
            <Button type="submit" className="w-full h-11 text-base font-semibold">Enter Room</Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Desktop sidebar */}
      <Sidebar users={users} currentName={name} />

      {/* Mobile sidebar drawer */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="p-0 w-72 flex flex-col bg-card/95 backdrop-blur">
          <SheetTitle className="sr-only">Online users</SheetTitle>
          <SidebarContent users={users} currentName={name} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-card/60 backdrop-blur flex items-center px-4 gap-3">
          {/* Hamburger — mobile only */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="shrink-0 md:hidden"
            aria-label="Open user list"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <Button variant="ghost" size="icon" onClick={leave} aria-label="Leave">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Hash className="h-5 w-5 text-primary" />
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">{room}</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-primary" : "bg-destructive"}`} />
              {connected ? "Connected" : "Connecting…"}
            </p>
          </div>

          {/* Share / invite link button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={copyInviteLink}
            aria-label="Copy invite link"
            title="Copy invite link"
          >
            {linkCopied ? <Check className="h-4 w-4 text-primary" /> : <Link className="h-4 w-4" />}
          </Button>

          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {users.length}
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-3 md:px-6 py-4">
          <div className="max-w-5xl mx-auto">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-12">No messages yet. Say hi 👋</div>
            )}
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                msg={m}
                onReceiveFile={handleReceiveFile}
                onReact={handleReact}
                onReply={handleReply}
              />
            ))}
          </div>
        </div>

        <InputBar
          onSend={handleSend}
          onFile={handleFile}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </div>
    </div>
  );
}
