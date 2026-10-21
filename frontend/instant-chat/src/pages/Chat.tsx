import { useEffect, useRef, useState, useCallback, FormEvent } from "react";
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Camera, Code2, Copy, FolderUp, Mail, Paperclip } from "lucide-react";
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
import InputBar, { type InputBarHandle } from "@/components/chat/InputBar";
import TypingIndicator from "@/components/chat/TypingIndicator";
import CameraCapture from "@/components/chat/CameraCapture";
import { ChatMessage, ChatUser, FileMeta, ReplyTo } from "@/types/chat";
import { albumImageUrl, albumZipUrl, listAlbums, registerAlbumSession, uploadAlbum } from "@/lib/albums";


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

let audioCtx;

function getAudioContext() {
  if (!audioCtx) {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioCtx();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  return audioCtx;
}

function playNotificationSound() {
  try {
    const ctx = getAudioContext();

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.type = "sine";
    osc2.type = "triangle";

    osc1.frequency.setValueAtTime(660, ctx.currentTime);
    osc2.frequency.setValueAtTime(880, ctx.currentTime);

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);

    osc1.start();
    osc2.start();

    osc1.stop(ctx.currentTime + 0.35);
    osc2.stop(ctx.currentTime + 0.35);
  } catch (err) {
    console.log("Notification sound failed:", err);
  }
}

