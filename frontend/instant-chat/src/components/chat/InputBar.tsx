import { useRef, useState, KeyboardEvent, ClipboardEvent, DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Send, X } from "lucide-react";
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
    <div
      className={`border-t border-border bg-card/60 backdrop-blur transition-colors ${
        dragging ? "bg-primary/10 border-primary/40" : ""
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
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

      {dragging && (
        <div className="absolute inset-x-0 bottom-0 h-16 flex items-center justify-center pointer-events-none">
          <span className="text-sm text-primary font-medium bg-card/90 px-4 py-1.5 rounded-full border border-primary/30 shadow">
            Drop to send
          </span>
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
          className="shrink-0 h-11 w-11"
          aria-label="Attach file"
        >
          <Paperclip className="h-5 w-5" />
        </Button>
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={replyTo ? `Replying to ${replyTo.author}…` : "Type a message… or paste / drop an image"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
          className="flex-1 resize-none bg-secondary/60 border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 max-h-32 scrollbar-thin"
        />
        <Button
          type="button"
          onClick={send}
          disabled={!value.trim()}
          className="shrink-0 h-11 w-11 p-0"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
