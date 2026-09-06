import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, X } from "lucide-react";

type Props = {
  onCapture: (file: File) => void;
  onClose: () => void;
};

const MAX_CAPTURE_EDGE = 1600;

function makePhotoFile(video: HTMLVideoElement): File | null {
  if (!video.videoWidth || !video.videoHeight) return null;

  const scale = Math.min(1, MAX_CAPTURE_EDGE / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  const bytes = atob(dataUrl.split(",")[1]);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  return new File([buffer], `annet-${Date.now()}.jpg`, { type: "image/jpeg" });
}

export default function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Flash overlay state: "idle" | "flashing"
  const [flash, setFlash] = useState(false);
  // Prevent double-firing on the same pointer event
  const capturingRef = useRef(false);

  useEffect(() => {
    let active = true;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera is not supported in this browser.");
      return () => { active = false; };
    }

    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    }).then((stream) => {
      if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    }).catch(() => {
      if (active) setError("Camera access was denied or is unavailable.");
    });

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Lock scroll/overscroll while camera is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const doCapture = useCallback(() => {
    if (!ready || capturingRef.current) return;
    capturingRef.current = true;

    const file = videoRef.current && makePhotoFile(videoRef.current);
    if (!file) { capturingRef.current = false; return; }

    // White flash confirmation
    setFlash(true);
    setTimeout(() => setFlash(false), 180);

    // Short delay so the flash is visible before the overlay unmounts
    setTimeout(() => {
      onCapture(file);
    }, 120);
  }, [ready, onCapture]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Only block capture for the close button
    if (target.closest("[data-camera-close]")) return;
    e.preventDefault();
    doCapture();
  }, [doCapture]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black touch-none select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Camera — tap anywhere to capture"
      onPointerDown={handlePointerDown}
    >
      {/* Live viewfinder */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        onCanPlay={() => setReady(true)}
        className="h-full w-full object-cover"
        style={{ display: "block" }}
      />

      {/* Shutter flash overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-white transition-opacity duration-[180ms]"
        style={{ opacity: flash ? 0.75 : 0 }}
      />

      {/* Top bar — hint + close */}
      <div className="camera-snap-ui pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="camera-snap-hint rounded-full px-3 py-1.5 text-xs pointer-events-none">
          {error ? error : ready ? "Tap anywhere to capture & send" : "Starting camera…"}
        </span>
        <button
          type="button"
          data-camera-close
          onPointerDown={(e) => { e.stopPropagation(); onClose(); }}
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm border border-white/10 hover:bg-black/70 transition-colors"
          aria-label="Close camera"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Bottom shutter ring — visual affordance only, tapping it also captures */}
      <div className="pointer-events-none absolute bottom-[max(2rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2">
        {error ? (
          <span className="text-sm text-red-300 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2">{error}</span>
        ) : (
          <div
            className="camera-shutter flex items-center justify-center rounded-full p-4 text-white"
            aria-hidden
          >
            <Camera className="h-7 w-7" />
          </div>
        )}
      </div>

      {/* Readiness pulse — subtle ring that pulses until camera is ready */}
      {!ready && !error && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="h-16 w-16 rounded-full border-2 border-white/30 animate-ping" />
        </div>
      )}
    </div>
  );
}
