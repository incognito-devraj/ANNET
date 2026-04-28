import { useState, useEffect, useRef } from "react";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
import { ChatMessage, Reaction } from "@/types/chat";
import { Button } from "@/components/ui/button";
import { Check, Copy, Download, FileIcon, Reply } from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const EMOJI_LIST = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "🎉"];

// ─── EmojiPicker ────────────────────────────────────────────────────────────

function EmojiPicker({
  onPick,
  onClose,
  alignRight,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  alignRight?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute z-50 bottom-full mb-2 bg-card border border-border rounded-xl shadow-xl p-1.5 flex gap-0.5 ${
        alignRight ? "right-0" : "left-0"
      }`}
    >
      {EMOJI_LIST.map((e) => (
        <button
          key={e}
          onPointerDown={(ev) => { ev.preventDefault(); onPick(e); onClose(); }}
          className="text-lg active:scale-125 transition-transform px-1.5 py-1 rounded-lg hover:bg-secondary min-w-[36px] min-h-[36px] flex items-center justify-center"
          aria-label={`React with ${e}`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

// ─── ReactionBar ────────────────────────────────────────────────────────────

function ReactionBar({
  reactions,
  onToggle,
}: {
  reactions: Record<string, Reaction>;
  onToggle: (emoji: string) => void;
}) {
  const entries = Object.entries(reactions).filter(([, r]) => r.count > 0);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {entries.map(([emoji, r]) => (
        <button
          key={emoji}
          onPointerDown={(e) => { e.preventDefault(); onToggle(emoji); }}
          className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors min-h-[28px] ${
            r.reactedByMe
              ? "bg-primary/20 border-primary/40 text-primary"
              : "bg-secondary/60 border-border text-muted-foreground hover:bg-secondary"
          }`}
        >
          <span>{emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}
    </div>
  );
}

