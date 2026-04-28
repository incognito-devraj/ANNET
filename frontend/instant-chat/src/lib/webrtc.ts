/**
 * WebRTC P2P file transfer — security-first implementation.
 *
 * Security measures:
 * 1. Max file size: 100 MB hard cap
 * 2. MIME type allowlist — only safe types accepted
 * 3. File extension blocklist — double-checks the filename
 * 4. Receiver must explicitly click "Accept & Download" — no auto-download
 * 5. Blob URL is revoked after download to free memory
 * 6. Received byte count is validated against declared size before saving
 *
 * Signaling fixes:
 * - ICE candidates are queued until setRemoteDescription completes (race fix)
 * - answer and ice_candidate are routed directly to the target socket (not broadcast)
 */

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

const ALLOWED_MIME_PREFIXES = [
  "image/",
  "video/",
  "audio/",
  "text/plain",
  "text/csv",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/gzip",
  "application/x-tar",
  "application/json",
  "application/xml",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-",
  "application/msword",
  "application/vnd.oasis",
  "font/",
];

const BLOCKED_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "com", "msi", "msp", "msc",
  "ps1", "ps2", "psm1", "psd1", "ps1xml",
  "sh", "bash", "zsh", "fish", "ksh",
  "vbs", "vbe", "js", "jse", "wsf", "wsh", "hta",
  "scr", "pif", "reg", "inf", "ins", "isp",
  "dll", "sys", "drv", "ocx", "cpl",
  "jar", "class",
  "app", "dmg", "pkg", "deb", "rpm",
  "apk", "ipa",
  "lnk", "url",
]);

export type FileSecurityResult = { ok: true } | { ok: false; reason: string };

export function checkFileSecurity(name: string, size: number, mimeType: string): FileSecurityResult {
  if (size > MAX_FILE_SIZE) {
    return { ok: false, reason: `File exceeds the 100 MB limit (${(size / 1024 / 1024).toFixed(1)} MB).` };
  }
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: `File type ".${ext}" is not allowed for security reasons.` };
  }
  if (mimeType && mimeType !== "application/octet-stream") {
    const allowed = ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
    if (!allowed) {
      return { ok: false, reason: `MIME type "${mimeType}" is not permitted.` };
    }
  }
  return { ok: true };
}

// Type-safe helper — call only after confirming ok === false
export function getSecurityReason(result: FileSecurityResult): string {
  if (!result.ok) return result.reason;
  return "";
}

const CHUNK_SIZE = 64 * 1024; // 64 KB

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type TransferProgress = { transferred: number; total: number; percent: number };

export type WebRTCCallbacks = {
  onProgress: (progress: TransferProgress) => void;
  onComplete: (blob: Blob, fileName: string) => void;
  onError: (err: string) => void;
};

// ─── PeerSession ─────────────────────────────────────────────────────────────
// Wraps RTCPeerConnection and handles ICE candidate queuing.
// Candidates that arrive before setRemoteDescription is called are buffered
// and flushed once the remote description is set.

export class PeerSession {
  pc: RTCPeerConnection;
  private remoteDescSet = false;
  private iceCandidateQueue: RTCIceCandidateInit[] = [];

  constructor() {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(desc));
    this.remoteDescSet = true;
    // Flush queued ICE candidates
    for (const candidate of this.iceCandidateQueue) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn("[webrtc] queued addIceCandidate failed", e);
      }
    }
    this.iceCandidateQueue = [];
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.remoteDescSet) {
      // Queue it — remote description not set yet
      this.iceCandidateQueue.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn("[webrtc] addIceCandidate failed", e);
    }
  }

  close(): void {
    this.pc.close();
  }
}

// ─── Sender side ─────────────────────────────────────────────────────────────

export async function createSenderPeer(
  file: File,
  onIceCandidate: (candidate: RTCIceCandidateInit) => void,
  callbacks: WebRTCCallbacks,
): Promise<{ session: PeerSession; offer: RTCSessionDescriptionInit }> {
  const session = new PeerSession();
  const pc = session.pc;
  const dc = pc.createDataChannel("file-transfer", { ordered: true });
  let sentAllChunks = false;
  let completed = false;
  let failed = false;

  dc.onopen = () => {
    const reader = new FileReader();
    let offset = 0;

    const sendNextChunk = () => {
      if (offset >= file.size) return;
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      reader.readAsArrayBuffer(slice);
    };

    reader.onload = (e) => {
      if (!e.target?.result) return;
      dc.send(e.target.result as ArrayBuffer);
      offset += CHUNK_SIZE;
      sentAllChunks = offset >= file.size;
      callbacks.onProgress({
        transferred: Math.min(offset, file.size),
        total: file.size,
        percent: Math.round((Math.min(offset, file.size) / file.size) * 100),
      });
      if (dc.bufferedAmount > CHUNK_SIZE * 4) {
        const wait = () => {
          if (dc.bufferedAmount <= CHUNK_SIZE * 2) sendNextChunk();
          else setTimeout(wait, 50);
        };
        setTimeout(wait, 50);
      } else {
        sendNextChunk();
      }
    };

    sendNextChunk();
  };

  dc.onclose = () => {
    if (failed || completed || !sentAllChunks) return;
    completed = true;
    callbacks.onProgress({ transferred: file.size, total: file.size, percent: 100 });
    callbacks.onComplete(new Blob(), ""); // signal completion to sender side
  };

  dc.onerror = () => {
    if (completed || failed) return;
    failed = true;
    callbacks.onError("Data channel error on sender side.");
  };

  // ICE candidates fire after setLocalDescription — safe to emit immediately
  pc.onicecandidate = (e) => {
    if (e.candidate) onIceCandidate(e.candidate.toJSON());
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  return { session, offer };
}

// ─── Receiver side ───────────────────────────────────────────────────────────

export async function createReceiverPeer(
  offer: RTCSessionDescriptionInit,
  fileMeta: { name: string; size: number; mimeType: string },
  onIceCandidate: (candidate: RTCIceCandidateInit) => void,
  callbacks: WebRTCCallbacks,
): Promise<{ session: PeerSession; answer: RTCSessionDescriptionInit }> {
  const session = new PeerSession();
  const pc = session.pc;
  const receivedChunks: ArrayBuffer[] = [];
  let receivedBytes = 0;

  pc.ondatachannel = (e) => {
    const dc = e.channel;

    dc.onmessage = (ev) => {
      const chunk = ev.data as ArrayBuffer;
      receivedChunks.push(chunk);
      receivedBytes += chunk.byteLength;

      callbacks.onProgress({
        transferred: receivedBytes,
        total: fileMeta.size,
        percent: Math.round((receivedBytes / fileMeta.size) * 100),
      });

      if (receivedBytes >= fileMeta.size) {
        if (receivedBytes !== fileMeta.size) {
          callbacks.onError(`Size mismatch: expected ${fileMeta.size} bytes, got ${receivedBytes}.`);
          pc.close();
          return;
        }
        const blob = new Blob(receivedChunks, { type: fileMeta.mimeType || "application/octet-stream" });
        callbacks.onComplete(blob, fileMeta.name);
        dc.close();
      }
    };

    dc.onerror = () => callbacks.onError("Data channel error during transfer.");
  };

  // ICE candidates fire after setLocalDescription
  pc.onicecandidate = (e) => {
    if (e.candidate) onIceCandidate(e.candidate.toJSON());
  };

  // setRemoteDescription via PeerSession (also flushes any queued candidates)
  await session.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  return { session, answer };
}

// ─── Safe download trigger ───────────────────────────────────────────────────

export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
