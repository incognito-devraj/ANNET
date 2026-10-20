import { useState, FormEvent, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const VALID = /^[A-Za-z0-9_]{1,24}$/;
const LOGO  = "/assets/logo.webp";
const BG    = "/assets/Cinematic Blue Earth Horizon.webp";

export default function Landing() {
  const navigate = useNavigate();
  const [room,      setRoom]      = useState("");
  const [nick,      setNick]      = useState("");
  const [showNick,  setShowNick]  = useState(false);
  const [roomErr,   setRoomErr]   = useState<string | null>(null);
  const [nickErr,   setNickErr]   = useState<string | null>(null);
  const [logoReady, setLogoReady] = useState(false);
  const [bgReady,   setBgReady]   = useState(false);
  const [slowConn,  setSlowConn]  = useState(false);
  const nickRef = useRef<HTMLInputElement>(null);

  // Detect slow connection — if logo hasn't loaded in 2.5s, show placeholders
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!logoReady) setSlowConn(true);
    }, 2500);
    return () => window.clearTimeout(t);
  }, [logoReady]);

  useEffect(() => { if (showNick) nickRef.current?.focus(); }, [showNick]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setRoomErr(null); setNickErr(null);
    let ok = true;
    if (!VALID.test(room)) { setRoomErr("1–24 chars · letters, numbers, underscores only."); ok = false; }
    const trimNick = nick.trim();
    if (trimNick && !VALID.test(trimNick)) { setNickErr("1–24 chars · letters, numbers, underscores only."); ok = false; }
    if (!ok) return;
    sessionStorage.setItem("annet_pending_nick", trimNick);
    navigate(`/${encodeURIComponent(room)}`);
  };

  return (
    <>
      {/* Scoped CSS — only affects .lp-* classes, doesn't touch globals */}
      <style>{CSS}</style>

      {/* Root: fixed, covers full viewport, no scroll */}
      <div className="lp-root">

        {/* Layer 0 — earth photo */}
        <div className="lp-bg" style={{ opacity: bgReady ? 0.55 : 0, transition: "opacity 0.6s ease" }} />

        {/* Layer 1 — atmospheric glow overlay */}
        <div className="lp-glow" />

        {/* Preload BG silently */}
        <img src={BG} alt="" style={{ display: "none" }} onLoad={() => setBgReady(true)} />

        {/* Layer 2 — horizon strip at bottom */}
        <div className="lp-horizon" aria-hidden>
          <img src={BG} alt="" draggable={false} style={{ opacity: bgReady ? 0.88 : 0, transition: "opacity 0.6s ease" }} />
        </div>

        {/* Layer 3 — content */}
        <div className="lp-col">

          {/* Single combined logo — placeholder shown on slow connection */}
          {slowConn && !logoReady ? (
            <div className="lp-logo-placeholder">
              <span className="lp-logo-ph-mask">⬡</span>
              <span className="lp-logo-ph-text">ANNET</span>
            </div>
          ) : (
            <img
              src={LOGO} alt="ANNET" className="lp-logo" draggable={false}
              onLoad={() => { setLogoReady(true); setSlowConn(false); }}
              style={{ opacity: logoReady ? 1 : 0, transition: "opacity 0.5s ease" }}
            />
          )}

          <p className="lp-tagline">No account. No tracking. Just conversation.</p>

          <form onSubmit={onSubmit} className="lp-card" noValidate>

            {/* Room */}
            <div className="lp-field">
              <label className="lp-label" htmlFor="lp-room">Room name</label>
              <div className="lp-row">
                <span className="lp-hash" aria-hidden>#</span>
                <input
                  id="lp-room" className={`lp-input${roomErr ? " lp-err-border" : ""}`}
                  type="text" autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false}
                  placeholder="e.g. lounge" value={room} maxLength={24}
                  onChange={(e) => { setRoom(e.target.value); setRoomErr(null); }}
                  onFocus={(e) => onFocus(e.currentTarget, !!roomErr)}
                  onBlur={(e)  => onBlur(e.currentTarget,  !!roomErr)}
                />
              </div>
              {roomErr && <p className="lp-errtxt">{roomErr}</p>}
            </div>

            {/* Nickname */}
            {!showNick ? (
              <button type="button" className="lp-nick-btn" onClick={() => setShowNick(true)}>
                <PersonIcon />
                Set a nickname <span className="lp-opt">(optional)</span>
              </button>
            ) : (
              <div className="lp-field">
                <label className="lp-label" htmlFor="lp-nick">
                  Your nickname
                  <button type="button" className="lp-clear"
                    onClick={() => { setNick(""); setNickErr(null); setShowNick(false); }}
                    aria-label="Remove nickname">✕</button>
                </label>
                <div className="lp-row">
                  <PersonIcon cls="lp-person-abs" />
                  <input
                    id="lp-nick" ref={nickRef}
                    className={`lp-input${nickErr ? " lp-err-border" : ""}`}
                    type="text" autoComplete="off" autoCapitalize="none" spellCheck={false}
                    placeholder="e.g. shadow_42" value={nick} maxLength={24}
                    onChange={(e) => { setNick(e.target.value); setNickErr(null); }}
                    onFocus={(e) => onFocus(e.currentTarget, !!nickErr)}
                    onBlur={(e)  => onBlur(e.currentTarget,  !!nickErr)}
                  />
                </div>
                {nickErr && <p className="lp-errtxt">{nickErr}</p>}
              </div>
            )}

            <button type="submit" className="lp-join">Join anonymously →</button>
            <p className="lp-helper">Up to 24 characters · letters, numbers, underscores</p>
          </form>

          <footer className="lp-footer">
            <span className="lp-rule" />
            <span className="lp-ftxt">Private by design · Leave anytime</span>
            <span className="lp-rule" />
          </footer>
        </div>
      </div>
    </>
  );
}