// ─── CodeBlock ──────────────────────────────────────────────────────────────

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current && !codeRef.current.dataset.highlighted) {
      hljs.highlightElement(codeRef.current);
    }
  }, [code]);

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const detected = hljs.highlightAuto(code).language ?? "code";

  return (
    // w-full + max-w so it never overflows the viewport on mobile
    <div className="rounded-xl overflow-hidden border border-border/60 bg-[#0d1117] w-full max-w-full">
      {/* Header — taller touch target for the copy button */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-border/40">
        <span className="text-[11px] text-muted-foreground font-mono tracking-wide select-none">
          {detected}
        </span>
        {/* Copy button — large enough touch target (min 44×44) */}
        <button
          onPointerDown={(e) => { e.preventDefault(); copy(); }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground active:text-foreground transition-colors min-h-[36px] min-w-[64px] justify-end px-1"
          aria-label="Copy code"
        >
          {copied ? (
            <><Check className="h-3.5 w-3.5 text-primary shrink-0" /><span className="text-primary">Copied</span></>
          ) : (
            <><Copy className="h-3.5 w-3.5 shrink-0" /><span>Copy</span></>
          )}
        </button>
      </div>
      {/* Scrollable code — constrained so it never pushes layout */}
      <div className="overflow-x-auto scrollbar-thin">
        <pre className="m-0 px-4 py-3">
          <code
            ref={codeRef}
            className="text-[13px] leading-relaxed !bg-transparent whitespace-pre"
          >
            {code}
          </code>
        </pre>
      </div>
    </div>
  );
}

// ─── ReplyPreview (inside bubble) ───────────────────────────────────────────

function ReplyPreview({ author, preview }: { author: string; preview: string }) {
  return (
    <div className="mb-2 pl-2 border-l-2 border-primary/50 text-xs text-muted-foreground">
      <span className="font-semibold text-primary/80">{author}</span>
      <p className="truncate opacity-80">{preview}</p>
    </div>
  );
}

// ─── MessageBubble ──────────────────────────────────────────────────────────

export default function MessageBubble({
  msg,
  onReceiveFile,
  onReact,
  onReply,
}: {
  msg: ChatMessage;
  onReceiveFile?: (id: string) => void;
  onReact?: (id: string, emoji: string) => void;
  onReply?: (id: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  // On touch devices hover never fires — keep actions always visible
  const [actionsVisible, setActionsVisible] = useState(false);

  if (msg.kind === "system") {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-muted-foreground bg-secondary/40 px-3 py-1 rounded-full border border-border">
          {msg.message}
        </span>
      </div>
    );
  }

  const mine = msg.mine;
  const align = mine ? "items-end" : "items-start";
  const bubble = mine
    ? "bg-[hsl(var(--bubble-own))] text-foreground rounded-br-sm"
    : "bg-[hsl(var(--bubble-other))] text-foreground rounded-bl-sm";

  const reactions = "reactions" in msg ? msg.reactions ?? {} : {};

  // Action bar — always rendered, visibility toggled by tap/hover
  const actionBar = (
    <div
      className={`flex items-center gap-0.5 transition-opacity duration-150 ${
        actionsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      } ${mine ? "flex-row-reverse" : "flex-row"}`}
    >
      {onReply && msg.kind !== "file_offer" && (
        <button
          onPointerDown={(e) => { e.preventDefault(); onReply(msg.id); setActionsVisible(false); }}
          className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
          aria-label="Reply"
        >
          <Reply className="h-3.5 w-3.5" />
        </button>
      )}
      {onReact && (
        <div className="relative">
          <button
            onPointerDown={(e) => { e.preventDefault(); setShowPicker((v) => !v); }}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors text-base leading-none min-h-[36px] min-w-[36px] flex items-center justify-center"
            aria-label="React"
          >
            😊
          </button>
          {showPicker && (
            <EmojiPicker
              onPick={(emoji) => { onReact(msg.id, emoji); setActionsVisible(false); }}
              onClose={() => setShowPicker(false)}
              alignRight={mine}
            />
          )}
        </div>
      )}
    </div>
  );

  // ── Code message ──
  if (msg.kind === "code") {
    return (
      <div
        className={`flex flex-col ${align} my-1.5 w-full`}
        onMouseEnter={() => setActionsVisible(true)}
        onMouseLeave={() => { setActionsVisible(false); setShowPicker(false); }}
        onTouchStart={() => setActionsVisible((v) => !v)}
      >
        {!mine && <span className="text-xs text-muted-foreground px-3 mb-0.5">{msg.author}</span>}
        <div className={`flex items-end gap-1 w-[95%] md:w-auto md:max-w-[75%] ${mine ? "flex-row-reverse self-end" : "flex-row self-start"}`}>
          <div className="min-w-0 flex-1">
            <CodeBlock code={msg.code} />
            <ReactionBar reactions={reactions} onToggle={(e) => onReact?.(msg.id, e)} />
          </div>
          {actionBar}
        </div>
        <span className="text-[10px] text-muted-foreground px-3 mt-0.5">{formatTime(msg.ts)}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col ${align} my-1.5`}
      onMouseEnter={() => setActionsVisible(true)}
      onMouseLeave={() => { setActionsVisible(false); setShowPicker(false); }}
      onTouchStart={() => setActionsVisible((v) => !v)}
    >
      {!mine && <span className="text-xs text-muted-foreground px-3 mb-0.5">{msg.author}</span>}

      <div className={`flex items-end gap-1 ${mine ? "flex-row-reverse" : "flex-row"}`}>
        <div className={`max-w-[78%] md:max-w-[60%] px-4 py-2.5 rounded-2xl ${bubble} shadow-sm`}>
          {msg.kind === "message" && msg.replyTo && (
            <ReplyPreview author={msg.replyTo.author} preview={msg.replyTo.preview} />
          )}
          {msg.kind === "message" && (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{msg.message}</p>
          )}
          {msg.kind === "image" && (
            <div className="space-y-2">
              <img src={msg.dataUrl} alt={msg.fileMeta.name} className="rounded-lg max-h-64 w-full object-contain" />
              <p className="text-xs text-muted-foreground">{msg.fileMeta.name} · {formatSize(msg.fileMeta.size)}</p>
            </div>
          )}
          {msg.kind === "file_offer" && (
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                <FileIcon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{msg.fileMeta.name}</p>
                <p className="text-xs text-muted-foreground">{formatSize(msg.fileMeta.size)}</p>
              </div>
              {!mine && !msg.received && onReceiveFile && (
                <Button size="sm" variant="secondary" onClick={() => onReceiveFile(msg.id)} className="shrink-0">
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Receive
                </Button>
              )}
              {msg.received && <span className="text-xs text-primary shrink-0">Accepted</span>}
            </div>
          )}
          <ReactionBar reactions={reactions} onToggle={(e) => onReact?.(msg.id, e)} />
        </div>
        {actionBar}
      </div>

      <span className="text-[10px] text-muted-foreground px-3 mt-0.5">{formatTime(msg.ts)}</span>
    </div>
  );
}
