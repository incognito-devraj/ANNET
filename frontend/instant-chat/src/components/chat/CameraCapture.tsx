import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, RefreshCw } from "lucide-react";

type Props = {
  onCapture: (file: File) => void;
  onClose: () => void;
};

const MAX_CAPTURE_EDGE = 1600;
// Pointer must drift less than this to count as a tap on the viewfinder
const TAP_THRESHOLD_PX = 12;
// Swipe button must travel this far vertically to flip camera
const FLIP_THRESHOLD_PX = 48;

function makePhotoFile(video: HTMLVideoElement): File | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, MAX_CAPTURE_EDGE / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  const bytes = atob(dataUrl.split(",")[1]);
  const buf = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
  return new File([buf], `annet-${Date.now()}.jpg`, { type: "image/jpeg" });
}

type FacingMode = "environment" | "user";

export default function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [facing, setFacing] = useState<FacingMode>("environment");
  const capturingRef = useRef(false);

  // Viewfinder tap tracking
  const viewDownPos = useRef<{ x: number; y: number } | null>(null);

  // Swipe button drag tracking
  const [swipeDy, setSwipeDy] = useState(0);
  const swipeDownY = useRef<number | null>(null);
  const swipeDyRef = useRef(0);

  // ── Start stream with given facing mode ────────────────────────────────
  const startStream = useCallback(async (mode: FacingMode) => {
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
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
    setFacing(next);
    await startStream(next);
    setFlipping(false);
  }, [facing, flipping, startStream]);

  const doCapture = useCallback(() => {
    if (!ready || capturingRef.current) return;
    capturingRef.current = true;
    const file = videoRef.current && makePhotoFile(videoRef.current);
    if (!file) { capturingRef.current = false; return; }
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    setTimeout(() => onCapture(file), 120);
  }, [ready, onCapture]);

  // ── Viewfinder: record down, capture on up if small drift ──────────────
  const onViewDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-cam-btn]")) return;
    viewDownPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onViewUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-cam-btn]")) return;
    const down = viewDownPos.current;
    viewDownPos.current = null;
    if (!down) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) <= TAP_THRESHOLD_PX) {
      doCapture();
    }
  }, [doCapture]);

  const onViewCancel = useCallback(() => { viewDownPos.current = null; }, []);

  // ── Swipe button: drag to flip, tap to capture ─────────────────────────
  const onBtnDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    swipeDownY.current = e.clientY;
    swipeDyRef.current = 0;
    setSwipeDy(0);
  };

  const onBtnMove = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (swipeDownY.current === null) return;
    const dy = e.clientY - swipeDownY.current;
    swipeDyRef.current = dy;
    setSwipeDy(dy);
  };

  const onBtnUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const dy = swipeDyRef.current;
    swipeDownY.current = null;
    swipeDyRef.current = 0;
    setSwipeDy(0);

    if (Math.abs(dy) >= FLIP_THRESHOLD_PX) {
      // Swiped far enough → flip camera
      void flipCamera();
    } else {
      // Short tap → capture
      doCapture();
    }
  };

  const onBtnCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    swipeDownY.current = null;
    swipeDyRef.current = 0;
    setSwipeDy(0);
  };

  const clampedDy = Math.max(-72, Math.min(72, swipeDy));
  const isDragging = swipeDownY.current !== null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black touch-none select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Camera"
      onPointerDown={onViewDown}
      onPointerUp={onViewUp}
      onPointerCancel={onViewCancel}
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
          transform: facing === "user" ? "scaleX(-1)" : "none",
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

      {/* Top hint */}
      <div className="camera-snap-ui pointer-events-none absolute inset-x-0 top-0 flex items-center p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="camera-snap-hint rounded-full px-3 py-1.5 text-xs">
          {error
            ? error
            : ready
              ? "Tap to capture · swipe button to flip camera"
              : "Starting camera…"}
        </span>
      </div>

      {/*
        Bottom button — dual purpose:
          Tap  → capture photo
          Swipe up or down ≥ 48px → flip front/back camera
        The button visually follows the finger for tactile feedback.
      */}
      <div
        data-cam-btn
        onPointerDown={onBtnDown}
        onPointerMove={onBtnMove}
        onPointerUp={onBtnUp}
        onPointerCancel={onBtnCancel}
        className="absolute left-1/2 flex flex-col items-center gap-1.5 cursor-pointer z-10"
        style={{
          bottom: "max(1.75rem, env(safe-area-inset-bottom))",
          transform: `translateX(-50%) translateY(${clampedDy}px)`,
          transition: isDragging ? "none" : "transform 0.22s ease",
        }}
        aria-label="Tap to capture or swipe to flip camera"
      >
        {/* Drag handle pill */}
        <div className="w-8 h-1 rounded-full bg-white/35" aria-hidden />

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

        <span className="text-[10px] text-white/35 tracking-wide pointer-events-none">
          {flipping ? "switching…" : facing === "user" ? "front cam" : "swipe to flip"}
        </span>
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
