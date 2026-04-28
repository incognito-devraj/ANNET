import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Hash, Users } from "lucide-react";
import { getSocket, disconnectSocket } from "@/lib/socket";
import Sidebar from "@/components/chat/Sidebar";
import MessageBubble from "@/components/chat/MessageBubble";
import InputBar from "@/components/chat/InputBar";
import { ChatMessage, ChatUser, FileMeta } from "@/types/chat";
import { Button } from "@/components/ui/button";

const VALID = /^[A-Za-z0-9_]{1,24}$/;
const SMALL_FILE_LIMIT = 5 * 1024 * 1024;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function Chat() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const name = params.get("name") ?? "";
  const room = params.get("room") ?? "";

  const [users, setUsers] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const valid = useMemo(() => VALID.test(name) && VALID.test(room), [name, room]);

  // Redirect if invalid
  useEffect(() => {
    if (!valid) navigate("/", { replace: true });
  }, [valid, navigate]);

  // Socket lifecycle
  useEffect(() => {
    if (!valid) return;
    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      socket.emit("join_room", { name, room });
    };
    const onDisconnect = () => setConnected(false);

    const onRoomUsers = (list: unknown) => {
      if (!Array.isArray(list)) return;
      const normalized: ChatUser[] = list.map((u) =>
        typeof u === "string" ? { name: u } : { id: u?.id, name: u?.name ?? String(u) }
      );
      setUsers(normalized);
    };

    const onUserJoined = (payload: { name: string }) => {
      setMessages((m) => [
        ...m,
        { kind: "system", id: uid(), message: `${payload.name} joined`, ts: Date.now() },
      ]);
    };

    const onUserLeft = (payload: { name: string }) => {
      setMessages((m) => [
        ...m,
        { kind: "system", id: uid(), message: `${payload.name} left`, ts: Date.now() },
      ]);
    };

    const onReceiveMessage = (payload: { room: string; author: string; message: string }) => {
      // Backend does NOT echo to sender — every received msg is from someone else
      setMessages((m) => [
        ...m,
        {
          kind: "message",
          id: uid(),
          author: payload.author,
          message: payload.message,
          mine: false,
          ts: Date.now(),
        },
      ]);
    };

    const onWebrtcOffer = (payload: {
      offer: unknown;
      fileMeta: FileMeta;
      author?: string;
    }) => {
      setMessages((m) => [
        ...m,
        {
          kind: "file_offer",
          id: uid(),
          author: payload.author ?? "peer",
          mine: false,
          fileMeta: payload.fileMeta,
          offer: payload.offer,
          received: false,
          ts: Date.now(),
        },
      ]);
    };

    const onWebrtcAnswer = (_payload: unknown) => {
      // UI-ready: actual WebRTC handshake not implemented
    };
    const onIceCandidate = (_payload: unknown) => {
      // UI-ready
    };

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
      socket.off("webrtc_offer", onWebrtcOffer);
      socket.off("webrtc_answer", onWebrtcAnswer);
      socket.off("ice_candidate", onIceCandidate);
      socket.off("error", onError);
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, name, room]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleSend = (text: string) => {
    const socket = getSocket();
    socket.emit("send_message", { room, author: name, message: text });
    // Locally append (backend does not echo)
    setMessages((m) => [
      ...m,
      {
        kind: "message",
        id: uid(),
        author: name,
        message: text,
        mine: true,
        ts: Date.now(),
      },
    ]);
  };

  const handleFile = (file: File) => {
    const socket = getSocket();
    const fileMeta: FileMeta = { name: file.name, size: file.size };

    if (file.size <= SMALL_FILE_LIMIT && file.type.startsWith("image/")) {
      // UI-only image preview
      const reader = new FileReader();
      reader.onload = () => {
        setMessages((m) => [
          ...m,
          {
            kind: "image",
            id: uid(),
            author: name,
            mine: true,
            dataUrl: String(reader.result),
            fileMeta,
            ts: Date.now(),
          },
        ]);
      };
      reader.readAsDataURL(file);
      return;
    }

    // Large file: emit signaling offer (UI-only, no real WebRTC yet)
    const offer = { type: "offer", placeholder: true };
    socket.emit("webrtc_offer", { room, offer, fileMeta });
    setMessages((m) => [
      ...m,
      {
        kind: "file_offer",
        id: uid(),
        author: name,
        mine: true,
        fileMeta,
        offer,
        received: false,
        ts: Date.now(),
      },
    ]);
    toast("File offer sent", { description: `${fileMeta.name}` });
  };

  const handleReceiveFile = (id: string) => {
    const socket = getSocket();
    const answer = { type: "answer", placeholder: true };
    socket.emit("webrtc_answer", { room, answer });
    setMessages((m) =>
      m.map((msg) => (msg.id === id && msg.kind === "file_offer" ? { ...msg, received: true } : msg))
    );
  };

  const leave = () => {
    disconnectSocket();
    navigate("/");
  };

  if (!valid) return null;

  return (
    <div className="h-full flex">
      <Sidebar users={users} currentName={name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-card/60 backdrop-blur flex items-center px-4 gap-3">
          <Button variant="ghost" size="icon" onClick={leave} aria-label="Leave">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Hash className="h-5 w-5 text-primary" />
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">{room}</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  connected ? "bg-primary" : "bg-destructive"
                }`}
              />
              {connected ? "Connected" : "Connecting…"}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {users.length}
          </div>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto scrollbar-thin px-3 md:px-6 py-4"
        >
          <div className="max-w-5xl mx-auto">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-12">
                No messages yet. Say hi 👋
              </div>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} msg={m} onReceiveFile={handleReceiveFile} />
            ))}
          </div>
        </div>

        <InputBar onSend={handleSend} onFile={handleFile} />
      </div>
    </div>
  );
}
