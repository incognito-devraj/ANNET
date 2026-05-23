import { useEffect, useRef, useState, useCallback, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Code2, Copy, FolderUp, Mail, VenetianMask } from "lucide-react";
import { socket, connectSocket, disconnectSocket, leaveSocketRoom } from "@/lib/socket";
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
const JOIN_TIMEOUT_MS = 25000;
const EMIT_ACK_TIMEOUT_MS = 15000;
// Small media threshold: ≤ 5 MB → socket (fire-and-forget), > 5 MB → WebRTC P2P
const MAX_SOCKET_MEDIA_SIZE = 5 * 1024 * 1024;


function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function copyTextFallback(value: string) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
      <path d="M19.1 4.9A9.86 9.86 0 0 0 12 2a9.92 9.92 0 0 0-8.6 14.87L2 22l5.29-1.38A9.92 9.92 0 0 0 12 22a10 10 0 0 0 7.1-17.1ZM12 20.2a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.14.82.84-3.06-.2-.31A8.15 8.15 0 1 1 12 20.2Zm4.47-6.08c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06a6.62 6.62 0 0 1-1.95-1.2 7.3 7.3 0 0 1-1.36-1.7c-.14-.24-.02-.37.1-.5.1-.1.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.48-.4-.42-.54-.42h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.04.4 1.4.5.58.18 1.1.16 1.52.1.46-.06 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
      <path d="M21.5 4.4 18.4 19c-.24 1.04-.88 1.3-1.78.82l-4.94-3.64-2.38 2.28c-.26.26-.48.48-.98.48l.36-5.06 9.2-8.3c.4-.36-.08-.56-.62-.2L6.02 12.44 1.2 10.94c-1.04-.32-1.06-1.04.22-1.54L20.3 2.12c.88-.32 1.64.2 1.2 2.28Z" />
    </svg>
  );
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
  const [joinStatus, setJoinStatus] = useState("Connecting...");
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
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


  const emitWithAck = useCallback(<T,>(event: string, payload: unknown, timeoutMs = EMIT_ACK_TIMEOUT_MS) => (
    new Promise<T>((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`${event} timed out`));
      }, timeoutMs);

      socket.emit(event, payload, (response: T) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(response);
      });
    })
  ), []);

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
      // Only re-join if the user had already submitted their nickname
      // (i.e. a mid-session reconnect). Do NOT auto-join on first connect —
      // that would race with handleNicknameSubmit.
      if (nameRef.current && roomRef.current && hasJoinedRoom.current) {
        setJoinStatus(`Rejoining #${roomRef.current}...`);
        socket.emit("join_room", {
          name: nameRef.current,
          room: roomRef.current,
        });
      }
    };

    const onDisconnect = () => {
      setConnected(false);
      hasJoinedRoom.current = false;
      setJoinStatus(joinedRef.current ? "Connection recovering..." : "Connection dropped. Reconnecting...");
    };

    const onConnectError = () => {
      if (!joinedRef.current) {
        setJoinStatus("Connection issue. Please try again.");
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

    const onReceiveMedia = (payload: {
      id: string;
      author: string;
      dataUrl: string;
      fileMeta: FileMeta;
      ts?: number;
      replyTo?: ReplyTo;
    }) => {
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
        setNameError("Connection is taking longer than expected. Please try again.");
        hasJoinedRoom.current = false;
        setJoinStatus("Please retry.");
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

    // Mark that we've initiated a join so onConnect won't double-emit
    hasJoinedRoom.current = true;

    connectSocket();
    if (socket.connected) {
      setJoinStatus(`Joining #${room}...`);
      socket.emit("join_room", { name: chosenName, room });
    }
    // If not yet connected, onConnect will fire and re-emit because
    // hasJoinedRoom is true and nameRef/roomRef are set.
  };

  const ensureRoomReady = useCallback(() => {
    if (socket.connected && joinedRef.current) return true;
    toast.error("Not connected to the room.");
    return false;
  }, []);

  const handleSend = async (text: string) => {
    if (!ensureRoomReady()) return;

    const CODE_PREFIX = /^code:\s*/i;
    const isCode = CODE_PREFIX.test(text);
    const payload = isCode ? text.replace(CODE_PREFIX, "") : text;
    let wireMessage = text;
    const messageId = uid();
    const ts = Date.now();

    if (replyTo) {
      wireMessage = `__reply__${JSON.stringify(replyTo)}__endreply__\n${text}`;
    }

    setMessages((prev) => [
      ...prev,
      isCode
        ? { kind: "code", id: messageId, author: name, code: payload, mine: true, ts, replyTo: replyTo ?? undefined }
        : { kind: "message", id: messageId, author: name, message: payload, mine: true, ts, replyTo: replyTo ?? undefined },
    ]);
    setReplyTo(null);

    try {
      await emitWithAck<{ ok?: boolean }>("send_message", { id: messageId, room, author: name, message: wireMessage, ts });
    } catch {
      toast.error("Message couldn't be delivered. Please try again.");
    }
    };

  const handleFile = async (file: File) => {
    const fileMeta: FileMeta = { name: file.name, size: file.size, mimeType: file.type };
    const check = checkFileSecurity(file.name, file.size, file.type);
    if (!check.ok) {
      toast.error(getSecurityReason(check));
      return;
    }

    if (!ensureRoomReady()) return;

    const isSmallMedia =
      file.size <= MAX_SOCKET_MEDIA_SIZE &&
      (file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/"));

    // ── Small media path: ≤ 5 MB image / video / audio → socket, fire-and-forget
    if (isSmallMedia) {
      const msgId = uid();
      const ts = Date.now();
      const currentReplyTo = replyTo ?? undefined;

      // Read as data URL — only error we surface is a FileReader failure
      let dataUrl: string;
      try {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });
      } catch {
        toast.error("Could not read the file.");
        return;
      }

      // Render instantly on sender's screen
      setMessages((prev) => [...prev, {
        kind: "media",
        id: msgId,
        author: name,
        mine: true,
        dataUrl,
        fileMeta,
        ts,
        replyTo: currentReplyTo,
      }]);
      setReplyTo(null);

      // Fire-and-forget — no ack, no timeout, no retry
      socket.emit("send_media", { id: msgId, room, author: name, dataUrl, fileMeta, ts, replyTo: currentReplyTo });
      return;
    }

    // ── Large file path: > 5 MB or non-media → WebRTC P2P ───────────────────
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
    joinedRef.current = false;
    setJoined(false);
    setConnected(false);
    setUsers([]);
    setTypingUsers([]);
    setMessages([]);

    void leaveSocketRoom({ room, name: nameRef.current, sessionId: "" }).finally(() => {
      disconnectSocket();
      navigate("/");
    });
  };

  const copyInviteLink = async () => {
    const url = `${window.location.origin}/${encodeURIComponent(room)}`;

    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else if (!copyTextFallback(url)) {
        throw new Error("Clipboard unavailable");
      }

      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
      return true;
    } catch {
      toast.error("Couldn't copy the room link automatically on this device.");
      return false;
    }
    };

  const getSharePayload = () => {
    const url = `${window.location.origin}/${encodeURIComponent(room)}`;
    const text = `Hey let's connect anonymously here in my ANNET room : ${url}`;
    return { url, text };
  };

  const openShareTarget = (target: "whatsapp" | "telegram" | "email") => {
    const { url, text } = getSharePayload();
    const encodedText = encodeURIComponent(text);

    const targetUrl = target === "whatsapp"
      ? `https://wa.me/?text=${encodedText}`
      : target === "telegram"
        ? `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodedText}`
        : `mailto:?subject=${encodeURIComponent("Join my ANNET room")}&body=${encodedText}`;

    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  const shareInvite = async () => {
    const copied = await copyInviteLink();
    setShareDialogOpen(true);
    if (copied) {
      setTimeout(() => setLinkCopied(false), 2000);
    }
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
              {joining ? "Joining..." : "Enter Room"}
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
              shareCopied={linkCopied}
              onToggleMembers={() => setSidebarOpen((current) => !current)}
              onShareInvite={shareInvite}
              onLeave={leave}
            />

            {shareDialogOpen && (
              <div
                className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center bg-black/60 px-3 pb-4 sm:px-4 sm:pb-0"
                role="dialog"
                aria-modal="true"
                aria-label="Share room invite"
                onClick={(e) => { if (e.target === e.currentTarget) setShareDialogOpen(false); }}
              >
                <div className="w-full max-w-[360px] rounded-3xl border border-white/10 bg-[#11151c]/98 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] uppercase tracking-[0.22em] text-white/45">Share invite</span>
                  </div>

                  {/* Invite text */}
                  <p className="mt-2 text-sm leading-6 text-white/80">
                    Hey let&apos;s connect anonymously here in my ANNET room:
                  </p>

                  {/* Room URL pill */}
                  <p className="mt-2 break-all rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-[13px] text-emerald-300/90 font-mono">
                    {`${window.location.origin}/${encodeURIComponent(room)}`}
                  </p>

                  {/* Share buttons — 2 columns on mobile, 4 on wider screens */}
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {/* WhatsApp */}
                    <button
                      type="button"
                      onClick={() => openShareTarget("whatsapp")}
                      className="flex flex-col items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-2 py-3 text-white hover:bg-white/[0.07] active:scale-95 transition-all"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_0_12px_rgba(37,211,102,0.35)]">
                        <WhatsAppIcon />
                      </span>
                      <span className="text-[11px] text-white/80 leading-tight">WhatsApp</span>
                    </button>

                    {/* Telegram */}
                    <button
                      type="button"
                      onClick={() => openShareTarget("telegram")}
                      className="flex flex-col items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-2 py-3 text-white hover:bg-white/[0.07] active:scale-95 transition-all"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#229ED9] text-white shadow-[0_0_12px_rgba(34,158,217,0.35)]">
                        <TelegramIcon />
                      </span>
                      <span className="text-[11px] text-white/80 leading-tight">Telegram</span>
                    </button>

                    {/* Email */}
                    <button
                      type="button"
                      onClick={() => openShareTarget("email")}
                      className="flex flex-col items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-2 py-3 text-white hover:bg-white/[0.07] active:scale-95 transition-all"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white">
                        <Mail className="h-5 w-5" />
                      </span>
                      <span className="text-[11px] text-white/80 leading-tight">Email</span>
                    </button>
                  </div>

                  {/* Footer actions */}
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-white/60 hover:text-white hover:bg-white/[0.06]"
                      onClick={() => setShareDialogOpen(false)}
                    >
                      Close
                    </Button>
                    <Button
                      type="button"
                      className="inline-flex items-center gap-2 bg-primary/90 hover:bg-primary text-white font-medium"
                      onClick={async () => { await copyInviteLink(); }}
                    >
                      <Copy className="h-4 w-4" />
                      {linkCopied ? "Copied!" : "Copy link"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

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




