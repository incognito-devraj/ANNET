import { ChatMessage } from "@/types/chat";
import { Button } from "@/components/ui/button";
import { Download, FileIcon } from "lucide-react";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessageBubble({
  msg,
  onReceiveFile,
}: {
  msg: ChatMessage;
  onReceiveFile?: (id: string) => void;
}) {
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

  return (
    <div className={`flex flex-col ${align} my-1.5`}>
      {!mine && (
        <span className="text-xs text-muted-foreground px-3 mb-0.5">{msg.author}</span>
      )}
      <div className={`max-w-[78%] md:max-w-[60%] px-4 py-2.5 rounded-2xl ${bubble} shadow-sm`}>
        {msg.kind === "message" && (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{msg.message}</p>
        )}
        {msg.kind === "image" && (
          <div className="space-y-2">
            <img
              src={msg.dataUrl}
              alt={msg.fileMeta.name}
              className="rounded-lg max-h-64 object-contain"
            />
            <p className="text-xs text-muted-foreground">
              {msg.fileMeta.name} · {formatSize(msg.fileMeta.size)}
            </p>
          </div>
        )}
        {msg.kind === "file_offer" && (
          <div className="flex items-center gap-3 min-w-[220px]">
            <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <FileIcon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{msg.fileMeta.name}</p>
              <p className="text-xs text-muted-foreground">{formatSize(msg.fileMeta.size)}</p>
            </div>
            {!mine && !msg.received && onReceiveFile && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onReceiveFile(msg.id)}
                className="shrink-0"
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Receive
              </Button>
            )}
            {msg.received && (
              <span className="text-xs text-primary shrink-0">Accepted</span>
            )}
          </div>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground px-3 mt-0.5">{formatTime(msg.ts)}</span>
    </div>
  );
}
