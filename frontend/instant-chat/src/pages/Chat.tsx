import { useEffect, useRef, useState, useCallback, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, Code2, FolderUp, Hash, Link, Menu, Users } from "lucide-react";
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
import TypingIndicator from "@/components/chat/TypingIndicator";
import { ChatMessage, ChatUser, FileMeta, ReplyTo } from "@/types/chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

const VALID = /^[A-Za-z0-9_]{1,24}$/;
const INLINE_LIMIT = 5 * 1024 * 1024; // 5 MB
const JOIN_TIMEOUT_MS = 10000;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function isInlineMedia(file: File) {
  const isMedia = file.type.startsWith("image/") ||
    file.type.startsWith("audio/") ||
    file.type.startsWith("video/");
  return isMedia && file.size <= INLINE_LIMIT;
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
  } catch {
    // AudioContext can be blocked until user interaction.
  }
}

export default function ChatPage() {
  const { room: roomParam } = useParams<{ room: string }>();
  const navigate = useNavigate();
  const room = roomParam ?? "";

  const [name, setName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [unread, setUnread] = useState(0);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [messageFontSize, setMessageFontSize] = useState(15);

  const tabFocused = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasJoinedRoom = useRef(false);
  const joinedRef = useRef(false);
  const nameRef = useRef(name);
  const roomRef = useRef(room);
  const peerRefs = useRef<Map<string, PeerSession>>(new Map());
  const socketIdMap = useRef<Map<string, string | ((id: string) => void)>>(new Map());

  useEffect(() => {
    connectSocket();
  }, []);

  useEffect(() => {
    return () => {
      peerRefs.current.forEach((session) => session.close());
      peerRefs.current.clear();
      socketIdMap.current.clear();
      hasJoinedRoom.current = false;
      joinedRef.current = false;
      disconnectSocket();
    };
  }, []);

  useEffect(() => {
    if (!VALID.test(room)) navigate("/", { replace: true });
  }, [room, navigate]);

  useEffect(() => {
    const onFocus = () => {
      tabFocused.current = true;
      setUnread(0);
    };
    const onBlur = () => {
      tabFocused.current = false;
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) #${room} - Annet` : `#${room} - Annet`;
  }, [unread, room]);

  useEffect(() => () => {
    document.title = "Annet";
  }, []);

  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    joinedRef.current = joined;
  }, [joined]);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      if (!hasJoinedRoom.current && nameRef.current && roomRef.current) {
        hasJoinedRoom.current = true;
        socket.emit("join_room", { name: nameRef.current, room: roomRef.current });
      }
    };

    const onDisconnect = () => {
      setConnected(false);
      hasJoinedRoom.current = false;
    };

    const onConnectError = () => {
      if (!joinedRef.current) {
        setJoining(false);
        setNameError("Couldn't reach the chat server. Please try again.");
        hasJoinedRoom.current = false;
        disconnectSocket();
      }
    };

    const onRoomUsers = (list: unknown) => {
      if (!Array.isArray(list)) return;
      setUsers(list.map((user) =>
        typeof user === "string" ? { name: user } : { id: user?.id, name: user?.name ?? String(user) }
      ));
      if (!joinedRef.current) {
        setJoining(false);
        setJoined(true);
      }
    };

    const onUserJoined = (payload: { name: string }) => {
      setMessages((prev) => [...prev, { kind: "system", id: uid(), message: `${payload.name} joined`, ts: Date.now() }]);
    };

    const onUserLeft = (payload: { name: string }) => {
      setTypingUsers((prev) => prev.filter((entry) => entry !== payload.name));
      setMessages((prev) => [...prev, { kind: "system", id: uid(), message: `${payload.name} left`, ts: Date.now() }]);
    };

    const onReceiveMessage = (payload: { id: string; room: string; author: string; message: string; ts?: number }) => {
      const CODE_PREFIX = /^code:\s*/i;
      const REPLY_PREFIX = /^__reply__(.+?)__endreply__\n?/s;
      let rawMessage = payload.message;
      let parsedReplyTo: ReplyTo | undefined;

      const replyMatch = rawMessage.match(REPLY_PREFIX);
      if (replyMatch) {
        try {
          parsedReplyTo = JSON.parse(replyMatch[1]);
        } catch {
          parsedReplyTo = undefined;
        }
        rawMessage = rawMessage.replace(REPLY_PREFIX, "");
      }

      const isCode = CODE_PREFIX.test(rawMessage);
      const content = isCode ? rawMessage.replace(CODE_PREFIX, "") : rawMessage;

      if (!tabFocused.current) setUnread((count) => count + 1);
      playNotificationSound();

      setMessages((prev) => [
        ...prev,
        isCode
          ? { kind: "code", id: payload.id, author: payload.author, code: content, mine: false, ts: payload.ts ?? Date.now(), replyTo: parsedReplyTo }
          : { kind: "message", id: payload.id, author: payload.author, message: content, mine: false, ts: payload.ts ?? Date.now(), replyTo: parsedReplyTo },
      ]);
    };

    const onReceiveMedia = (payload: { id: string; author: string; dataUrl: string; fileMeta: FileMeta; ts?: number; replyTo?: ReplyTo }) => {
      if (!tabFocused.current) setUnread((count) => count + 1);
      playNotificationSound();
      setMessages((prev) => [...prev, {
        kind: "media",
        id: payload.id,
        author: payload.author,
        mine: false,
        dataUrl: payload.dataUrl,
        fileMeta: payload.fileMeta,
        ts: payload.ts ?? Date.now(),
        replyTo: payload.replyTo,
      }]);
    };

    const onWebrtcOffer = (payload: {
      offer: RTCSessionDescriptionInit;
      fileMeta: FileMeta;
      msgId: string;
      senderSocketId: string;
    }) => {
      const check = checkFileSecurity(payload.fileMeta.name, payload.fileMeta.size, payload.fileMeta.mimeType ?? "");
      if (!check.ok) {
        toast.error(`Blocked incoming file: ${getSecurityReason(check)}`);
        return;
      }

      socketIdMap.current.set(payload.msgId, payload.senderSocketId);
      setMessages((prev) => [...prev, {
        kind: "file_offer",
        id: payload.msgId,
        author: "peer",
        mine: false,
        fileMeta: payload.fileMeta,
        offer: payload.offer,
        received: false,
        transferState: "idle",
        ts: Date.now(),
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
        socketIdMap.current.set(`${payload.msgId}_receiver`, payload.receiverSocketId);
        const flush = socketIdMap.current.get(`${payload.msgId}_flush`);
        if (typeof flush === "function") {
          flush(payload.receiverSocketId);
          socketIdMap.current.delete(`${payload.msgId}_flush`);
        }
      }

      try {
        await session.setRemoteDescription(payload.answer);
      } catch (error) {
        console.error("[webrtc] setRemoteDescription failed", error);
      }
    };

    const onIceCandidate = async (payload: { candidate: RTCIceCandidateInit; msgId: string }) => {
      const session = peerRefs.current.get(payload.msgId);
      if (!session) return;

      try {
        await session.addIceCandidate(payload.candidate);
      } catch (error) {
        console.error("[webrtc] addIceCandidate failed", error);
      }
    };

    const onError = (value: unknown) => {
      const text = typeof value === "string" ? value : (value as { message?: string })?.message ?? "Unknown error";
      if (!joinedRef.current) {
        setNameError(text);
        setJoining(false);
        hasJoinedRoom.current = false;
        disconnectSocket();
      } else {
        toast.error(text);
      }
    };

    const onTyping = ({ name: typingName }: { name: string }) => {
      setTypingUsers((prev) => prev.includes(typingName) ? prev : [...prev, typingName]);
    };

    const onStopTyping = ({ name: typingName }: { name: string }) => {
      setTypingUsers((prev) => prev.filter((entry) => entry !== typingName));
    };

    socket.on("connect", onConnect);
    socket.on("connect_error", onConnectError);
    socket.on("disconnect", onDisconnect);
    socket.on("room_users", onRoomUsers);
    socket.on("user_joined", onUserJoined);
    socket.on("user_left", onUserLeft);
    socket.on("receive_message", onReceiveMessage);
    socket.on("receive_media", onReceiveMedia);
    socket.on("webrtc_offer", onWebrtcOffer);
    socket.on("webrtc_answer", onWebrtcAnswer);
    socket.on("ice_candidate", onIceCandidate);
    socket.on("error", onError);
    socket.on("typing", onTyping);
    socket.on("stop_typing", onStopTyping);

    return () => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
      socket.off("disconnect", onDisconnect);
      socket.off("room_users", onRoomUsers);
      socket.off("user_joined", onUserJoined);
      socket.off("user_left", onUserLeft);
      socket.off("receive_message", onReceiveMessage);
      socket.off("receive_media", onReceiveMedia);
      socket.off("webrtc_offer", onWebrtcOffer);
      socket.off("webrtc_answer", onWebrtcAnswer);
      socket.off("ice_candidate", onIceCandidate);
      socket.off("error", onError);
      socket.off("typing", onTyping);
      socket.off("stop_typing", onStopTyping);
    };
  }, []);

  useEffect(() => {
    if (!joining || joined) return;

    const timer = window.setTimeout(() => {
      if (!joinedRef.current) {
        setJoining(false);
        setNameError("Joining is taking too long. Please try again.");
        hasJoinedRoom.current = false;
        disconnectSocket();
      }
    }, JOIN_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [joining, joined]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setMessageFontSize((current) => Math.min(20, current + 1));
      }

      if (e.key === "-") {
        e.preventDefault();
        setMessageFontSize((current) => Math.max(13, current - 1));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleNicknameSubmit = (e: FormEvent) => {
    e.preventDefault();
    setNameError(null);

    const chosenName = nameInput.trim();
    if (!VALID.test(chosenName)) {
      setNameError("1-24 chars, letters, numbers, underscores only.");
      return;
    }

    setName(chosenName);
    nameRef.current = chosenName;
    setJoining(true);

    connectSocket();
    if (socket.connected && !hasJoinedRoom.current) {
      hasJoinedRoom.current = true;
      socket.emit("join_room", { name: chosenName, room });
    }
  };

  const handleSend = (text: string) => {
    const CODE_PREFIX = /^code:\s*/i;
    const isCode = CODE_PREFIX.test(text);
    const payload = isCode ? text.replace(CODE_PREFIX, "") : text;
    let wireMessage = text;
    const messageId = uid();
    const ts = Date.now();

    if (replyTo) {
      wireMessage = `__reply__${JSON.stringify(replyTo)}__endreply__\n${text}`;
    }

    socket.emit("send_message", { id: messageId, room, author: name, message: wireMessage, ts });
    setMessages((prev) => [
      ...prev,
      isCode
        ? { kind: "code", id: messageId, author: name, code: payload, mine: true, ts, replyTo: replyTo ?? undefined }
        : { kind: "message", id: messageId, author: name, message: payload, mine: true, ts, replyTo: replyTo ?? undefined },
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

    if (isInlineMedia(file)) {
      const messageId = uid();
      const ts = Date.now();
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        setMessages((prev) => [...prev, {
          kind: "media",
          id: messageId,
          author: name,
          mine: true,
          dataUrl,
          fileMeta,
          ts,
          replyTo: replyTo ?? undefined,
        }]);
        socket.emit("send_media", { id: messageId, room, author: name, dataUrl, fileMeta, ts, replyTo: replyTo ?? undefined });
      };
      reader.readAsDataURL(file);
      setReplyTo(null);
      return;
    }

    const msgId = uid();
    setMessages((prev) => [...prev, {
      kind: "file_offer",
      id: msgId,
      author: name,
      mine: true,
      fileMeta,
      offer: null,
      received: false,
      transferState: "connecting",
      transferPercent: 0,
      ts: Date.now(),
    }]);

    const updateMessage = (patch: Partial<Extract<ChatMessage, { kind: "file_offer" }>>) => {
      setMessages((prev) => prev.map((message) =>
        message.id === msgId && message.kind === "file_offer" ? { ...message, ...patch } : message
      ));
    };

    const pendingIce: RTCIceCandidateInit[] = [];
    let receiverKnown = false;

    const flushIce = (targetSocketId: string) => {
      receiverKnown = true;
      for (const candidate of pendingIce) {
        socket.emit("ice_candidate", { candidate, msgId, targetSocketId });
      }
      pendingIce.length = 0;
    };

    socketIdMap.current.set(`${msgId}_flush`, flushIce);

    try {
      const { session, offer } = await createSenderPeer(
        file,
        (candidate) => {
          const targetSocketId = socketIdMap.current.get(`${msgId}_receiver`);
          if (!receiverKnown || typeof targetSocketId !== "string" || !targetSocketId) {
            pendingIce.push(candidate);
          } else {
            socket.emit("ice_candidate", { candidate, msgId, targetSocketId });
          }
        },
        {
          onProgress: ({ percent }) => updateMessage({ transferState: "transferring", transferPercent: percent }),
          onComplete: () => {
            updateMessage({ transferState: "done", transferPercent: 100 });
            peerRefs.current.get(msgId)?.close();
            peerRefs.current.delete(msgId);
          },
          onError: (error) => {
            toast.error(`Transfer failed: ${error}`);
            updateMessage({ transferState: "error", transferError: error });
            peerRefs.current.get(msgId)?.close();
            peerRefs.current.delete(msgId);
          },
        },
      );

      peerRefs.current.set(msgId, session);
      socket.emit("webrtc_offer", { room, offer, fileMeta, msgId });
    } catch (error) {
      toast.error("Failed to initiate file transfer.");
      console.error("[webrtc] sender init failed", error);
    }
  };

  const handleReceiveFile = async (msgId: string) => {
    const msg = messages.find((entry) => entry.id === msgId);
    if (!msg || msg.kind !== "file_offer" || msg.mine) return;

    const targetSocketId = socketIdMap.current.get(msgId);
    if (typeof targetSocketId !== "string") return;

    const updateMessage = (patch: Partial<Extract<ChatMessage, { kind: "file_offer" }>>) => {
      setMessages((prev) => prev.map((entry) =>
        entry.id === msgId && entry.kind === "file_offer" ? { ...entry, ...patch } : entry
      ));
    };

    updateMessage({ received: true, transferState: "connecting", transferPercent: 0 });

    try {
      const { session, answer } = await createReceiverPeer(
        msg.offer as RTCSessionDescriptionInit,
        {
          name: msg.fileMeta.name,
          size: msg.fileMeta.size,
          mimeType: msg.fileMeta.mimeType ?? "",
        },
        (candidate) => socket.emit("ice_candidate", { candidate, msgId, targetSocketId }),
        {
          onProgress: ({ percent }) => updateMessage({ transferState: "transferring", transferPercent: percent }),
          onComplete: (blob) => {
            updateMessage({ transferState: "done", transferPercent: 100, downloadBlob: blob });
            peerRefs.current.get(msgId)?.close();
            peerRefs.current.delete(msgId);
          },
          onError: (error) => {
            toast.error(`Transfer failed: ${error}`);
            updateMessage({ transferState: "error", transferError: error });
            peerRefs.current.get(msgId)?.close();
            peerRefs.current.delete(msgId);
          },
        },
      );

      peerRefs.current.set(msgId, session);
      socket.emit("webrtc_answer", { answer, msgId, targetSocketId });
    } catch (error) {
      toast.error("Failed to accept file transfer.");
      console.error("[webrtc] receiver init failed", error);
    }
  };

  const handleDownloadFile = useCallback((msgId: string) => {
    const msg = messages.find((entry) => entry.id === msgId);
    if (!msg || msg.kind !== "file_offer" || !msg.downloadBlob) return;
    triggerDownload(msg.downloadBlob, msg.fileMeta.name);
  }, [messages]);

  const handleReply = useCallback((msgId: string) => {
    const msg = messages.find((entry) => entry.id === msgId);
    if (!msg || msg.kind === "system") return;

    const preview = msg.kind === "message"
      ? msg.message.slice(0, 80)
      : msg.kind === "code"
        ? msg.code.slice(0, 80)
        : msg.kind === "media"
          ? `[media] ${msg.fileMeta.name}`
          : msg.fileMeta.name;

    setReplyTo({ id: msgId, author: msg.author, preview });
  }, [messages]);

  const leave = () => {
    peerRefs.current.forEach((session) => session.close());
    peerRefs.current.clear();
    socketIdMap.current.clear();
    hasJoinedRoom.current = false;
    disconnectSocket();
    navigate("/");
  };

  const copyInviteLink = () => {
    const url = `${window.location.origin}/${encodeURIComponent(room)}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  if (!VALID.test(room)) return null;

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
                disabled={joining}
                className="bg-secondary/60 border-border h-11"
              />
            </div>
            {nameError && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                {nameError}
              </div>
            )}
            <Button type="submit" disabled={joining} className="w-full h-11 text-base font-semibold">
              {joining ? "Checking..." : "Enter Room"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

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
          <div className="watermark-layer" aria-hidden="true" />

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
                <div className="mb-5 flex justify-center">
                  <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-2.5 text-[11px] text-white/90 shadow-[0_0_26px_rgba(255,255,255,0.03)] backdrop-blur-md">
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <Code2 className="h-3.5 w-3.5 text-primary/90" />
                      <span>Use <code className="font-mono text-white">code:</code> for snippets</span>
                    </span>
                    <span className="h-3 w-px bg-white/12" />
                    <span className="flex items-center gap-1.5 whitespace-nowrap text-white/82">
                      <FolderUp className="h-3.5 w-3.5 text-primary/90" />
                      <span>Folder sends ZIP</span>
                    </span>
                  </div>
                </div>

                {messages.length === 0 && (
                  <div className="text-center text-muted-foreground text-sm py-12">No messages yet. Say hi.</div>
                )}
                {messages.map((message, index) => (
                  <MessageBubble
                    key={message.id}
                    msg={message}
                    textSize={messageFontSize}
                    prevMsg={messages[index - 1]}
                    nextMsg={messages[index + 1]}
                    onReceiveFile={handleReceiveFile}
                    onDownloadFile={handleDownloadFile}
                    onReply={handleReply}
                  />
                ))}
              </div>
            </div>

            <div className="chat-compose shrink-0">
              <TypingIndicator typingUsers={typingUsers} />
              <InputBar
                onSend={handleSend}
                onFile={handleFile}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
                onTyping={() => socket.emit("typing", { name, room })}
                onStopTyping={() => socket.emit("stop_typing", { name, room })}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
