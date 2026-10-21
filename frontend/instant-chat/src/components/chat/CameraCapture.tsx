import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, RefreshCw } from "lucide-react";

type Props = {
  onCapture: (file: File) => void;
};

const MAX_CAPTURE_EDGE = 1600;
// Pointer must drift less than this to count as a tap on the viewfinder
const TAP_THRESHOLD_PX = 12;

function makePhotoFile(video: HTMLVideoElement, zoom = 1): File | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, MAX_CAPTURE_EDGE / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const sourceWidth = video.videoWidth / zoom;
  const sourceHeight = video.videoHeight / zoom;
  const sourceX = (video.videoWidth - sourceWidth) / 2;
  const sourceY = (video.videoHeight - sourceHeight) / 2;
  canvas.getContext("2d")?.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
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
  const maxZoom = 3;
  const activeDeviceIdRef = useRef<string | null>(null);
  const capturingRef = useRef(false);

  // Viewfinder tap tracking
  const viewDownPos = useRef<{ x: number; y: number } | null>(null);
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
        : { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } };
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      activeDeviceIdRef.current = track?.getSettings?.().deviceId ?? deviceId ?? null;
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

  const flipCamera = useCallback(async () => {
    if (flipping) return;
    setFlipping(true);
    const next: FacingMode = facing === "environment" ? "user" : "environment";
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === "videoinput");
      const nextDevice = devices.find((device) => device.deviceId !== activeDeviceIdRef.current);
      await startStream(next, nextDevice?.deviceId);
      setFacing(next);
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
    const file = videoRef.current && makePhotoFile(videoRef.current, zoom);
    if (!file) { capturingRef.current = false; return; }
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    setTimeout(() => onCapture(file), 120);
  }, [ready, onCapture, zoom]);

  // ── Viewfinder: record down, capture on up if small drift ──────────────
  const onViewDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-cam-btn]")) return;
    viewDownPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onViewUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-cam-btn]")) return;
    if (pinchStartDistance.current !== null) {
      viewDownPos.current = null;
      return;
    }
    const down = viewDownPos.current;
    viewDownPos.current = null;
    if (!down) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) <= TAP_THRESHOLD_PX) {
      doCapture();
    }
  }, [doCapture]);

  const onViewCancel = useCallback(() => { viewDownPos.current = null; }, []);

  const onViewPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    onViewDown(event);
    if (event.pointerType !== "touch") return;
    touchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPoints.current.size === 2) {
      const points = [...touchPoints.current.values()];
      pinchStartDistance.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      pinchStartZoom.current = zoom;
    }
  }, [onViewDown, zoom]);

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
    onViewUp(event);
    touchPoints.current.delete(event.pointerId);
    if (touchPoints.current.size < 2) pinchStartDistance.current = null;
  }, [onViewUp]);

  return (
    <div
      data-camera-overlay="true"
      className="fixed inset-0 z-[100] overflow-hidden bg-[#03090c] text-white touch-none select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Camera"
      onPointerDown={onViewPointerDown}
      onPointerMove={onViewPointerMove}
      onPointerUp={onViewPointerUp}
      onPointerCancel={(event) => { onViewCancel(); touchPoints.current.delete(event.pointerId); pinchStartDistance.current = null; }}
    >
      {/* Live viewfinder */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        onCanPlay={() => setReady(true)}
        className="h-full w-full object-cover"
        style={{
          // Mirror front camera so it feels natural
          transform: `${facing === "user" ? "scaleX(-1)" : "none"} scale(${zoom})`,
          transition: "opacity 0.2s",
          opacity: flipping ? 0 : 1,
        }}
      />

      {/* Shutter flash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-white transition-opacity duration-[180ms]"
        style={{ opacity: flash ? 0.75 : 0 }}
      />

      {/* ANNET camera header and dedicated camera switch */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-end gap-3 bg-gradient-to-b from-black/75 to-transparent px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
        <div className="flex items-center gap-2">
          <button type="button" data-cam-btn onClick={() => void flipCamera()} disabled={flipping || !!error} className="flex h-10 items-center gap-2 rounded-full border border-primary/30 bg-[#071317]/75 px-3 text-xs font-medium text-primary shadow-[0_0_22px_rgba(0,220,190,.12)] backdrop-blur-xl transition-colors hover:bg-primary/15 disabled:opacity-50" aria-label="Switch camera"><RefreshCw className={`h-4 w-4 ${flipping ? "animate-spin" : ""}`} /><span className="hidden sm:inline">Switch camera</span></button>
        </div>
      </div>

      {/* Top hint */}
      <div className="camera-snap-ui pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="camera-snap-hint rounded-full px-3 py-1.5 text-xs">
          {error
            ? error
            : ready
              ? "Tap anywhere to click and send"
              : "Starting camera…"}
        </span>
      </div>

      {/* Desktop-only zoom slider; mobile keeps the preview clean and gesture-driven. */}
      <label data-cam-btn className="absolute bottom-[max(7rem,calc(env(safe-area-inset-bottom)+6rem))] left-4 z-20 hidden items-center gap-3 rounded-full border border-white/15 bg-[#071317]/75 px-4 py-2 text-[11px] text-primary backdrop-blur-xl sm:flex sm:left-8">
        <span>Zoom</span><input type="range" min="1" max={maxZoom} step="0.05" value={zoom} onChange={(event) => changeZoom(Number(event.target.value))} className="w-36 accent-primary" aria-label="Camera zoom" /><span className="w-10 text-right">{Math.round(zoom * 100)}%</span>
      </label>

      <div
        data-cam-btn
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => { event.stopPropagation(); doCapture(); }}
        className="absolute left-1/2 z-10 flex -translate-x-1/2 cursor-pointer flex-col items-center gap-1.5"
        style={{ bottom: "max(1.75rem, env(safe-area-inset-bottom))" }}
        aria-label="Tap to capture and send"
      >
        {/* Camera ring */}
        {error ? (
          <span className="text-sm text-red-300 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2">
            {error}
          </span>
        ) : (
          <div className="camera-shutter relative flex items-center justify-center rounded-full p-4 text-white" aria-hidden>
            <Camera className="h-7 w-7" />
            {/* Flip indicator — small icon overlaid when front camera active */}
            {facing === "user" && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary/80 text-black">
                <RefreshCw className="h-2.5 w-2.5" />
              </span>
            )}
          </div>
        )}

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