// Unlock audio on first user interaction
document.addEventListener(
  "click",
  () => {
    getAudioContext().resume();
  },
  { once: true }
);

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
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const shareDialogRef = useRef<HTMLDivElement>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [messageFontSize, setMessageFontSize] = useState(15);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const lastClickRef = useRef(0);
  const clickCountRef = useRef(0);
  const tapResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePointerIdsRef = useRef<Set<number>>(new Set());
  const multiPointerRef = useRef(false);
  const movedPointerIdsRef = useRef<Set<number>>(new Set());
  const pointerStartRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const eligiblePointerIdsRef = useRef<Set<number>>(new Set());
  const cameraHistoryRef = useRef(false);
  const cameraOpenRef = useRef(false);
  const cameraCaptureClosingRef = useRef(false);
  const backPromptedRef = useRef(false);
  const dragDepthRef = useRef(0);

  const tabFocused = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputBarRef = useRef<InputBarHandle>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const hasJoinedRoom = useRef(false);
  const joinedRef = useRef(false);
  const nameRef = useRef(name);
  const roomRef = useRef(room);
  const peerRefs = useRef<Map<string, PeerSession>>(new Map());
  const socketIdMap = useRef<Map<string, string | ((id: string) => void)>>(new Map());
  const albumTokenRef = useRef<string | null>(null);
  const albumReadyRef = useRef<Promise<void> | null>(null);
  const albumUploadControllersRef = useRef<Map<string, AbortController>>(new Map());

  const inviteUrl = `${window.location.origin}/${encodeURIComponent(room)}`;

  useEffect(() => {
    if (!shareDialogOpen) return;

    let cancelled = false;
    setQrCodeDataUrl(null);
    void QRCode.toDataURL(inviteUrl, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0d0f12", light: "#ffffff" },
    }).then((dataUrl) => {
      if (!cancelled) setQrCodeDataUrl(dataUrl);
    }).catch(() => {
      if (!cancelled) toast.error("Couldn't generate the room QR code.");
    });

    return () => { cancelled = true; };
  }, [inviteUrl, shareDialogOpen]);

  useEffect(() => {
    if (!shareDialogOpen) return;
    const closeOnOutsideTouch = (event: PointerEvent) => {
      if (!shareDialogRef.current?.contains(event.target as Node)) setShareDialogOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideTouch, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsideTouch, true);
  }, [shareDialogOpen]);


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
    const activePointerIds = activePointerIdsRef.current;
    return () => {
      peerRefs.current.forEach((session) => session.close());
      peerRefs.current.clear();
      socketIdMap.current.clear();
      hasJoinedRoom.current = false;
      joinedRef.current = false;
      if (tapResetTimer.current) clearTimeout(tapResetTimer.current);
      activePointerIds.clear();
      movedPointerIdsRef.current.clear();
      pointerStartRef.current.clear();
      eligiblePointerIdsRef.current.clear();
      multiPointerRef.current = false;
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
    cameraOpenRef.current = cameraOpen;
  }, [cameraOpen]);

  useEffect(() => {
    if (!joined) return;
    // Keep the first browser Back inside the room so accidental presses can
    // be confirmed. The second Back confirms the leave action.
    window.history.pushState({ ...window.history.state, annetRoom: true }, "", window.location.href);
    const onPopState = () => {
      if (cameraCaptureClosingRef.current) {
        cameraCaptureClosingRef.current = false;
        return;
      }
      // A photo viewer owns the first Back press. Do not turn it into a room
      // leave action; the viewer's own popstate handler will close it.
      if (document.querySelector("[data-album-viewer=\"true\"]")) return;
      // Camera history belongs to the camera overlay, never to room exit.
      if (cameraOpenRef.current || document.querySelector("[data-camera-overlay=\"true\"]")) return;
      if (backPromptedRef.current) {
        backPromptedRef.current = false;
        leave();
        return;
      }
      backPromptedRef.current = true;
      setLeaveDialogOpen(true);
      window.history.pushState({ ...window.history.state, annetRoom: true }, "", window.location.href);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [joined]);

  useEffect(() => {
      const onConnect = () => {
      setConnected(true);
      setJoinStatus(`Joining #${roomRef.current}...`);
      // Emit join_room whenever we have a room and have initiated a join
      // (first connect from auto-join on mount, or mid-session reconnect)
      if (roomRef.current && hasJoinedRoom.current) {
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

    const onJoinSuccess = (payload: { users?: unknown; user?: { name?: string }; albumSessionToken?: string }) => {
      const assignedName = payload.user?.name;
      if (assignedName) {
        setName(assignedName);
        nameRef.current = assignedName;
      }
      if (Array.isArray(payload.users)) {
        setUsers(payload.users.map((user) =>
          typeof user === "string" ? { name: user } : { id: user?.id, name: user?.name ?? String(user) }
        ));
      }
      setJoining(false);
      setJoined(true);
      setNameError(null);
      setJoinStatus("Connected.");
      if (payload.albumSessionToken) {
        const token = payload.albumSessionToken;
        albumTokenRef.current = token;
        sessionStorage.setItem(`annet_album_token_${roomRef.current}`, token);
        albumReadyRef.current = registerAlbumSession(roomRef.current, assignedName || nameRef.current, token).then(async () => {
          const history = await listAlbums(roomRef.current, token);
          setMessages((prev) => { const known = new Set(prev.map((message) => message.id)); return [...prev, ...history.filter((album) => !known.has(album.id)).map((album) => ({ kind: "album" as const, id: album.id, author: album.author, mine: album.author === (assignedName || nameRef.current), album: { ...album, zipUrl: albumZipUrl(roomRef.current, token, album.id), attachments: album.attachments.map((item) => ({ ...item, url: albumImageUrl(roomRef.current, token, album.id, item.id) })) }, ts: album.ts }))]; });
        }).catch((error) => { albumReadyRef.current = null; toast.error(`Album storage unavailable: ${error instanceof Error ? error.message : "backend not reachable"}`); throw error; });
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
    const onAlbumCreated = (album: import("@/types/chat").Album) => {
      const token = sessionStorage.getItem(`annet_album_token_${roomRef.current}`);
      if (!token) return;
      playNotificationSound();
      setMessages((prev) => prev.some((message) => message.id === album.id) ? prev : [...prev, { kind: "album", id: album.id, author: album.author, mine: album.author === nameRef.current, album: { ...album, zipUrl: albumZipUrl(roomRef.current, token, album.id), attachments: album.attachments.map((item) => ({ ...item, url: albumImageUrl(roomRef.current, token, album.id, item.id) })) }, ts: album.ts }]);
    };
    const onWebrtcOffer = (payload: {
      offer: RTCSessionDescriptionInit;
      fileMeta: FileMeta;
      msgId: string;
      senderSocketId: string;
      senderName?: string;
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
        author: payload.senderName ?? "peer",
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
        // If the auto-generated serial name was rejected (e.g. collision), bump the counter and retry
        const currentName = nameRef.current;
        if (/^\d+_Anneter$/.test(currentName)) {
          const seqKey = `annet_seq_${room}`;
          const seq = parseInt(localStorage.getItem(seqKey) ?? "0", 10) + 1;
          localStorage.setItem(seqKey, String(seq));
          const retryName = `${seq}_Anneter`;
          setNameInput(retryName);
          joinRoom(retryName);
          return;
        }
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
    socket.on("album_created", onAlbumCreated);
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
      socket.off("album_created", onAlbumCreated);
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

  // ── Screenshot deterrence ────────────────────────────────────────────────
  // Browsers cannot truly block screenshots, but we can:
  //   1. Detect PrintScreen key → clear clipboard + show warning
  //   2. Hide content via @media print CSS (already in index.css)
  const [screenshotWarning, setScreenshotWarning] = useState(false);

  useEffect(() => {
    if (!joined) return;

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen" || e.code === "PrintScreen") {
        setScreenshotWarning(true);
        setTimeout(() => setScreenshotWarning(false), 2500);
        toast.info("Annet cannot block OS screenshots or screen recording.", { duration: 3000 });
      }
    };

    // Also intercept Ctrl+Shift+S / Ctrl+P (Save/Print shortcuts)
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        toast.error("Printing is not allowed in Annet.", { duration: 2500 });
      }
    };

    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [joined]);

  // Core join logic shared by the form submit and the sessionStorage auto-join
  const joinRoom = (chosenName: string) => {
    setName(chosenName);
    nameRef.current = chosenName;
    if (chosenName) sessionStorage.setItem(`annet_name_${room}`, chosenName);
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

  const handleNicknameSubmit = (e: FormEvent) => {
    e.preventDefault();
    setNameError(null);

    const chosenName = nameInput.trim();
    if (chosenName && !VALID.test(chosenName)) {
      setNameError("1-24 chars, letters, numbers, underscores only.");
      return;
    }

    joinRoom(chosenName);
  };

  // Always auto-join on mount — generate N_Anneter serial name if no nickname was set
  useEffect(() => {
    const pending = sessionStorage.getItem("annet_pending_nick") ?? "";
    sessionStorage.removeItem("annet_pending_nick");
    const chosenName = pending.trim() || sessionStorage.getItem(`annet_name_${room}`) || "";

    let finalName: string;
    if (chosenName && VALID.test(chosenName)) {
      finalName = chosenName;
    } else {
      // Assign a per-room serial number stored in localStorage
      // Key: annet_seq_<room> → increments each time a new anonymous user joins
      const seqKey = `annet_seq_${room}`;
      const seq = parseInt(localStorage.getItem(seqKey) ?? "0", 10) + 1;
      localStorage.setItem(seqKey, String(seq));
      finalName = `${seq}_Anneter`;
    }

    setNameInput(finalName);
    sessionStorage.setItem(`annet_name_${room}`, finalName);
    joinRoom(finalName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // Every image, including a single photo, uses persistent HTTP storage.
    // Socket.IO is limited to the resulting album metadata notification.
    if (file.type.startsWith("image/")) {
      await handleAlbum([file]);
      return;
    }

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
      socket.emit("webrtc_offer", { room, offer, fileMeta, msgId, senderName: name });
    } catch (error) {
      toast.error("Failed to initiate file transfer.");
      console.error("[webrtc] sender init failed", error);
    }
  };

  const handleAlbum = async (files: File[], caption = "") => {
    if (!ensureRoomReady()) return;
    const valid = files.filter((file) => file.type.startsWith("image/"));
    if (!valid.length) { toast.error("Choose one or more images."); return; }
    if (albumReadyRef.current) {
      try { await albumReadyRef.current; } catch { return; }
    }
    const token = albumTokenRef.current || sessionStorage.getItem(`annet_album_token_${room}`);
    if (!token) { toast.error("Album storage is not ready yet."); return; }
    const placeholderId = uid();
    const controller = new AbortController();
    albumUploadControllersRef.current.set(placeholderId, controller);
    setMessages((prev) => [...prev, {
      kind: "system",
      id: placeholderId,
      message: `Uploading album (0/${valid.length})…`,
      ts: Date.now(),
      action: { label: "Cancel", onClick: () => controller.abort() },
    }]);
    try {
      const album = await uploadAlbum(room, token, valid, caption, (percent, completed) => setMessages((prev) => prev.map((message) => message.id === placeholderId && message.kind === "system" ? { ...message, message: `Uploading album (${completed}/${valid.length}) · ${percent}%` } : message)), controller.signal);
      setMessages((prev) => { const withoutPlaceholder = prev.filter((message) => message.id !== placeholderId); if (withoutPlaceholder.some((message) => message.id === album.id)) return withoutPlaceholder; return [...withoutPlaceholder, { kind: "album", id: album.id, author: nameRef.current, mine: true, album: { ...album, zipUrl: albumZipUrl(room, token, album.id), attachments: album.attachments.map((item) => ({ ...item, url: albumImageUrl(room, token, album.id, item.id) })) }, ts: album.ts }]; });
    } catch (error) {
      setMessages((prev) => prev.filter((message) => message.id !== placeholderId));
      if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : "Album upload failed.");
    } finally {
      albumUploadControllersRef.current.delete(placeholderId);
    }
  };

  const closeCamera = useCallback((afterCapture = false) => {
    cameraCaptureClosingRef.current = afterCapture && cameraHistoryRef.current && window.history.state?.annetCamera === true;
    setCameraOpen(false);
    if (cameraHistoryRef.current && window.history.state?.annetCamera) {
      cameraHistoryRef.current = false;
      window.history.back();
    }
  }, []);

  useEffect(() => {
    if (!cameraOpen) return;

    // Keep Android/browser Back inside the room while the camera overlay is open.
    window.history.pushState({ ...window.history.state, annetCamera: true }, "", window.location.href);
    cameraHistoryRef.current = true;
    const onPopState = () => {
      cameraHistoryRef.current = false;
      setCameraOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [cameraOpen]);

  const openCamera = useCallback(() => {
    // Try getUserMedia first regardless of isSecureContext —
    // it works on localhost and LAN in Chrome/Firefox even over HTTP.
    if (navigator.mediaDevices?.getUserMedia) {
      setCameraOpen(true);
    } else if (cameraInputRef.current) {
      // Last resort: native file picker with capture (mobile only, silently
      // opens gallery on desktop — acceptable as absolute fallback)
      cameraInputRef.current.click();
    } else {
      toast.error("Camera is not available in this browser.");
    }
  }, []);

  const handleScreenTap = (event: ReactPointerEvent<HTMLDivElement>) => {
    // The camera overlay owns all of its own pointer events.
    if (cameraOpen) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    activePointerIdsRef.current.add(event.pointerId);
    pointerStartRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    // Any concurrent pointer cancels the sequence. We still track it until all
    // pointers finish so a multi-finger swipe cannot resume the old sequence.
    if (event.pointerType === "touch" && !event.isPrimary) {
      multiPointerRef.current = true;
    }
    if (activePointerIdsRef.current.size > 1) {
      multiPointerRef.current = true;
    }

    if (multiPointerRef.current) {
      clickCountRef.current = 0;
      lastClickRef.current = 0;
      if (tapResetTimer.current) {
        clearTimeout(tapResetTimer.current);
        tapResetTimer.current = null;
      }
    }

    const target = event.target as HTMLElement;

    // Only respond to primary button / finger
    if (event.button !== 0 && event.pointerType === "mouse") return;

    // Ignore interactive elements and the composer
    if (!target.closest("button, input, textarea, a, [role=dialog], [role=button], select, label") && !target.closest(".chat-compose")) {
      eligiblePointerIdsRef.current.add(event.pointerId);
    }
  };

  const handleScreenPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current.get(event.pointerId);
    if (!start) return;

    // A swipe/drag is never a tap. A small threshold avoids cancelling from
    // normal touch jitter while rejecting finger swipes reliably.
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 24) {
      movedPointerIdsRef.current.add(event.pointerId);
      clickCountRef.current = 0;
      lastClickRef.current = 0;
      if (tapResetTimer.current) {
        clearTimeout(tapResetTimer.current);
        tapResetTimer.current = null;
      }
    }
  };

  const handleScreenPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    // A cancelled pointer (OS gesture, scroll takeover, etc.) is NEVER a tap
    const isCancelled = event.type === "pointercancel";

    const wasSingleCleanTap =
      !isCancelled &&
      activePointerIdsRef.current.size === 1 &&
      !multiPointerRef.current &&
      !movedPointerIdsRef.current.has(event.pointerId) &&
      eligiblePointerIdsRef.current.has(event.pointerId);

    activePointerIdsRef.current.delete(event.pointerId);
    movedPointerIdsRef.current.delete(event.pointerId);
    pointerStartRef.current.delete(event.pointerId);
    eligiblePointerIdsRef.current.delete(event.pointerId);

    if (wasSingleCleanTap) {
      const now = Date.now();
      if (now - lastClickRef.current > 500) clickCountRef.current = 0;
      clickCountRef.current += 1;
      lastClickRef.current = now;

      if (tapResetTimer.current) clearTimeout(tapResetTimer.current);
      tapResetTimer.current = setTimeout(() => { clickCountRef.current = 0; }, 500);

      if (clickCountRef.current >= 3) {
        clickCountRef.current = 0;
        clearTimeout(tapResetTimer.current!);
        tapResetTimer.current = null;
        event.preventDefault();
        window.getSelection()?.removeAllRanges();
        openCamera();
      }
    }

    // When all pointers are lifted/cancelled, reset multi-touch state so
    // the next independent gesture starts clean
    if (activePointerIdsRef.current.size === 0) {
      multiPointerRef.current = false;
      movedPointerIdsRef.current.clear();
      pointerStartRef.current.clear();
      eligiblePointerIdsRef.current.clear();
    }
  };

  const handleDragEnter = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!event.dataTransfer.types.includes("Files")) return;
    dragDepthRef.current += 1;
    setDraggingFiles(true);
  };

  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDraggingFiles(false);
  };

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setDraggingFiles(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) void Promise.all(files.map((file) => handleFile(file)));
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
          : msg.kind === "album"
            ? `[album] ${msg.album.attachments.length} photos`
          : msg.fileMeta.name;

    setReplyTo({ id: msgId, author: msg.author, preview });
    // Focus the input immediately so the user can start typing without
    // having to click — works for both swipe-to-reply and tap-to-reply
    requestAnimationFrame(() => inputBarRef.current?.focus());
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

  const requestLeave = () => setLeaveDialogOpen(true);

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

  // Show the styled landing background while the socket handshake completes
  if (!joined) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#020912", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, zIndex: 0, backgroundImage: "url('/assets/Cinematic Blue Earth Horizon.webp')", backgroundSize: "cover", backgroundPosition: "center bottom", opacity: 0.52 }} />
        <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" as const, background: "radial-gradient(ellipse 90% 60% at 50% 0%, rgba(0,120,200,.18) 0%, transparent 65%), radial-gradient(ellipse 110% 85% at 50% 50%, rgba(0,15,45,.50) 0%, transparent 78%)" }} />
        <img src="/assets/logo.webp" alt="ANNET" draggable={false} style={{ position: "relative", zIndex: 2, width: "clamp(200px, 55vw, 300px)", objectFit: "contain", mixBlendMode: "screen" as const, filter: "drop-shadow(0 0 24px rgba(0,190,255,.35))", userSelect: "none" as const }} />
        <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, border: "2.5px solid rgba(0,210,255,.15)", borderTopColor: "#00d4ff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <p style={{ color: "rgba(0,200,240,.60)", fontSize: 13, margin: 0, letterSpacing: "0.06em" }}>{joinStatus || "Connecting…"}</p>
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2, height: "22vh", overflow: "hidden", pointerEvents: "none" as const }}>
          <img src="/assets/Cinematic Blue Earth Horizon.webp" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", mixBlendMode: "screen" as const, opacity: 0.88, display: "block" }} draggable={false} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div
      className="relative flex h-[100svh] md:h-[100dvh] overflow-hidden bg-black"
      onPointerDownCapture={handleScreenTap}
      onPointerMoveCapture={handleScreenPointerMove}
      onPointerUpCapture={handleScreenPointerEnd}
      onPointerCancelCapture={handleScreenPointerEnd}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = "";
        }}
      />
      {cameraOpen && (
        <CameraCapture
          onCapture={(file) => {
            closeCamera(true);
            void handleFile(file);
          }}
        />
      )}

      {/* Screenshot deterrence overlay */}
      {screenshotWarning && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl transition-opacity"
        >
          <div className="flex flex-col items-center gap-3 text-center px-8">
            <span className="text-4xl select-none">🚫</span>
            <p className="text-white/90 font-semibold text-lg tracking-tight">Screenshot shortcut detected</p>
            <p className="text-white/45 text-sm">Browser apps cannot block phone screenshots or recordings.</p>
          </div>
        </div>
      )}
      {draggingFiles && !cameraOpen && (
        <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-6 backdrop-blur-[2px]">
          <div className="rounded-2xl border border-primary/50 bg-[#10191a]/95 px-8 py-6 text-center shadow-[0_0_40px_hsl(var(--primary)/0.18)]">
            <Paperclip className="mx-auto mb-2 h-7 w-7 text-primary" />
            <p className="text-sm font-medium text-white">Drop to send</p>
            <p className="mt-1 text-xs text-white/50">Images, videos, audio, or files</p>
          </div>
        </div>
      )}
      <MemberPanel
        users={users}
        currentName={name}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

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
              onLeave={requestLeave}
            />


            {leaveDialogOpen && (
              <div
                className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm"
                role="presentation"
                onClick={(event) => {
                  if (event.target === event.currentTarget) setLeaveDialogOpen(false);
                }}
              >
                <div
                  className="w-full max-w-[360px] rounded-3xl border border-white/10 bg-[#11151c]/98 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="leave-room-title"
                  aria-describedby="leave-room-description"
                >
                  <h2 id="leave-room-title" className="text-lg font-semibold text-white">
                    Leave this chat room?
                  </h2>
                  <p id="leave-room-description" className="mt-2 text-sm leading-6 text-white/60">
                    You&apos;ll be disconnected from this room and return to the home screen.
                  </p>
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setLeaveDialogOpen(false)}
                      className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/75 transition-colors hover:bg-white/[0.07]"
                    >
                      Stay
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLeaveDialogOpen(false);
                        leave();
                      }}
                      className="rounded-xl bg-[#b85c68] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#c96a76]"
                    >
                      Leave room
                    </button>
                  </div>
                </div>
              </div>
            )}

            {shareDialogOpen && (
              <div
                  className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 px-3 sm:px-4 backdrop-blur-sm"
                role="presentation"
                onClick={(e) => { if (e.target === e.currentTarget) setShareDialogOpen(false); }}
              >
                <div
                  ref={shareDialogRef}
                  className="w-full max-w-[360px] rounded-3xl border border-white/10 bg-[#11151c] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.65)]"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Share room invite"
                >
                  {/* Header */}
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-[0.22em] text-white/40">Share room</span>
                    <button
                      type="button"
                      onClick={() => setShareDialogOpen(false)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-white/50 hover:bg-white/[0.12] hover:text-white/80 transition-colors text-[14px] leading-none"
                      aria-label="Close"
                    >✕</button>
                  </div>

                  {/* QR code */}
                  <div className="mx-auto flex w-[200px] items-center justify-center rounded-2xl bg-white p-2.5">
                    {qrCodeDataUrl
                      ? <img src={qrCodeDataUrl} alt={`QR code for room ${room}`} className="h-[175px] w-[175px]" />
                      : <div className="flex h-[175px] w-[175px] items-center justify-center text-xs text-black/40">Generating…</div>
                    }
                  </div>

                  {/* Room URL */}
                  <p className="mt-3 break-all rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-center font-mono text-[12px] text-emerald-300/80">
                    {inviteUrl}
                  </p>

                  {/* Divider */}
                  <div className="my-4 flex items-center gap-3">
                    <span className="h-px flex-1 bg-white/[0.07]" />
                    <span className="text-[10px] uppercase tracking-[0.18em] text-white/25">share via</span>
                    <span className="h-px flex-1 bg-white/[0.07]" />
                  </div>

                  {/* Bare app icons — no rectangle boxes */}
                  <div className="flex items-start justify-center gap-7">
                    {/* WhatsApp */}
                    <button
                      type="button"
                      onClick={() => openShareTarget("whatsapp")}
                      className="flex flex-col items-center gap-2 outline-none group"
                    >
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] shadow-[0_0_16px_rgba(37,211,102,0.30)] transition-transform group-hover:scale-110 group-active:scale-95">
                        <WhatsAppIcon />
                      </span>
                      <span className="text-[10px] text-white/45">WhatsApp</span>
                    </button>

                    {/* Telegram */}
                    <button
                      type="button"
                      onClick={() => openShareTarget("telegram")}
                      className="flex flex-col items-center gap-2 outline-none group"
                    >
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#229ED9] shadow-[0_0_16px_rgba(34,158,217,0.30)] transition-transform group-hover:scale-110 group-active:scale-95">
                        <TelegramIcon />
                      </span>
                      <span className="text-[10px] text-white/45">Telegram</span>
                    </button>

                    {/* Email */}
                    <button
                      type="button"
                      onClick={() => openShareTarget("email")}
                      className="flex flex-col items-center gap-2 outline-none group"
                    >
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.10] shadow-[0_0_16px_rgba(255,255,255,0.06)] transition-transform group-hover:scale-110 group-active:scale-95">
                        <Mail className="h-5 w-5 text-white/80" />
                      </span>
                      <span className="text-[10px] text-white/45">Email</span>
                    </button>
                  </div>

                  {/* Copy link */}
                  <button
                    type="button"
                    onClick={async () => { await copyInviteLink(); }}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1a9e6e]/90 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#20b87f] active:scale-[0.98]"
                  >
                    <Copy className="h-4 w-4" />
                    {linkCopied ? "Copied!" : "Copy link"}
                  </button>
                </div>
              </div>
            )}

            <div ref={scrollRef} className={`messages-scroll flex-1 overflow-y-auto scrollbar-thin py-4 overscroll-contain transition-[padding] duration-200 ${sidebarOpen ? "lg:pl-[268px]" : ""}`}>
              <div className="messages-inner">
                <div className="mb-5 flex justify-center">
                  <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-2.5 text-[11px] text-white/90 shadow-[0_0_26px_rgba(255,255,255,0.03)] backdrop-blur-md whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <Code2 className="h-3.5 w-3.5 text-primary/90 shrink-0" />
                      <span>Use <code className="font-mono text-white">code:</code> for snippets</span>
                    </span>
                    <span className="h-3 w-px bg-white/15 shrink-0" />
                    <span className="flex items-center gap-1.5">
                      <FolderUp className="h-3.5 w-3.5 text-primary/90 shrink-0" />
                      <span>Folder sends ZIP</span>
                    </span>
                    <span className="h-3 w-px bg-white/15 shrink-0" />
                    <span className="flex items-center gap-1.5">
                      <Camera className="h-3.5 w-3.5 text-primary/90 shrink-0" />
                      <span>3 taps to snap</span>
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

            <div className={`chat-compose shrink-0 transition-[padding] duration-200 ${sidebarOpen ? "lg:pl-[268px]" : ""}`}>
              <TypingIndicator typingUsers={typingUsers} />
              <InputBar
                ref={inputBarRef}
                onSend={handleSend}
                onFile={handleFile}
                onAlbum={handleAlbum}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
                onTyping={() => socket.emit("typing", { name, room })}
                onStopTyping={() => socket.emit("stop_typing", { name, room })}
                onOpenCamera={() => openCamera()}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}




