import { useRef, useState, useEffect, useImperativeHandle, forwardRef, KeyboardEvent, PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Code2, FolderUp, Image, Paperclip, Plus, Send, X } from "lucide-react";
import { ReplyTo } from "@/types/chat";
import FilePreview from "@/components/chat/FilePreview";
import { createZipFromFiles } from "@/lib/archive";

type Props = {
  onSend: (text: string) => void;
  onFile: (file: File) => void;
  onAlbum: (files: File[], caption?: string) => void;
  replyTo?: ReplyTo | null;
  onCancelReply?: () => void;
  onTyping?: () => void;
  onStopTyping?: () => void;
  onOpenCamera?: () => void;
};

export type InputBarHandle = {
  focus: () => void;
};

const InputBar = forwardRef<InputBarHandle, Props>(function InputBar({
  onSend,
  onFile,
  onAlbum,
  replyTo,
  onCancelReply,
  onTyping,
  onStopTyping,
  onOpenCamera,
}, ref) {
  const [value, setValue] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [albumCaption, setAlbumCaption] = useState("");
  const [preparingFolder, setPreparingFolder] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const addPhotoRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const stopTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus({ preventScroll: true }),
  }));

  useEffect(() => {
    if (replyTo) {
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
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 132);
    textarea.style.height = `${Math.max(44, nextHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 132 ? "auto" : "hidden";
  }, [value, replyTo]);

  useEffect(() => {
    if (!attachmentsOpen) return;
    const isInsideComposer = (target: EventTarget | null) => composerRef.current?.contains(target as Node);
    const closeOnOutsideInteraction = (event: globalThis.PointerEvent | globalThis.TouchEvent) => {
      if (!isInsideComposer(event.target)) setAttachmentsOpen(false);
    };
    const closeOnChatScroll = () => setAttachmentsOpen(false);
    const closeOnKeyboard = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Tab") setAttachmentsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideInteraction, true);
    document.addEventListener("touchstart", closeOnOutsideInteraction, true);
    document.addEventListener("scroll", closeOnChatScroll, true);
    document.addEventListener("keydown", closeOnKeyboard, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction, true);
      document.removeEventListener("touchstart", closeOnOutsideInteraction, true);
      document.removeEventListener("scroll", closeOnChatScroll, true);
      document.removeEventListener("keydown", closeOnKeyboard, true);
    };
  }, [attachmentsOpen]);

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

  const sendAlbum = () => {
    if (!pendingPhotos.length) return;
    onAlbum(pendingPhotos, albumCaption.trim());
    setPendingPhotos([]); setAlbumCaption("");
  };

  const cancelPreview = () => setPendingFile(null);

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

  const openCodeSnippet = () => {
    setAttachmentsOpen(false);
    setValue((current) => current.startsWith("code:") ? current : `code: ${current}`);
    textareaRef.current?.focus({ preventScroll: true });
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
      {pendingPhotos.length > 0 && (
        <div className="fixed inset-x-3 bottom-20 z-30 mx-auto max-w-[780px] rounded-2xl border border-primary/20 bg-[#101820]/95 p-3 shadow-2xl backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between"><span className="text-xs text-white/70">{pendingPhotos.length} photo{pendingPhotos.length > 1 ? "s" : ""}</span><button onClick={() => setPendingPhotos([])} aria-label="Clear photos"><X className="h-4 w-4 text-white/50" /></button></div>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
            {pendingPhotos.map((file, index) => <div key={`${file.name}-${index}`} className="relative aspect-square overflow-hidden rounded-lg bg-black/30"><img src={URL.createObjectURL(file)} alt={file.name} className="h-full w-full object-cover" /><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setPendingPhotos((items) => items.filter((_, itemIndex) => itemIndex !== index)); }} className="absolute right-1 top-1 z-10 rounded-full bg-black/70 p-1 text-white" aria-label={`Remove ${file.name}`}><X className="h-3 w-3" /></button></div>)}
            <button onClick={() => addPhotoRef.current?.click()} className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-primary/40 text-primary" aria-label="Add more photos"><Plus /></button>
          </div>
          <input value={albumCaption} onChange={(event) => setAlbumCaption(event.target.value)} placeholder="Add a caption (optional)" className="mt-3 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" />
          <Button onClick={sendAlbum} className="mt-3 w-full">Send album <Send className="ml-2 h-4 w-4" /></Button>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={photoRef}
        type="file"
        className="hidden"
        accept="image/*,video/*"
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          const photos = files.filter((file) => file.type.startsWith("image/"));
          if (photos.length) setPendingPhotos((current) => [...current, ...photos].slice(0, 50));
          else if (files[0]) stageFile(files[0]);
          if (photoRef.current) photoRef.current.value = "";
        }}
      />
      <input ref={addPhotoRef} type="file" className="hidden" accept="image/*" multiple onChange={(e) => { setPendingPhotos((current) => [...current, ...Array.from(e.target.files || [])].filter((file) => file.type.startsWith("image/")).slice(0, 50)); e.currentTarget.value = ""; }} />
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="*/*"
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
        onChange={(e) => { void stageFolder(e.target.files); }}
      />

      <div ref={composerRef} className="relative bg-transparent">
        {/* Attachment panel — slides up above the composer */}
        <div
          className={[
            "absolute bottom-full left-0 right-0 z-10 mx-3 mb-2",
            "transition-all duration-200 ease-out",
            attachmentsOpen
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : "opacity-0 translate-y-2 pointer-events-none",
          ].join(" ")}
          style={{ maxWidth: 780, marginLeft: "auto", marginRight: "auto" }}
        >
          <div
            className="relative rounded-2xl px-2 py-3"
            style={{
              background: "rgba(14, 22, 28, 0.82)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(0,210,180,0.18)",
              boxShadow: "0 4px 32px rgba(0,0,0,0.45)",
            }}
          >
            {/* Close button */}
            <button
              onClick={() => setAttachmentsOpen(false)}
              className="absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded-full text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
              aria-label="Close attachment menu"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            {/* Drag handle */}
            <div className="flex justify-center mb-2.5">
              <div className="h-[3px] w-8 rounded-full bg-white/20" />
            </div>

            {/* Icons row */}
            <div className="flex items-stretch justify-around">
              {/* Photos */}
              <AttachItem
                icon={<Image className="h-[22px] w-[22px]" />}
                label="Photos"
                onClick={() => { setAttachmentsOpen(false); photoRef.current?.click(); }}
              />

              <Divider />

              {/* Camera */}
              <AttachItem
                icon={<Camera className="h-[22px] w-[22px]" />}
                label="Camera"
                onClick={() => { setAttachmentsOpen(false); onOpenCamera?.(); }}
              />

              <Divider />

              {/* Files */}
              <AttachItem
                icon={<Paperclip className="h-[22px] w-[22px]" />}
                label="Files"
                onClick={() => { setAttachmentsOpen(false); fileRef.current?.click(); }}
              />

              <Divider />

              {/* Folder */}
              <AttachItem
                icon={<FolderUp className="h-[22px] w-[22px]" />}
                label="Folder"
                onClick={() => { setAttachmentsOpen(false); folderRef.current?.click(); }}
                disabled={preparingFolder}
              />

              <Divider />

              {/* Code */}
              <AttachItem
                icon={<Code2 className="h-[22px] w-[22px]" />}
                label="Code"
                onClick={openCodeSnippet}
              />
            </div>

            {preparingFolder && (
              <p className="text-center text-[11px] text-primary/75 mt-2">Preparing folder zip…</p>
            )}
          </div>
        </div>

        {/* Reply preview */}
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
          {/* Plus / Close toggle */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => setAttachmentsOpen((open) => !open)}
            className="h-10 w-10 rounded-full border border-white/10 bg-white/[0.035] text-white/75 hover:text-white hover:bg-white/[0.08] transition-all shrink-0 self-end pb-0 mb-[8px]"
            aria-label={attachmentsOpen ? "Close attachments" : "Open attachments"}
          >
            <Plus
              className={`h-[19px] w-[19px] transition-transform duration-200 ${attachmentsOpen ? "rotate-45" : ""}`}
            />
          </Button>

          {/* Textarea */}
          <div className="flex-1 min-w-0 self-end">
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder={replyTo ? `Reply to ${replyTo.author}…` : "Message…"}
              value={value}
              onChange={(e) => {
                setAttachmentsOpen(false);
                setValue(e.target.value);
                if (e.target.value) onTyping?.();
                if (stopTypingTimer.current) clearTimeout(stopTypingTimer.current);
                stopTypingTimer.current = setTimeout(() => {
                  onStopTyping?.();
                }, 1500);
              }}
              onFocus={() => setAttachmentsOpen(false)}
              onKeyDown={onKey}
              className="w-full min-h-[40px] max-h-[120px] resize-none overflow-y-hidden bg-white/[0.045] border border-white/[0.09] rounded-[18px] px-3.5 py-[9px] text-[15px] focus:outline-none focus:ring-1 focus:ring-primary/45 focus:border-primary/30 focus:bg-white/[0.07] scrollbar-thin leading-[1.35] placeholder:text-muted-foreground/40 transition-[background-color,border-color] duration-150"
            />
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
            <Send className="h-[20px] w-[20px]" />
          </button>
        </div>
      </div>
    </>
  );
});

// ─── Sub-components ──────────────────────────────────────────────────────────

function AttachItem({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex flex-col items-center justify-center gap-1.5 flex-1 min-w-0",
        "py-1.5 rounded-xl transition-colors duration-150",
        "hover:bg-white/[0.06] active:bg-white/[0.1]",
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <span className="text-white/85">{icon}</span>
      <span className="text-[10px] text-white/55 font-medium tracking-wide leading-none">{label}</span>
    </button>
  );
}

function Divider() {
  return (
    <div className="self-stretch w-px bg-white/[0.08] my-1 shrink-0" />
  );
}

export default InputBar;