function PersonIcon({ cls = "" }: { cls?: string }) {
  return (
    <svg className={`lp-person ${cls}`} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  );
}

function onFocus(el: HTMLInputElement, hasErr: boolean) {
  el.style.borderColor = hasErr ? "#ff4d6d" : "#00d4ff";
  el.style.boxShadow   = hasErr
    ? "0 0 0 2px rgba(255,77,109,.20)"
    : "0 0 0 2px rgba(0,212,255,.18), inset 0 0 12px rgba(0,212,255,.06)";
}
function onBlur(el: HTMLInputElement, hasErr: boolean) {
  el.style.borderColor = hasErr ? "#ff4d6d" : "rgba(0,180,220,.25)";
  el.style.boxShadow   = "inset 0 1px 3px rgba(0,0,0,.35)";
}

/* ─────────────────────────────────────────────────────────────────────────────
   All CSS is scoped to .lp-* so it cannot conflict with global Tailwind styles.
   The root is position:fixed so it never adds scroll to the page.
───────────────────────────────────────────────────────────────────────────── */
const CSS = `
  /* ── Root: fixed, full viewport, no scroll ever ── */
  .lp-root {
    position: fixed; inset: 0; z-index: 0;
    background: #020912;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }

  /* ── Earth background photo ── */
  .lp-bg {
    position: absolute; inset: 0; z-index: 0;
    background-image: url("${BG}");
    background-size: cover;
    background-position: center bottom;
    background-repeat: no-repeat;
    opacity: .55;
  }

  /* ── Atmospheric glow ── */
  .lp-glow {
    position: absolute; inset: 0; z-index: 1; pointer-events: none;
    background:
      radial-gradient(ellipse 90% 60% at 50% 0%,   rgba(0,120,200,.18) 0%, transparent 65%),
      radial-gradient(ellipse 70% 45% at 50% 110%, rgba(0,140,255,.14) 0%, transparent 60%),
      radial-gradient(ellipse 110% 85% at 50% 50%, rgba(0,15,45,.50)   0%, transparent 78%);
  }

  /* ── Horizon strip: bottom 22% ── */
  .lp-horizon {
    position: absolute; bottom: 0; left: 0; right: 0;
    z-index: 2; height: 22vh; overflow: hidden; pointer-events: none;
  }
  .lp-horizon img {
    width: 100%; height: 100%;
    object-fit: cover; object-position: center top;
    mix-blend-mode: screen; opacity: .88;
    display: block;
  }

  /* ── Content column ── */
  .lp-col {
    position: relative; z-index: 3;
    width: 100%; max-width: 420px;
    padding: 0 20px;
    display: flex; flex-direction: column; align-items: center;
    /* vertically center but shift up slightly so horizon stays visible */
    margin-bottom: 10vh;
  }

  /* ── Logo placeholder (slow connection) ── */
  .lp-logo-placeholder {
    width: clamp(220px, 60vw, 340px);
    height: clamp(80px, 20vw, 120px);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 6px;
    margin-bottom: 6px;
    animation: lp-pulse 1.6s ease-in-out infinite;
  }
  .lp-logo-ph-mask {
    font-size: clamp(32px, 10vw, 52px);
    color: rgba(0,190,230,.35);
    line-height: 1;
  }
  .lp-logo-ph-text {
    font-size: clamp(20px, 7vw, 34px);
    font-weight: 800; letter-spacing: .25em;
    color: rgba(0,190,230,.30);
    font-family: inherit;
  }
  @keyframes lp-pulse {
    0%, 100% { opacity: .4; }
    50%       { opacity: .75; }
  }

  /* ── Logo ── */
  .lp-logo {
    width: clamp(220px, 60vw, 340px);
    height: auto; object-fit: contain;
    mix-blend-mode: screen;
    filter: drop-shadow(0 0 28px rgba(0,190,255,.40));
    user-select: none; flex-shrink: 0;
    margin-bottom: 6px;
    display: block;
  }

  /* ── Tagline ── */
  .lp-tagline {
    margin: 0 0 14px; padding: 0;
    font-size: clamp(11.5px, 2.8vw, 13.5px);
    color: rgba(175,210,230,.68);
    text-align: center; letter-spacing: .01em; line-height: 1.45;
  }

  /* ── Glass card ── */
  .lp-card {
    width: 100%;
    background: rgba(4,16,34,.80);
    border: 1px solid rgba(0,155,215,.32);
    border-radius: 16px;
    backdrop-filter: blur(22px);
    -webkit-backdrop-filter: blur(22px);
    padding: 20px 20px 14px;
    box-shadow: 0 0 0 1px rgba(0,180,255,.05) inset, 0 10px 44px rgba(0,0,0,.60);
    display: flex; flex-direction: column; gap: 12px;
  }

  .lp-field { display: flex; flex-direction: column; gap: 6px; }

  .lp-label {
    display: flex; align-items: center; gap: 6px;
    font-size: 12.5px; font-weight: 500;
    color: rgba(185,218,238,.80); letter-spacing: .02em;
    margin: 0;
  }

  .lp-row { position: relative; display: flex; align-items: center; }

  .lp-hash {
    position: absolute; left: 13px;
    font-size: 16px; font-weight: 700;
    color: rgba(0,195,235,.65);
    pointer-events: none; user-select: none; line-height: 1;
  }

  /* person icon inside nick toggle button (inline) */
  .lp-person {
    width: 16px; height: 16px; flex-shrink: 0;
    color: rgba(0,190,230,.65);
  }
  /* person icon absolutely positioned inside input row */
  .lp-person.lp-person-abs {
    position: absolute; left: 12px;
    pointer-events: none;
  }

  /* 16px prevents iOS auto-zoom on focus */
  .lp-input {
    width: 100%; height: 46px;
    padding: 0 12px 0 38px;
    background: rgba(3,12,26,.82);
    border: 1px solid rgba(0,180,220,.25);
    border-radius: 9px;
    color: rgba(218,238,252,.92);
    font-size: 16px; outline: none;
    box-shadow: inset 0 1px 3px rgba(0,0,0,.38);
    transition: border-color .18s, box-shadow .18s;
    font-family: inherit; box-sizing: border-box;
    -webkit-appearance: none;
  }
  .lp-input.lp-err-border { border-color: #ff4d6d; }
  .lp-errtxt { margin: 0; font-size: 11.5px; color: #ff7090; line-height: 1.3; }

  /* ── Nickname toggle ── */
  .lp-nick-btn {
    display: flex; align-items: center; gap: 8px;
    background: transparent;
    border: 1px dashed rgba(0,150,200,.28);
    border-radius: 9px; padding: 9px 14px;
    color: rgba(0,190,230,.72);
    font-size: 13.5px; font-weight: 500;
    cursor: pointer; font-family: inherit; letter-spacing: .02em;
    transition: color .16s, border-color .16s;
    width: 100%; text-align: left;
  }
  .lp-nick-btn:hover { color: rgba(0,220,255,.95); border-color: rgba(0,180,220,.50); }
  .lp-opt { font-size: 11.5px; opacity: .52; margin-left: 2px; }

  .lp-clear {
    margin-left: auto; background: transparent; border: none;
    color: rgba(150,185,210,.45); cursor: pointer;
    font-size: 13px; padding: 0 2px; line-height: 1; font-family: inherit;
  }

  /* ── Join button ── */
  .lp-join {
    width: 100%; height: 50px;
    background: linear-gradient(90deg, #00b8d9 0%, #00e5ff 50%, #00b8d9 100%);
    border: none; border-radius: 10px;
    color: #011320; font-size: 15.5px; font-weight: 700;
    letter-spacing: .04em; cursor: pointer;
    box-shadow: 0 0 22px rgba(0,210,255,.34), 0 2px 10px rgba(0,0,0,.45);
    transition: filter .16s; font-family: inherit; margin-top: 2px;
  }
  .lp-join:hover { filter: brightness(1.11); }

  .lp-helper {
    margin: 0; font-size: 11.5px;
    color: rgba(140,180,210,.46);
    text-align: center; margin-top: -3px; padding: 0;
  }

  /* ── Footer ── */
  .lp-footer {
    display: flex; align-items: center;
    gap: 10px; margin-top: 12px; width: 100%;
    padding: 0;
  }
  .lp-rule { flex: 1; height: 1px; background: rgba(0,160,220,.18); display: block; }
  .lp-ftxt {
    font-size: 11.5px; color: rgba(130,175,205,.46);
    white-space: nowrap; letter-spacing: .02em;
  }

  /* ═══════════════════════════════
     RESPONSIVE BREAKPOINTS
  ═══════════════════════════════ */

  /* Tablet / wide desktop */
  @media (min-width: 600px) {
    .lp-col  { max-width: 460px; }
    .lp-logo { width: clamp(280px, 42vw, 380px); }
    .lp-card { padding: 22px 24px 16px; }
    .lp-join { height: 52px; font-size: 16px; }
  }

  /* Short screens: landscape phones, small laptops */
  @media (max-height: 680px) {
    .lp-col     { margin-bottom: 8vh; }
    .lp-logo    { width: clamp(130px, 30vw, 200px); margin-bottom: 2px; }
    .lp-tagline { font-size: 11px; margin-bottom: 8px; }
    .lp-card    { padding: 13px 16px 10px; gap: 9px; }
    .lp-input   { height: 40px; }
    .lp-join    { height: 42px; font-size: 14px; }
    .lp-footer  { margin-top: 8px; }
    .lp-horizon { height: 15vh; }
  }

  /* Very short (landscape on small phone) */
  @media (max-height: 500px) {
    .lp-col     { margin-bottom: 4vh; }
    .lp-logo    { width: clamp(100px, 22vw, 160px); }
    .lp-tagline { display: none; }
    .lp-horizon { height: 10vh; }
  }

  /* Narrow phones */
  @media (max-width: 380px) {
    .lp-col  { padding: 0 14px; }
    .lp-logo { width: 86vw; }
    .lp-card { padding: 15px 14px 12px; border-radius: 13px; }
  }
`;
