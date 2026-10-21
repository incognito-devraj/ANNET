import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, RefreshCw, Send } from "lucide-react";

type Props = {
  onCapture: (file: File) => void;
};

const MAX_CAPTURE_EDGE = 1600;

function makePhotoFile(video: HTMLVideoElement, zoom = 1, mirrored = false): File | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, MAX_CAPTURE_EDGE / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const sourceWidth = video.videoWidth / zoom;
  const sourceHeight = video.videoHeight / zoom;
  const sourceX = (video.videoWidth - sourceWidth) / 2;
  const sourceY = (video.videoHeight - sourceHeight) / 2;
  const context = canvas.getContext("2d");
  if (!context) return null;
  if (mirrored) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  const bytes = atob(dataUrl.split(",")[1]);
  const buf = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
  return new File([buf], `annet-${Date.now()}.jpg`, { type: "image/jpeg" });
}

type FacingMode = "environment" | "user";

export default function CameraCapture({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [facing, setFacing] = useState<FacingMode>("environment");
  const [zoom, setZoom] = useState(1);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const maxZoom = 3;
  const activeDeviceIdRef = useRef<string | null>(null);
  const capturingRef = useRef(false);

  const touchPoints = useRef(new Map<number, { x: number; y: number }>());
  const pinchStartDistance = useRef<number | null>(null);
  const pinchStartZoom = useRef(1);

  // ── Start stream with given facing mode ────────────────────────────────
  const startStream = useCallback(async (mode: FacingMode, deviceId?: string) => {
    // Stop any existing stream first
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera not supported in this browser.");
      return;
    }

    try {
      const videoConstraints: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: { exact: mode }, width: { ideal: 1280 }, height: { ideal: 720 } };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
      } catch {
        // Some laptop drivers do not expose facingMode. Keep a fallback for
        // those cameras while preserving exact front/back selection on phones.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      activeDeviceIdRef.current = track?.getSettings?.().deviceId ?? deviceId ?? null;
      const actualFacing = track?.getSettings?.().facingMode;
      setFacing(actualFacing === "user" || actualFacing === "environment" ? actualFacing : mode);
      setZoom(1);
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setError("Camera access was denied or is unavailable.");
    }
  }, []);

  useEffect(() => {
    startStream("environment");
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [startStream]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const flipCamera = useCallback(async () => {
    if (flipping) return;
    setFlipping(true);
    const next: FacingMode = facing === "environment" ? "user" : "environment";
    try {
      await startStream(next);
    } finally {
      setFlipping(false);
    }
  }, [facing, flipping, startStream]);

  const changeZoom = useCallback((nextZoom: number) => {
    const value = Math.max(1, Math.min(maxZoom, nextZoom));
    setZoom(value);
  }, [maxZoom]);

  const doCapture = useCallback(() => {
    if (!ready || capturingRef.current) return;
    capturingRef.current = true;
    const file = videoRef.current && makePhotoFile(videoRef.current, zoom, facing === "user");
    if (!file) { capturingRef.current = false; return; }
    setCapturedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    capturingRef.current = false;
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
  }, [ready, zoom]);

  const sendCaptured = useCallback(() => {
    if (!capturedFile) return;
    onCapture(capturedFile);
  }, [capturedFile, onCapture]);

  const retake = useCallback(() => {
    setCapturedFile(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, []);

  const onViewPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    touchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPoints.current.size === 2) {
      const points = [...touchPoints.current.values()];
      pinchStartDistance.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      pinchStartZoom.current = zoom;
    }
  }, [zoom]);

  const onViewPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !touchPoints.current.has(event.pointerId)) return;
    touchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPoints.current.size === 2 && pinchStartDistance.current) {
      const points = [...touchPoints.current.values()];
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      changeZoom(pinchStartZoom.current * (distance / pinchStartDistance.current));
    }
  }, [changeZoom]);

  const onViewPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    touchPoints.current.delete(event.pointerId);
    if (touchPoints.current.size < 2) pinchStartDistance.current = null;
  }, []);

  return (
    <div
      data-camera-overlay="true"
      className="fixed inset-0 z-[100] overflow-hidden bg-[#03090c] text-white touch-none select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Camera"
    >
      {/* Live viewfinder */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        onCanPlay={() => setReady(true)}
        onPointerDown={onViewPointerDown}
        onPointerMove={onViewPointerMove}
        onPointerUp={onViewPointerUp}
        onPointerCancel={(event) => { touchPoints.current.delete(event.pointerId); pinchStartDistance.current = null; }}
        className={`${capturedFile ? "hidden" : "h-full w-full object-cover"}`}
        style={{
          // Mirror front camera so it feels natural
          transform: `${facing === "user" ? "scaleX(-1)" : "none"} scale(${zoom})`,
          transition: "opacity 0.2s",
          opacity: flipping ? 0 : 1,
        }}
      />

      {capturedFile && previewUrl && (
        <img src={previewUrl} alt="Captured photo" className="h-full w-full object-contain bg-black" />
      )}

      {/* Shutter flash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-white transition-opacity duration-[180ms]"
        style={{ opacity: flash ? 0.75 : 0 }}
      />

      {/* Top hint */}
      <div className="camera-snap-ui pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="camera-snap-hint rounded-full px-3 py-1.5 text-xs">
          {error
            ? error
            : ready
              ? capturedFile ? "Ready to send" : "Capture a photo, then tap Send"
              : "Starting camera…"}
        </span>
      </div>

      {/* Desktop-only zoom slider; mobile keeps the preview clean and gesture-driven. */}
      <label data-cam-btn className="absolute bottom-[max(7rem,calc(env(safe-area-inset-bottom)+6rem))] left-4 z-20 hidden items-center gap-3 rounded-full border border-white/15 bg-[#071317]/75 px-4 py-2 text-[11px] text-primary backdrop-blur-xl sm:flex sm:left-8">
        <span>Zoom</span><input type="range" min="1" max={maxZoom} step="0.05" value={zoom} onChange={(event) => changeZoom(Number(event.target.value))} className="w-36 accent-primary" aria-label="Camera zoom" /><span className="w-10 text-right">{Math.round(zoom * 100)}%</span>
      </label>

      <div
        className="absolute bottom-[max(1.75rem,env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 items-center gap-3"
      >
        {!capturedFile ? <>
          <button type="button" data-cam-btn onClick={() => void flipCamera()} disabled={flipping || !!error} className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-black/55 text-primary shadow-lg backdrop-blur-xl disabled:opacity-50" aria-label="Switch camera"><RefreshCw className={flipping ? "animate-spin" : ""} /></button>
          <button type="button" data-cam-btn onClick={doCapture} disabled={!ready || !!error} className="camera-shutter flex h-16 w-16 items-center justify-center rounded-full text-white disabled:opacity-50" aria-label="Capture photo"><Camera className="h-7 w-7" /></button>
        </> : <>
          <button type="button" data-cam-btn onClick={retake} className="rounded-full border border-white/25 bg-black/55 px-4 py-3 text-sm text-white backdrop-blur-xl" aria-label="Retake photo">Retake</button>
          <button type="button" data-cam-btn onClick={sendCaptured} className="flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-black shadow-lg" aria-label="Send photo"><Send className="h-4 w-4" />Send</button>
        </>}
      </div>

      {/* Readiness pulse */}
      {!ready && !error && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-16 w-16 rounded-full border-2 border-white/30 animate-ping" />
        </div>
      )}
    </div>
  );
}
