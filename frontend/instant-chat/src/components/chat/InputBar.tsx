import { useRef, useState, useEffect, useImperativeHandle, forwardRef, KeyboardEvent, PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Code2, FolderUp, Paperclip, Plus, Send, X } from "lucide-react";
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
  onOpenCamera?: () => void;
};

// Expose a focus() method to the parent so it can focus the textarea
// immediately after setting replyTo (e.g. after swipe-to-reply).
export type InputBarHandle = {
  focus: () => void;
};

const InputBar = forwardRef<InputBarHandle, Props>(function InputBar({
  onSend,
  onFile,
  replyTo,
  onCancelReply,
  onTyping,
  onStopTyping,
  onOpenCamera,
}, ref) {
  const [value, setValue] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preparingFolder, setPreparingFolder] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stopTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Expose focus() so the parent can focus the textarea after triggering reply
  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus({ preventScroll: true }),
  }));

  // Auto-focus the textarea whenever replyTo is set (swipe-to-reply, tap-to-reply)
  useEffect(() => {
    if (replyTo) {
      // rAF ensures the reply preview has rendered before we steal focus
      requestAnimationFrame(() => {
        textareaRef.current?.focus({ preventScroll: true });
      });
    }
  }, [replyTo]);

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
    // Reset to 0 first so scrollHeight reflects the new content size
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 132);
    textarea.style.height = `${Math.max(44, nextHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 132 ? "auto" : "hidden";
  }, [value, replyTo]);

  // Stage a single file for preview before sending
  const stageFile = (file: File) => {
    setAttachmentsOpen(false);
    setPendingFile(file);
  };

  // Stage a folder: zip it first, then show preview
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

  return (
    <>
      {pendingFile && (
        <FilePreview
          file={pendingFile}
          onConfirm={confirmSend}
          onCancel={cancelPreview}
        />
      )}

      <div className="relative bg-transparent">
        {replyTo && (
          <div className="flex items-center gap-2 px-4 pt-2.5 pb-0 max-w-[780px] mx-auto">
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

        {/* Input row */}
        <div className="flex items-center gap-2 max-w-[780px] mx-auto px-3 py-2.5">
          {/* Hidden file inputs — never trigger connectSocket */}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="*/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) stageFile(file);
              // Reset so the same file can be picked again
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

          {/* Attachment toggle + two expanded buttons */}
          <div className="flex items-center gap-1.5 shrink-0 self-end pb-[8px]">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setAttachmentsOpen((open) => !open)}
              className="h-10 w-10 rounded-full border border-white/10 bg-white/[0.035] text-white/75 hover:text-white hover:bg-white/[0.08] transition-all"
              aria-label="Open attachments"
            >
              <Plus className={`h-[19px] w-[19px] transition-transform duration-200 ${attachmentsOpen ? "rotate-45" : ""}`} />
            </Button>

            {/* Expanded: File + Folder + Camera buttons */}
            <div className={`flex items-center gap-1.5 overflow-hidden transition-all duration-200 ${attachmentsOpen ? "max-w-36 opacity-100" : "max-w-0 opacity-0"}`}>
              {/* Single file */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileRef.current?.click()}
                className="h-9 w-9 rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground/70 hover:text-white hover:bg-white/[0.08] transition-all"
                aria-label="Attach file"
                title="Send a file"
              >
                <Paperclip className="h-4 w-4" />
              </Button>

              {/* Folder → ZIP */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => folderRef.current?.click()}
                disabled={preparingFolder}
                className="h-9 w-9 rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground/70 hover:text-white hover:bg-white/[0.08] transition-all disabled:opacity-40"
                aria-label="Attach folder as ZIP"
                title="Send a folder (zipped)"
              >
                <FolderUp className="h-4 w-4" />
              </Button>

              {/* Camera snap */}
              {onOpenCamera && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => { setAttachmentsOpen(false); onOpenCamera(); }}
                  className="h-9 w-9 rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground/70 hover:text-primary hover:bg-primary/10 transition-all"
                  aria-label="Open camera"
                  title="Snap & send photo (or triple-tap anywhere)"
                >
                  <Camera className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Textarea — grows up to 3 lines */}
          <div className="flex-1 min-w-0 self-end">
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
            className="w-full min-h-[40px] max-h-[120px] resize-none overflow-y-hidden bg-white/[0.045] border border-white/[0.09] rounded-[18px] px-3.5 py-[9px] text-[15px] focus:outline-none focus:ring-1 focus:ring-primary/45 focus:border-primary/30 focus:bg-white/[0.07] scrollbar-thin leading-[1.35] placeholder:text-muted-foreground/40 transition-[background-color,border-color] duration-150"
            />
            {preparingFolder && (
              <p className="px-2 pt-1 text-[11px] text-primary/75">Preparing folder zip…</p>
            )}
          </div>

          <div className="flex items-center shrink-0 self-end pb-[8px]">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                setValue((current) => current.startsWith("code:") ? current : `code: ${current}`);
                textareaRef.current?.focus({ preventScroll: true });
              }}
              className="h-9 w-9 rounded-full text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors"
              aria-label="Write code"
              title="Send as code"
            >
              <Code2 className="h-[17px] w-[17px]" />
            </Button>
          </div>

          {/* Send button */}
          <button
            type="button"
            onPointerDown={onSendPointerDown}
            disabled={!value.trim()}
            aria-label="Send"
            className={[
              "shrink-0 self-end relative -top-[8px]",
              "flex items-center justify-center",
              "h-10 w-10 rounded-full bg-primary/90 text-primary-foreground",
              "shadow-[0_0_16px_hsl(var(--primary)/0.28)] transition-all duration-200 outline-none",
              value.trim()
                ? "hover:bg-primary hover:shadow-[0_0_24px_hsl(var(--primary)/0.55)] hover:scale-105 active:scale-95 cursor-pointer"
                : "opacity-35 cursor-not-allowed",
            ].join(" ")}
          >
            <Send className="h-[20px] w-[20px] translate-x-[0px] " />
          </button>
        </div>
      </div>
    </>
  );
});

export default InputBar;
