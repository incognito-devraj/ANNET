import { useRef, useState, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Send } from "lucide-react";

type Props = {
  onSend: (text: string) => void;
  onFile: (file: File) => void;
};

export default function InputBar({ onSend, onFile }: Props) {
  const [value, setValue] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const send = () => {
    const t = value.trim();
    if (!t) return;
    onSend(t);
    setValue("");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="border-t border-border bg-card/60 backdrop-blur p-3">
      <div className="flex items-end gap-2 max-w-5xl mx-auto">
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
          rows={1}
          placeholder="Type a message…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
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
