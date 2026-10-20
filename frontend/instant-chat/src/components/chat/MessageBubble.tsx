import { useState, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
import { ChatMessage } from "@/types/chat";
import { Button } from "@/components/ui/button";
import {
  Check, Copy, Download, FileArchive, FileCode,
  FileImage, FileText, FileVideo, FileAudio,
  FileIcon, Reply, X, ZoomIn,
} from "lucide-react";
import type { Album } from "@/types/chat";
import { albumImageDownloadUrl } from "@/lib/albums";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function FileTypeIcon({ mimeType, name }: { mimeType?: string; name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mime = mimeType ?? "";
  const cls = "h-4 w-4 text-primary";
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) return <FileImage className={cls} />;
  if (mime.startsWith("video/") || ["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return <FileVideo className={cls} />;
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "flac", "aac"].includes(ext)) return <FileAudio className={cls} />;
  if (mime === "application/pdf" || ext === "pdf") return <FileText className={cls} />;
  if (["zip", "gz", "tar", "rar", "7z", "bz2"].includes(ext) || mime.includes("zip") || mime.includes("gzip")) return <FileArchive className={cls} />;
  if (["js", "ts", "tsx", "jsx", "py", "java", "c", "cpp", "cs", "go", "rs", "html", "css", "json", "xml", "yaml", "yml", "sh", "md"].includes(ext)) return <FileCode className={cls} />;
  if (["doc", "docx", "txt", "csv", "xls", "xlsx", "ppt", "pptx", "odt"].includes(ext)) return <FileText className={cls} />;
  return <FileIcon className={cls} />;
}

function ImageLightbox({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/92 backdrop-blur-md"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all z-10"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
      <a
        href={src}
        download={name}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-4 right-16 p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all z-10"
        aria-label="Download"
      >
        <Download className="h-5 w-5" />
      </a>
      <div
        className="relative flex items-center justify-center px-4"
        style={{ maxWidth: "92vw", maxHeight: "88vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={name}
          className="rounded-xl shadow-2xl select-none object-contain"
          style={{ maxWidth: "100%", maxHeight: "88vh" }}
          draggable={false}
        />
        <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-black/60 backdrop-blur-sm rounded-b-xl">
          <p className="text-xs text-white/70 truncate text-center">{name}</p>
        </div>
      </div>
    </div>
  );
}

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
    <div className="rounded-lg overflow-hidden border border-primary/20 bg-black w-full">
      <div className="flex items-center justify-between px-3 py-1.5 bg-primary/5 border-b border-primary/15">
        <span className="text-[10px] text-primary/50 font-mono tracking-widest uppercase select-none">{detected}</span>
        <button
          onPointerDown={(e) => { e.preventDefault(); copy(); }}
          className="flex items-center gap-1.5 text-[11px] text-primary/40 hover:text-primary/80 transition-colors min-h-[28px] min-w-[56px] justify-end px-1 font-mono"
          aria-label="Copy code"
        >
          {copied
            ? <><Check className="h-3 w-3 shrink-0" /><span>copied</span></>
            : <><Copy className="h-3 w-3 shrink-0" /><span>copy</span></>}
        </button>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <pre className="m-0 px-4 py-3">
          <code ref={codeRef} className="text-[12.5px] leading-relaxed !bg-transparent whitespace-pre font-mono">
            {code}
          </code>
        </pre>
      </div>
    </div>
  );
}

function ReplyPreview({ replyId, author, preview }: { replyId: string; author: string; preview: string }) {
  const scrollToOriginal = () => {
    const el = document.getElementById(`msg-${replyId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("msg-highlight");
    setTimeout(() => el.classList.remove("msg-highlight"), 1500);
  };

  return (
    <button
      onClick={scrollToOriginal}
      className="mb-2 flex w-full items-start gap-2 rounded-xl bg-black/18 px-3 py-2 text-left border border-white/6 hover:bg-black/28 transition-colors"
    >
      <span className="mt-0.5 h-8 w-1 rounded-full bg-primary/65 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold tracking-wide text-primary/80">
          {author}
        </span>
        <span className="mt-0.5 block truncate text-xs text-foreground/55">
          {preview}
        </span>
      </span>
    </button>
  );
}

function FileCard({
  msg, mine, onReceiveFile, onDownloadFile,
}: {
  msg: Extract<ChatMessage, { kind: "file_offer" }>;
  mine: boolean;
  onReceiveFile?: (id: string) => void;
  onDownloadFile?: (id: string) => void;
}) {
  const { fileMeta, transferState, transferPercent, transferError } = msg;
  const isActive = transferState === "connecting" || transferState === "transferring";

  return (
    <div className="flex flex-col gap-2 w-full min-w-0" style={{ minWidth: "200px", maxWidth: "260px" }}>
      <div className="flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <FileTypeIcon mimeType={fileMeta.mimeType} name={fileMeta.name} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight truncate" title={fileMeta.name}>
            {fileMeta.name}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            {formatSize(fileMeta.size)}
            {fileMeta.mimeType ? ` · ${fileMeta.mimeType.split("/")[1]?.toUpperCase() ?? fileMeta.mimeType}` : ""}
          </p>
        </div>
        <div className="shrink-0">
          {!mine && !msg.received && onReceiveFile && (
            <Button size="sm" variant="secondary" onClick={() => onReceiveFile(msg.id)} className="h-7 px-2.5 text-xs gap-1">
              <Download className="h-3 w-3" />Accept
            </Button>
          )}
          {transferState === "done" && (
            mine
              ? <span className="text-xs text-primary/70 flex items-center gap-1"><Check className="h-3 w-3" />Sent</span>
              : <Button size="sm" variant="secondary" onClick={() => onDownloadFile?.(msg.id)} className="h-7 px-2.5 text-xs gap-1" disabled={!msg.downloadBlob}>
                  <Download className="h-3 w-3" />Save
                </Button>
          )}
          {transferState === "error" && <span className="text-xs text-destructive">Failed</span>}
        </div>
      </div>

      {isActive && (
        <div className="w-full">
          <div className="flex justify-between text-xs text-muted-foreground/60 mb-1">
            <span className="flex items-center gap-1">
              {transferState === "connecting"
                ? <><span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse" />Connecting...</>
                : "Transferring..."}
            </span>
            <span>{transferPercent ?? 0}%</span>
          </div>
          <div className="h-1.5 w-full bg-primary/10 rounded-full overflow-hidden">
            <div className="h-full bg-primary/70 rounded-full transition-all duration-300" style={{ width: `${transferPercent ?? 0}%` }} />
          </div>
        </div>
      )}

      {transferState === "error" && transferError && (
        <p className="text-xs text-destructive break-words">{transferError}</p>
      )}
    </div>
  );
}

function MediaBubble({ msg, ts, onOpenImage }: {
  msg: Extract<ChatMessage, { kind: "media" }>;
  ts: string;
  onOpenImage: () => void;
}) {
  const mime = msg.fileMeta.mimeType ?? "";
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const isAudio = mime.startsWith("audio/");

  return (
    <div className="space-y-1">
      {isImage && (
        <div
          className="relative group/img cursor-zoom-in rounded-lg overflow-hidden"
          onClick={onOpenImage}
        >
          <img
            src={msg.dataUrl}
            alt={msg.fileMeta.name}
            className="w-full object-contain select-none"
            style={{ maxHeight: "260px" }}
            draggable={false}
          />
          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/25 transition-colors flex items-center justify-center">
            <ZoomIn className="h-7 w-7 text-white opacity-0 group-hover/img:opacity-90 transition-opacity drop-shadow-lg" />
          </div>
          <a
            href={msg.dataUrl}
            download={msg.fileMeta.name}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-white/70 hover:text-white hover:bg-black/80 transition-all opacity-0 group-hover/img:opacity-100"
            aria-label="Download image"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
          {/* Timestamp overlaid on image — WhatsApp style */}
          <div className="absolute bottom-0 left-0 right-0 flex items-end justify-end px-2 py-1.5 bg-gradient-to-t from-black/50 to-transparent pointer-events-none">
            <span className="text-[11px] text-white/80 leading-none">{ts}</span>
          </div>
        </div>
      )}

      {isVideo && (
        <>
          <video
            controls
            preload="metadata"
            className="w-full rounded-lg bg-black"
            style={{ maxHeight: "280px" }}
          >
            <source src={msg.dataUrl} type={mime} />
          </video>
          <div className="flex items-center justify-between px-0.5">
            <p className="truncate text-xs text-muted-foreground/50 flex-1" title={msg.fileMeta.name}>
              {msg.fileMeta.name} · {formatSize(msg.fileMeta.size)}
            </p>
            <span className="text-[11px] text-muted-foreground/50 ml-2 shrink-0">{ts}</span>
          </div>
        </>
      )}

      {isAudio && (
        <>
          <audio controls className="w-full min-w-[240px]">
            <source src={msg.dataUrl} type={mime} />
          </audio>
          <div className="flex items-center justify-between px-0.5">
            <p className="truncate text-xs text-muted-foreground/50 flex-1" title={msg.fileMeta.name}>
              {msg.fileMeta.name} · {formatSize(msg.fileMeta.size)}
            </p>
            <span className="text-[11px] text-muted-foreground/50 ml-2 shrink-0">{ts}</span>
          </div>
        </>
      )}

      {!isImage && !isVideo && !isAudio && (
        <>
          <a
            href={msg.dataUrl}
            download={msg.fileMeta.name}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm hover:bg-black/30 transition-colors"
          >
            <FileTypeIcon mimeType={mime} name={msg.fileMeta.name} />
            <span className="truncate">{msg.fileMeta.name}</span>
          </a>
          <div className="flex items-center justify-between px-0.5">
            <p className="truncate text-xs text-muted-foreground/50 flex-1">
              {formatSize(msg.fileMeta.size)}
            </p>
            <span className="text-[11px] text-muted-foreground/50 ml-2 shrink-0">{ts}</span>
          </div>
        </>
      )}
    </div>
  );
}

function SharedReplyPreview({ msg }: { msg: Extract<ChatMessage, { replyTo?: unknown }> }) {
  if (!msg.replyTo) return null;
  return (
    <ReplyPreview
      replyId={msg.replyTo.id}
      author={msg.replyTo.author}
      preview={msg.replyTo.preview}
    />
  );
}

function AlbumBubble({ album, onOpen }: { album: Album; onOpen: (index: number) => void }) {
  const visible = album.attachments.slice(0, 4);
  if (album.attachments.length === 1) {
    const photo = album.attachments[0];
    return <div className="w-full max-w-[360px]">
      <button type="button" onClick={() => onOpen(0)} className="group relative block max-w-full overflow-hidden rounded-xl text-left" aria-label={`View ${photo.name}`}>
        <img src={photo.url} loading="lazy" alt={photo.name} className="block max-h-[360px] max-w-full object-contain transition-transform duration-300 group-hover:scale-[1.015]" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-3 pb-2 pt-8 text-left text-[11px] text-white/80">{photo.name}</span>
      </button>
      {album.caption && <p className="mt-2 text-sm text-white/80">{album.caption}</p>}
    </div>;
  }
  return <div className="w-full max-w-[360px]">
    <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-xl">
      {visible.map((item, index) => <button key={item.id} type="button" onClick={() => onOpen(index)} className="relative aspect-square overflow-hidden bg-black/30"><img src={item.url} loading="lazy" alt={item.name} className="h-full w-full object-cover transition-transform hover:scale-105" />{index === 3 && album.attachments.length > 4 && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-xl font-semibold text-white">+{album.attachments.length - 4}</span>}</button>)}
    </div>
    {album.caption && <p className="mt-2 text-sm text-white/80">{album.caption}</p>}
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3"><span className="text-[11px] text-white/45">{album.attachments.length} original {album.attachments.length === 1 ? "photo" : "photos"}</span><span className="flex gap-2"><a href={album.zipUrl || "#"} download className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20">Download all</a><button type="button" onClick={() => onOpen(0)} className="rounded-xl bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground transition-transform hover:scale-[1.02]">View photos</button></span></div>
  </div>;
}

function AlbumViewer({ album, index, onClose, onChange }: { album: Album; index: number; onClose: () => void; onChange: (index: number) => void }) {
  const startX = useRef<number | null>(null);
  const pointerId = useRef<number | null>(null);
  const previousIndex = useRef(index);
  const item = album.attachments[index];
  const [dragX, setDragX] = useState(0);
  const [downloadState, setDownloadState] = useState<"idle" | "downloading" | "downloaded">("idle");
  const [slideDirection, setSlideDirection] = useState<"next" | "previous">("next");
  const [zoom, setZoom] = useState(1);
  useEffect(() => { setDownloadState("idle"); }, [item.id]);
  useEffect(() => { setZoom(1); }, [item.id]);
  useEffect(() => {
    if (index !== previousIndex.current) setSlideDirection(index > previousIndex.current ? "next" : "previous");
    previousIndex.current = index;
  }, [index]);
  useEffect(() => {
    window.history.pushState({ ...window.history.state, annetAlbumViewer: true }, "", window.location.href);
    const closeFromBack = () => onClose();
    window.addEventListener("popstate", closeFromBack);
    return () => window.removeEventListener("popstate", closeFromBack);
  }, [album.id]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { if (window.history.state?.annetAlbumViewer) window.history.back(); else onClose(); }
      if (event.key === "ArrowLeft") onChange(Math.max(0, index - 1));
      if (event.key === "ArrowRight") onChange(Math.min(album.attachments.length - 1, index + 1));
    };
    window.addEventListener("keydown", key); document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = ""; };
  }, [album.attachments.length, index, onChange, onClose]);
  const downloadUrl = albumImageDownloadUrl(item.url);
  const markDownloaded = () => setDownloadState("downloaded");
  const closeViewer = () => { if (window.history.state?.annetAlbumViewer) window.history.back(); else onClose(); };
  const finishSwipe = (clientX: number) => {
    if (startX.current === null) return;
    const delta = clientX - startX.current;
    startX.current = null; pointerId.current = null; setDragX(0);
    if (Math.abs(delta) > 45) onChange(Math.max(0, Math.min(album.attachments.length - 1, index + (delta < 0 ? 1 : -1))));
  };
  return <div data-album-viewer="true" className="fixed inset-0 z-[100] flex flex-col bg-black/95 shadow-[inset_0_0_120px_rgba(0,0,0,0.9)] ring-1 ring-white/10 backdrop-blur-sm" style={{ touchAction: "pan-y" }} onPointerDown={(event) => { if (event.pointerType === "mouse" && event.button !== 0) return; pointerId.current = event.pointerId; startX.current = event.clientX; event.currentTarget.setPointerCapture?.(event.pointerId); setDragX(0); }} onPointerMove={(event) => { if (pointerId.current === event.pointerId && startX.current !== null) setDragX(event.clientX - startX.current); }} onPointerUp={(event) => { if (pointerId.current === event.pointerId) finishSwipe(event.clientX); }} onPointerCancel={() => { pointerId.current = null; startX.current = null; setDragX(0); }}>
    <style>{`@keyframes album-slide-next { from { transform: translateX(12%); opacity: .35; } to { transform: translateX(0); opacity: 1; } } @keyframes album-slide-previous { from { transform: translateX(-12%); opacity: .35; } to { transform: translateX(0); opacity: 1; } }`}</style>
    <div className="flex items-center justify-end gap-2 p-4"><button type="button" onClick={() => setZoom((value) => Math.max(1, value - 0.25))} className="px-2 text-xl text-white/75" aria-label="Zoom out">−</button><span className="min-w-10 text-center text-xs text-white/50">{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.25))} className="px-2 text-xl text-white/75" aria-label="Zoom in">+</button><button type="button" onClick={closeViewer} className="ml-2 px-2 text-white" aria-label="Close viewer"><X /></button></div>
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-14"><button type="button" disabled={index === 0} onClick={() => onChange(index - 1)} className="absolute left-3 z-10 px-2 text-4xl font-light leading-none text-white/75 transition-opacity hover:text-white disabled:opacity-20" aria-label="Previous photo">‹</button><img key={item.id} src={item.url} alt={item.name} onDoubleClick={() => setZoom((value) => value === 1 ? 2 : 1)} onWheel={(event) => { event.preventDefault(); setZoom((value) => Math.max(1, Math.min(3, value + (event.deltaY < 0 ? 0.2 : -0.2)))); }} className="max-h-full max-w-full select-none object-contain transition-transform duration-200" style={{ transform: `translateX(${dragX}px) scale(${zoom})`, opacity: Math.max(0.65, 1 - Math.abs(dragX) / 500), animation: `album-slide-${slideDirection} 240ms cubic-bezier(.22,.61,.36,1)` }} draggable={false} /><button type="button" disabled={index === album.attachments.length - 1} onClick={() => onChange(index + 1)} className="absolute right-3 z-10 px-2 text-4xl font-light leading-none text-white/75 transition-opacity hover:text-white disabled:opacity-20" aria-label="Next photo">›</button></div>
    <div className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"><div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-2xl border border-white/15 bg-[#111820]/90 p-2 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl"><span className="hidden max-w-[180px] truncate px-2 text-xs text-white/60 sm:inline">{index + 1} / {album.attachments.length} · {item.name}</span><a href={album.zipUrl || "#"} download className="rounded-xl border border-white/15 px-3 py-2.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/10">Download all</a><a href={downloadUrl} download onClick={markDownloaded} className="rounded-xl bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground">{downloadState === "downloaded" ? "Downloaded" : "Download this photo"}</a></div></div>
  </div>;
}

function ReplyAccessibilityButton({ id, onReply }: { id: string; onReply?: (id: string) => void }) {
  if (!onReply) return null;

  return (
    <button
      type="button"
      onClick={() => onReply(id)}
      className="sr-only"
      aria-label="Reply"
    >
      Reply
    </button>
  );
}

export default function MessageBubble({
  msg, textSize = 15, prevMsg, nextMsg, onReceiveFile, onDownloadFile, onReply,
}: {
  msg: ChatMessage;
  textSize?: number;
  prevMsg?: ChatMessage;
  nextMsg?: ChatMessage;
  onReceiveFile?: (id: string) => void;
  onDownloadFile?: (id: string) => void;
  onReply?: (id: string) => void;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [albumIndex, setAlbumIndex] = useState(-1);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const dragState = useRef<{ x: number; y: number; active: boolean; pointerId: number | null }>({
    x: 0,
    y: 0,
    active: false,
    pointerId: null,
  });

  if (msg.kind === "system") {
    return (
      <div className="flex justify-center my-3 px-2">
        <span className="text-[11px] text-muted-foreground/50 bg-black/20 backdrop-blur-sm px-3 py-1 rounded-full border border-white/[0.06]">
          {msg.message}
        </span>
      </div>
    );
  }

  if (msg.kind === "album") {
    const openAlbum = (index: number) => setAlbumIndex(index);
    return <><div id={`msg-${msg.id}`} className={`flex flex-col ${msg.mine ? "items-end" : "items-start"} mt-3 w-full`}><span className={`mb-1 px-2 text-[11px] font-semibold tracking-wide ${msg.mine ? "text-primary/80" : "text-white/60"}`}>{msg.mine ? "You" : msg.author}</span><div className={`message ${msg.mine ? "sent" : "received"} has-tail min-w-0 max-w-[380px] rounded-2xl border border-white/10 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.16)]`}>{<AlbumBubble album={msg.album} onOpen={openAlbum} />}</div></div>{albumIndex >= 0 && <AlbumViewer album={msg.album} index={albumIndex} onClose={() => setAlbumIndex(-1)} onChange={setAlbumIndex} />}</>;
  }

  const mine = msg.mine;
  const align = mine ? "items-end" : "items-start";
  const replyDirection = mine ? -1 : 1;
  const swipeEnabled = msg.kind !== "file_offer";
  const groupedWithPrev = !!prevMsg && prevMsg.kind !== "system" && prevMsg.mine === msg.mine && prevMsg.author === msg.author;
  const groupedWithNext = !!nextMsg && nextMsg.kind !== "system" && nextMsg.mine === msg.mine && nextMsg.author === msg.author;

  const beginSwipe = (clientX: number, clientY: number, pointerId: number | null) => {
    if (!swipeEnabled || !onReply) return;
    dragState.current = { x: clientX, y: clientY, active: true, pointerId };
  };

  const moveSwipe = (clientX: number, clientY: number) => {
    if (!dragState.current.active) return;

    const deltaX = (clientX - dragState.current.x) * replyDirection;
    const deltaY = Math.abs(clientY - dragState.current.y);
    if (deltaY > 32 && Math.abs(deltaX) < 16) {
      dragState.current.active = false;
      setSwipeOffset(0);
      return;
    }

    setSwipeOffset(Math.max(0, Math.min(72, deltaX)));
  };

  const endSwipe = () => {
    if (!dragState.current.active) {
      setSwipeOffset(0);
      return;
    }

    const shouldReply = swipeOffset >= 54;
    dragState.current.active = false;
    setSwipeOffset(0);
    if (shouldReply) {
      onReply?.(msg.id);
    }
  };

  const swipeHandlers = swipeEnabled ? {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      beginSwipe(e.clientX, e.clientY, e.pointerId);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (dragState.current.pointerId !== null && e.pointerId !== dragState.current.pointerId) return;
      moveSwipe(e.clientX, e.clientY);
    },
    onPointerUp: () => {
      endSwipe();
    },
    onPointerCancel: () => {
      dragState.current.active = false;
      setSwipeOffset(0);
    },
  } : {};

  const translatedStyle = swipeOffset > 0
    ? { transform: `translateX(${swipeOffset * replyDirection}px)` }
    : undefined;
  const replyPreviewStyle = {
    fontSize: `${Math.max(11, textSize - 3)}px`,
  };
  const timestampText = formatTime(msg.ts);
  // Show tail only on the last bubble in a group (not grouped with next)
  const hasTail = !groupedWithNext;
  const bubbleSpacing = groupedWithPrev ? "mt-[3px]" : "mt-3";
  // Author name shown inside bubble for received messages, only on first of group
  const authorVisible = !mine && !groupedWithPrev;

  if (msg.kind === "code") {
    return (
      <div id={`msg-${msg.id}`} className={`flex flex-col ${align} ${bubbleSpacing} w-full min-w-0 max-w-full`}>
        {authorVisible && (
          <span className="text-xs font-semibold text-primary/70 px-1 mb-1">
            {msg.author}
          </span>
        )}
        <div className={`relative flex items-end w-full min-w-0 md:max-w-[75%] ${mine ? "self-end" : "self-start"}`} {...swipeHandlers}>
          <ReplyAccessibilityButton id={msg.id} onReply={onReply} />
          <div className={`absolute top-1/2 -translate-y-1/2 ${mine ? "left-2" : "right-2"} transition-all ${swipeOffset > 8 ? "opacity-100 scale-100" : "opacity-0 scale-90"}`}>
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/15 border border-primary/25 text-primary">
              <Reply className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="min-w-0 flex-1 overflow-hidden transition-transform duration-75" style={translatedStyle}>
            <div style={replyPreviewStyle}>
              <SharedReplyPreview msg={msg} />
            </div>
            <CodeBlock code={msg.code} />
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground/40 px-2 mt-1">{timestampText}</span>
      </div>
    );
  }

  return (
    <>
      {lightboxOpen && msg.kind === "media" && (msg.fileMeta.mimeType ?? "").startsWith("image/") && (
        <ImageLightbox src={msg.dataUrl} name={msg.fileMeta.name} onClose={() => setLightboxOpen(false)} />
      )}

      <div id={`msg-${msg.id}`} className={`flex flex-col ${align} ${bubbleSpacing} w-full min-w-0 max-w-full`}>
        <div className={`relative flex w-full items-end gap-1.5 min-w-0 ${mine ? "flex-row-reverse justify-start" : "flex-row justify-start"}`} {...swipeHandlers}>
          {swipeEnabled && <ReplyAccessibilityButton id={msg.id} onReply={onReply} />}
          {swipeEnabled && (
            <div className={`absolute top-1/2 -translate-y-1/2 z-0 ${mine ? "left-2" : "right-2"} transition-all ${swipeOffset > 8 ? "opacity-100 scale-100" : "opacity-0 scale-90"}`}>
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/15 border border-primary/25 text-primary">
                <Reply className="h-3.5 w-3.5" />
              </div>
            </div>
          )}

          <div
            className={`message ${mine ? "sent" : "received"} ${hasTail ? "has-tail" : ""} min-w-0 relative z-10 transition-transform duration-75 touch-pan-y`}
            style={{
              minWidth: msg.kind === "file_offer" ? "220px" : undefined,
              ...translatedStyle,
            }}
          >
            {/* Author name inside bubble — received messages, first of group */}
            {authorVisible && (
              <span className="message-author">{msg.author}</span>
            )}

            {(msg.kind === "message" || msg.kind === "media") && (
              <div style={replyPreviewStyle}>
                <SharedReplyPreview msg={msg} />
              </div>
            )}

            {msg.kind === "message" && (
              <div className="message-copy">
                <p className="message-body" style={{ fontSize: `${textSize}px` }}>
                  {msg.message}
                </p>
              </div>
            )}

            {msg.kind === "media" && (
              <MediaBubble msg={msg} ts={timestampText} onOpenImage={() => setLightboxOpen(true)} />
            )}

            {msg.kind === "file_offer" && (
              <FileCard msg={msg} mine={mine} onReceiveFile={onReceiveFile} onDownloadFile={onDownloadFile} />
            )}
          </div>
        </div>

        {/* Timestamp sits outside & below the bubble in the flex-col parent.
            Aligned to match the bubble's side. Low-visibility, like code block. */}
        <span className={`message-time ${mine ? "self-end" : "self-start"}`}>
          {timestampText}
        </span>
      </div>
    </>
  );
}
