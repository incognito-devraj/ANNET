import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Send, FileArchive, FileCode, FileImage, FileText, FileVideo, FileAudio, FileIcon } from "lucide-react";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTypeIcon({ mimeType, name }: { mimeType?: string; name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mime = mimeType ?? "";
  if (mime.startsWith("image/") || ["jpg","jpeg","png","gif","webp","svg","bmp"].includes(ext))
    return <FileImage size={28} color="hsl(160 84% 50%)" />;
  if (mime.startsWith("video/") || ["mp4","mov","avi","mkv","webm"].includes(ext))
    return <FileVideo size={28} color="hsl(160 84% 50%)" />;
  if (mime.startsWith("audio/") || ["mp3","wav","ogg","flac","aac"].includes(ext))
    return <FileAudio size={28} color="hsl(160 84% 50%)" />;
  if (mime === "application/pdf" || ext === "pdf")
    return <FileText size={28} color="hsl(160 84% 50%)" />;
  if (["zip","gz","tar","rar","7z","bz2"].includes(ext))
    return <FileArchive size={28} color="hsl(160 84% 50%)" />;
  if (["js","ts","tsx","jsx","py","java","c","cpp","cs","go","rs","html","css","json","xml","yaml","yml","sh","md"].includes(ext))
    return <FileCode size={28} color="hsl(160 84% 50%)" />;
  return <FileIcon size={28} color="hsl(160 84% 50%)" />;
}

type Props = { file: File; onConfirm: () => void; onCancel: () => void };

export default function FilePreview({ file, onConfirm, onCancel }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isImage = file.type.startsWith("image/");

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel, onConfirm]);

  const typeLabel = file.type
    ? (file.type.split("/")[1]?.toUpperCase() ?? "")
    : file.name.split(".").pop()?.toUpperCase() ?? "";

  const isP2P = file.size > 5 * 1024 * 1024 ||
    !(file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/"));

  // ─── Styles ────────────────────────────────────────────────────────────────
  const S = {
    // Full-screen fixed overlay — true viewport centering
    overlay: {
      position: "fixed" as const,
      inset: 0,
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
      boxSizing: "border-box" as const,
    },
    backdrop: {
      position: "absolute" as const,
      inset: 0,
      background: "rgba(0,0,0,0.82)",
      backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)",
    },
    // Panel — WhatsApp-style: dark card, max 400px wide, never taller than 90vh
    panel: {
      position: "relative" as const,
      zIndex: 1,
      width: "100%",
      maxWidth: 400,
      maxHeight: "90vh",
      display: "flex",
      flexDirection: "column" as const,
      borderRadius: 20,
      overflow: "hidden",
      background: "hsl(230 22% 10% / 0.98)",
      border: "1px solid rgba(255,255,255,0.10)",
      boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
    },
    // Header
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "14px 16px",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
      flexShrink: 0,
    },
    headerLeft: {
      display: "flex",
      alignItems: "center",
      gap: 8,
    },
    title: {
      fontSize: 15,
      fontWeight: 600,
      color: "rgba(255,255,255,0.92)",
      margin: 0,
    },
    badge: {
      fontSize: 10,
      fontFamily: "monospace",
      color: "hsl(160 84% 50% / 0.7)",
      background: "hsl(160 84% 50% / 0.12)",
      padding: "2px 7px",
      borderRadius: 5,
    },
    closeBtn: {
      padding: 6,
      borderRadius: 8,
      background: "transparent",
      border: "none",
      cursor: "pointer",
      color: "rgba(255,255,255,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "color 0.15s",
    },
    // Body — scrollable
    body: {
      flex: 1,
      overflowY: "auto" as const,
      minHeight: 0,
      padding: 16,
    },
    // Image preview
    imgWrap: {
      borderRadius: 12,
      overflow: "hidden",
      background: "rgba(0,0,0,0.5)",
      border: "1px solid rgba(255,255,255,0.07)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    img: {
      width: "100%",
      display: "block",
      objectFit: "contain" as const,
      maxHeight: "45vh",
    },
    imgMeta: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 10,
      gap: 8,
    },
    imgName: {
      fontSize: 12,
      color: "rgba(255,255,255,0.45)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap" as const,
      margin: 0,
      flex: 1,
    },
    imgSize: {
      fontSize: 11,
      color: "rgba(255,255,255,0.30)",
      flexShrink: 0,
      fontFamily: "monospace",
    },
    // Non-image file row
    fileRow: {
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "14px 16px",
      borderRadius: 14,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.07)",
    },
    fileIcon: {
      width: 52,
      height: 52,
      borderRadius: 14,
      background: "hsl(160 84% 50% / 0.12)",
      border: "1px solid hsl(160 84% 50% / 0.22)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    fileInfo: {
      minWidth: 0,
      flex: 1,
    },
    fileName: {
      fontSize: 14,
      fontWeight: 500,
      color: "rgba(255,255,255,0.92)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap" as const,
      margin: 0,
    },
    fileMeta: {
      fontSize: 12,
      color: "rgba(255,255,255,0.42)",
      margin: "4px 0 0",
    },
    // Footer
    footer: {
      display: "flex",
      gap: 8,
      padding: "12px 16px",
      borderTop: "1px solid rgba(255,255,255,0.06)",
      flexShrink: 0,
    },
    cancelBtn: {
      flex: 1,
      height: 44,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.10)",
      background: "transparent",
      color: "rgba(255,255,255,0.55)",
      fontSize: 14,
      fontWeight: 500,
      cursor: "pointer",
      transition: "background 0.15s",
    },
    sendBtn: {
      flex: 1,
      height: 44,
      borderRadius: 12,
      border: "none",
      background: "hsl(160 84% 45%)",
      color: "hsl(230 20% 6%)",
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      boxShadow: "0 0 18px hsl(160 84% 45% / 0.35)",
      transition: "background 0.15s, box-shadow 0.15s",
    },
  };

  return createPortal(
    <div style={S.overlay}>
      {/* Backdrop */}
      <div style={S.backdrop} onClick={onCancel} />

      {/* Panel */}
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={S.header}>
          <div style={S.headerLeft}>
            <span style={S.title}>Send file</span>
            <span style={S.badge}>{isP2P ? "P2P · WebRTC" : "Socket · Direct"}</span>
          </div>
          <button style={S.closeBtn} onClick={onCancel} aria-label="Cancel">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={S.body}>
          {isImage && previewUrl ? (
            <>
              <div style={S.imgWrap}>
                <img src={previewUrl} alt={file.name} style={S.img} />
              </div>
              <div style={S.imgMeta}>
                <p style={S.imgName} title={file.name}>{file.name}</p>
                <span style={S.imgSize}>{formatSize(file.size)}</span>
              </div>
            </>
          ) : (
            <div style={S.fileRow}>
              <div style={S.fileIcon}>
                <FileTypeIcon mimeType={file.type} name={file.name} />
              </div>
              <div style={S.fileInfo}>
                <p style={S.fileName} title={file.name}>{file.name}</p>
                <p style={S.fileMeta}>
                  {formatSize(file.size)}{typeLabel ? ` · ${typeLabel}` : ""}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button
            style={S.cancelBtn}
            onClick={onCancel}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Cancel
          </button>
          <button
            style={S.sendBtn}
            onClick={onConfirm}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "hsl(160 84% 52%)";
              e.currentTarget.style.boxShadow = "0 0 24px hsl(160 84% 45% / 0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "hsl(160 84% 45%)";
              e.currentTarget.style.boxShadow = "0 0 18px hsl(160 84% 45% / 0.35)";
            }}
          >
            <Send size={14} />
            Send
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
