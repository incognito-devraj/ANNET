import { useEffect, useRef, useState, useCallback, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Code2, FolderUp, VenetianMask } from "lucide-react";
import { socket, connectSocket, disconnectSocket, warmBackend } from "@/lib/socket";
import {
  checkFileSecurity,
  getSecurityReason,
  createSenderPeer,
  createReceiverPeer,
  triggerDownload,
  PeerSession,
} from "@/lib/webrtc";
import { ChatTopBar, MemberPanel } from "@/components/chat/Sidebar";
import MessageBubble from "@/components/chat/MessageBubble";
import InputBar from "@/components/chat/InputBar";
import TypingIndicator from "@/components/chat/TypingIndicator";
import { ChatMessage, ChatUser, FileMeta, ReplyTo } from "@/types/chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const VALID = /^[A-Za-z0-9_]{1,24}$/;
const INLINE_LIMIT = 5 * 1024 * 1024; // 5 MB
const JOIN_TIMEOUT_MS = 25000;

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
  const [joinStatus, setJoinStatus] = useState("Waking up the chat server...");
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [sharingInvite, setSharingInvite] = useState(false);
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
    void warmBackend();
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
      setJoinStatus("Connected. Enter a nickname to continue.");
      if (!hasJoinedRoom.current && nameRef.current && roomRef.current) {
        hasJoinedRoom.current = true;
        setJoinStatus(`Joining #${roomRef.current}...`);
        socket.emit("join_room", { name: nameRef.current, room: roomRef.current });
      }
    };

    const onDisconnect = () => {
      setConnected(false);
      hasJoinedRoom.current = false;
      if (!joinedRef.current) {
        setJoinStatus("Connection dropped. Reconnecting...");
      }
    };

    const onConnectError = () => {
      if (!joinedRef.current) {
        setJoinStatus("Starting the chat server... this can take a few seconds.");
      }
    };

    const onJoinSuccess = (payload: { users?: unknown }) => {
      if (Array.isArray(payload.users)) {
        setUsers(payload.users.map((user) =>
          typeof user === "string" ? { name: user } : { id: user?.id, name: user?.name ?? String(user) }
        ));
      }

      setJoining(false);
      setJoined(true);
      setNameError(null);
      setJoinStatus("Connected.");
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
        setJoinStatus("Enter a different nickname to continue.");
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
    socket.on("join_success", onJoinSuccess);
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
      socket.off("join_success", onJoinSuccess);
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
        setNameError("Server wake-up is taking longer than expected. Please try again in a moment.");
        hasJoinedRoom.current = false;
        setJoinStatus("Still reconnecting. You can retry now.");
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
    setJoinStatus(connected ? `Joining #${room}...` : "Connecting to chat server...");

    connectSocket();
    if (socket.connected && !hasJoinedRoom.current) {
      hasJoinedRoom.current = true;
      setJoinStatus(`Joining #${room}...`);
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
      toast.success("Room link copied.");
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const shareInvite = async () => {
    const url = `${window.location.origin}/${encodeURIComponent(room)}`;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        setSharingInvite(true);
        await navigator.share({
          title: `Join #${room} on Annet`,
          text: `Join my Annet room #${room}`,
          url,
        });
      } catch (error) {
        if ((error as DOMException)?.name !== "AbortError") {
          toast.error("Couldn't open the share sheet. Link copied instead.");
          copyInviteLink();
        }
      } finally {
        setSharingInvite(false);
      }
      return;
    }

    copyInviteLink();
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
            <p className="text-muted-foreground mt-1 text-sm">
              {joining ? joinStatus : "Pick a nickname to enter"}
            </p>
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
            {!nameError && !connected && (
              <div className="text-sm text-emerald-100/80 bg-emerald-500/10 border border-emerald-400/20 rounded-md px-3 py-2">
                {joinStatus}
              </div>
            )}
            <Button type="submit" disabled={joining} className="w-full h-11 text-base font-semibold">
              {joining ? "Joining..." : connected ? "Enter Room" : "Wake & Enter"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-[100svh] md:h-[100dvh] overflow-hidden bg-black">
      <MemberPanel
        users={users}
        currentName={name}
        open={sidebarOpen}
        mobile
        topOffsetClassName="top-[72px]"
        onClose={() => setSidebarOpen(false)}
      />
      <MemberPanel users={users} currentName={name} open={sidebarOpen} topOffsetClassName="top-[72px]" />

      <div className="flex-1 min-w-0 overflow-hidden">
        <main className="chat-container">
          <div className="bg-layer" aria-hidden="true" />
          <div className="overlay-layer" aria-hidden="true" />
          <div className="noise-layer" aria-hidden="true" />
          <div className="watermark-layer" aria-hidden="true" />

          <div className="chat-content">
            <ChatTopBar
              room={room}
              usersCount={users.length}
              connected={connected}
              sidebarOpen={sidebarOpen}
              onToggleMembers={() => setSidebarOpen((current) => !current)}
              onShareInvite={shareInvite}
              onLeave={leave}
            />

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
