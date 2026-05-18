import { useRef, useState, useEffect, KeyboardEvent, ClipboardEvent, DragEvent, PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { FolderUp, Paperclip, Plus, Send, X, Upload } from "lucide-react";
import { ReplyTo } from "@/types/chat";
import FilePreview from "@/components/chat/FilePreview";
import { createZipFromFiles } from "@/lib/archive";

type Props = {
  onSend: (text: string) => void;
  onFile: (file: File) => void;
  replyTo?: ReplyTo | null;
  onCancelReply?: () => void;
  onTyping?: () => void;
  onStopTyping?: () => void;
};

export default function InputBar({ onSend, onFile, replyTo, onCancelReply, onTyping, onStopTyping }: Props) {
  const [value, setValue] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preparingFolder, setPreparingFolder] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stopTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const folderInput = folderRef.current;
    if (!folderInput) return;
    folderInput.setAttribute("webkitdirectory", "");
    folderInput.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    return () => {
      if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
    };
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 132);
    textarea.style.height = `${Math.max(44, nextHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 132 ? "auto" : "hidden";
  }, [value, replyTo]);

  const stageFile = (file: File) => {
    setAttachmentsOpen(false);
    setPendingFile(file);
  };

  const stageFolder = async (list: FileList | null) => {
    if (!list || list.length === 0) return;

    setPreparingFolder(true);
    try {
      const folderArchive = await createZipFromFiles(Array.from(list));
      setAttachmentsOpen(false);
      setPendingFile(folderArchive);
    } finally {
      setPreparingFolder(false);
      if (folderRef.current) folderRef.current.value = "";
    }
  };

  const confirmSend = () => {
    if (!pendingFile) return;
    onFile(pendingFile);
    setPendingFile(null);
  };

  const cancelPreview = () => {
    setPendingFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = () => {
    const text = value.trim();
    if (!text) return;
    if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
    onStopTyping?.();
    onSend(text);
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
    if (file) stageFile(file);
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
    if (file) stageFile(file);
  };

  return (
    <>
      {pendingFile && (
        <FilePreview
          file={pendingFile}
          onConfirm={confirmSend}
          onCancel={cancelPreview}
        />
      )}

      <div
        className="relative bg-transparent"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragging && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-primary/10 border-2 border-dashed border-primary/40 rounded-none pointer-events-none">
            <Upload className="h-5 w-5 text-primary" />
            <span className="text-sm text-primary font-medium">Drop to send</span>
          </div>
        )}

        {replyTo && (
          <div className="flex items-center gap-2 px-4 pt-2.5 pb-0 max-w-5xl mx-auto">
            <div className="flex-1 pl-2.5 border-l-2 border-primary/50 text-xs text-muted-foreground/80 min-w-0 py-0.5">
              <span className="font-semibold text-primary/80 block">{replyTo.author}</span>
              <p className="truncate opacity-70 mt-0.5">{replyTo.preview}</p>
            </div>
            <button
              onClick={onCancelReply}
              className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Cancel reply"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 max-w-5xl mx-auto px-3 py-3">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) stageFile(file);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <input
            ref={folderRef}
            type="file"
            className="hidden"
            multiple
            onChange={(e) => {
              void stageFolder(e.target.files);
            }}
          />

          <div className="flex items-center gap-2 self-end pb-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setAttachmentsOpen((open) => !open)}
              className="shrink-0 h-11 w-11 rounded-full border border-white/10 bg-white/[0.035] text-white/82 hover:text-white hover:bg-white/[0.08] transition-all"
              aria-label="Open attachments"
            >
              <Plus className={`h-4 w-4 transition-transform duration-200 ${attachmentsOpen ? "rotate-45" : ""}`} />
            </Button>

            <div className={`flex items-center gap-2 overflow-hidden transition-all duration-200 ${attachmentsOpen ? "max-w-28 opacity-100" : "max-w-0 opacity-0"}`}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileRef.current?.click()}
                className="shrink-0 h-10 w-10 rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground/80 hover:text-white hover:bg-white/[0.08] transition-all"
                aria-label="Attach file"
              >
                <Paperclip className="h-4 w-4" />
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => folderRef.current?.click()}
                disabled={preparingFolder}
                className="shrink-0 h-10 w-10 rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground/80 hover:text-white hover:bg-white/[0.08] transition-all disabled:opacity-50"
                aria-label="Attach folder"
              >
                <FolderUp className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder={replyTo ? `Reply to ${replyTo.author}…` : "Message…"}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (e.target.value) onTyping?.();
                if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
                stopTypingTimer.current = setTimeout(() => {
                  onStopTyping?.();
                }, 1500);
              }}
              onKeyDown={onKey}
              onPaste={onPaste}
              className="flex-1 w-full min-h-[44px] max-h-[132px] resize-none overflow-y-hidden bg-white/[0.06] border border-white/[0.10] rounded-[26px] px-5 py-3 text-[15px] focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 focus:bg-white/[0.08] scrollbar-thin leading-[1.4] placeholder:text-muted-foreground/40 transition-[height,background-color,border-color] duration-150"
            />
            {preparingFolder && (
              <p className="px-2 pt-1 text-[11px] text-primary/75">Preparing folder zip for P2P sharing...</p>
            )}
          </div>

          <Button
            type="button"
            onPointerDown={onSendPointerDown}
            disabled={!value.trim()}
            className="shrink-0 h-10 w-10 p-0 rounded-xl bg-primary/90 hover:bg-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 shadow-[0_0_16px_hsl(var(--primary)/0.3)] hover:shadow-[0_0_20px_hsl(var(--primary)/0.45)]"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}
