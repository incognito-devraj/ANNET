import { useRef, useState, KeyboardEvent, ClipboardEvent, DragEvent, PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Send, X, Upload } from "lucide-react";
import { ReplyTo } from "@/types/chat";

type Props = {
  onSend: (text: string) => void;
  onFile: (file: File) => void;
  replyTo?: ReplyTo | null;
  onCancelReply?: () => void;
};

export default function InputBar({ onSend, onFile, replyTo, onCancelReply }: Props) {
  const [value, setValue] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const send = () => {
    const t = value.trim();
    if (!t) return;
    onSend(t);
    setValue("");
    onCancelReply?.();
  };

  const onSendPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!value.trim()) return;
    send();
    textareaRef.current?.focus({ preventScroll: true });
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    if (e.key === "Escape" && replyTo) {
      onCancelReply?.();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) onFile(file);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    // position:relative so the drag overlay is positioned correctly
    <div
      className="relative border-t border-border bg-card/60 backdrop-blur"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drag & drop overlay — covers the entire input bar */}
      {dragging && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-primary/10 border-2 border-dashed border-primary/50 rounded-none pointer-events-none">
          <Upload className="h-6 w-6 text-primary" />
          <span className="text-sm text-primary font-medium">Drop to send</span>
        </div>
      )}

      {/* Reply preview strip */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 pt-2 pb-0 max-w-5xl mx-auto">
          <div className="flex-1 pl-2 border-l-2 border-primary/50 text-xs text-muted-foreground min-w-0">
            <span className="font-semibold text-primary/80">{replyTo.author}</span>
            <p className="truncate opacity-80">{replyTo.preview}</p>
          </div>
          <button
            onClick={onCancelReply}
            className="shrink-0 p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 max-w-5xl mx-auto p-3">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileRef.current?.click()}
          className="shrink-0 h-10 w-10"
          aria-label="Attach file"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={replyTo ? `Reply to ${replyTo.author}…` : "Message…"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
          className="flex-1 resize-none bg-secondary/60 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 max-h-32 scrollbar-thin leading-relaxed"
        />
        <Button
          type="button"
          onPointerDown={onSendPointerDown}
          disabled={!value.trim()}
          className="shrink-0 h-10 w-10 p-0"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
