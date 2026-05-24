import { ReactNode, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, LogOut, Share2, Shield, Users } from "lucide-react";
import { ChatUser } from "@/types/chat";

// ─── Types ────────────────────────────────────────────────────────────────────

type MemberPanelProps = {
  users: ChatUser[];
  currentName: string;
  open: boolean;
  onClose: () => void;
};

type BrandingButtonProps = {
  open: boolean;
  onClick: () => void;
};

type TopBarProps = {
  room: string;
  usersCount: number;
  connected: boolean;
  sidebarOpen: boolean;
  shareCopied: boolean;
  onToggleMembers: () => void;
  onShareInvite: () => void;
  onLeave: () => void;
};

type ActionButtonProps = {
  label: string;
  ariaLabel: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 66% 44%)`;
}

// ─── ActionButton ─────────────────────────────────────────────────────────────

function ActionButton({ label, ariaLabel, icon, onClick, tone = "default" }: ActionButtonProps) {
  const [rippleKey, setRippleKey] = useState(0);
  const toneClass = tone === "danger"
    ? "text-[#d38b93] border-white/10"
    : "text-[#ece8dc] border-white/10";

  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      onClick={() => { setRippleKey((k) => k + 1); onClick(); }}
      whileHover={{ y: -1, scale: 1.02 }}
      whileTap={{ scale: 0.94 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex min-w-[64px] flex-col items-center gap-2 outline-none"
    >
      <span
        className={`relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] lg:h-11 lg:w-11 lg:bg-white/[0.05] lg:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_20px_rgba(120,255,220,0.10)] ${toneClass}`}
      >
        <AnimatePresence mode="popLayout">
          <motion.span
            key={rippleKey}
            initial={{ scale: 0, opacity: 0.28 }}
            animate={{ scale: 2.6, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.42, ease: "easeOut" }}
            className={`absolute h-5 w-5 rounded-full ${tone === "danger" ? "bg-[#d38b93]/35" : "bg-[#1a9e6e]/28"}`}
          />
        </AnimatePresence>
        <span className="relative z-10 transition-transform duration-150 group-hover:scale-110">
          {icon}
        </span>
      </span>
      <span className={`text-[9px] leading-none tracking-[0.02em] lg:text-[10px] lg:tracking-[0.08em] ${tone === "danger" ? "text-[#e6b1b8]" : "text-[#d8d2c5]"}`}>
        {label}
      </span>
    </motion.button>
  );
}

// ─── AnnetBrandingButton ──────────────────────────────────────────────────────

export function AnnetBrandingButton({ open, onClick }: BrandingButtonProps) {
  return (
    <motion.button
      type="button"
      aria-label={open ? "Close room members" : "Open room members"}
      aria-expanded={open}
      onClick={onClick}
      whileHover={{ x: 1 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      className="inline-flex items-start pl-0 pr-2 pt-1 outline-none md:pt-0.5"
    >
      <img
        src="/final logo.webp"
        alt="ANNET"
        className="h-[40px] w-auto max-w-[240px] object-contain object-left md:h-[60px] md:max-w-[300px]"
        draggable={false}
      />
    </motion.button>
  );
}

// ─── ChatTopBar ───────────────────────────────────────────────────────────────
// Restored to original layout:
//   Desktop: logo left | room name centered | actions right
//   Mobile:  logo + room/count stacked left | actions right

export function ChatTopBar({
  room,
  usersCount,
  connected,
  sidebarOpen,
  shareCopied,
  onToggleMembers,
  onShareInvite,
  onLeave,
}: TopBarProps) {
  const statusDotClass = connected
    ? "bg-[#20c287] shadow-[0_0_14px_rgba(32,194,135,0.8)]"
    : "bg-[#d38b93] shadow-[0_0_14px_rgba(211,139,147,0.55)]";

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-20 px-1 pt-1 md:px-1 md:pt-1"
    >
      <div className="relative h-[68px] overflow-hidden rounded-[20px] border border-white/8 bg-[#0d0f12] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_10px_30px_rgba(0,0,0,0.3)]">
        <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/22 to-transparent" />

        {/* ── Desktop layout ── */}
        <div className="hidden h-full items-stretch lg:flex">
          <div className="flex shrink-0 items-start pl-1 pt-0.75">
            <AnnetBrandingButton open={sidebarOpen} onClick={onToggleMembers} />
          </div>

          <div className="mx-0 my-3 w-px self-stretch bg-white/10" />

          <button
            type="button"
            onClick={onToggleMembers}
            className="flex min-w-0 flex-1 flex-col items-center justify-center text-center outline-none"
            aria-label={sidebarOpen ? "Close room members" : "Open room members"}
            aria-expanded={sidebarOpen}
          >
            <div className="flex max-w-full items-center justify-center gap-2">
              <span className="font-mono text-[13px] text-[#f3efe4]">#</span>
              <span className="truncate font-mono text-[19px] font-light tracking-[0.04em] text-[#f3efe4] [text-shadow:0_0_14px_rgba(243,239,228,0.12)]">
                {room}
              </span>
              <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass}`} />
            </div>
            <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px] text-[#1a9e6e]">
              <Users className="h-3 w-3" />
              <span>{usersCount} {usersCount === 1 ? "member" : "members"}</span>
            </div>
          </button>

          <div className="mr-4 flex shrink-0 items-center gap-0 pt-2">
            <ActionButton
              label=""
              ariaLabel="Share room invite"
              icon={shareCopied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              onClick={onShareInvite}
            />
            <ActionButton
              label=""
              ariaLabel="Leave room"
              icon={<LogOut className="h-4 w-4" />}
              onClick={onLeave}
              tone="danger"
            />
          </div>
        </div>

        {/* ── Mobile layout ── */}
        <div className="flex h-full items-start justify-between gap-2 pl-0 pr-0 pt-0 lg:hidden">
          <div className="flex min-w-0 flex-1 flex-col items-start justify-start overflow-hidden">
            <motion.button
              type="button"
              aria-label={sidebarOpen ? "Close room members" : "Open room members"}
              aria-expanded={sidebarOpen}
              onClick={onToggleMembers}
              whileHover={{ x: 1 }}
              whileTap={{ scale: 0.985 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="inline-flex max-w-full items-start pl-0 pr-2 pt-0 outline-none"
            >
              <img
                src="/final logo.webp"
                alt="ANNET"
                className="h-[40px] w-auto max-w-[250px] object-contain object-left"
                draggable={false}
              />
            </motion.button>

            {/* Room name + count stays below logo on mobile */}
            <button
              type="button"
              onClick={onToggleMembers}
              className="mt-0.5 min-w-0 max-w-full pl-4 text-left outline-none"
              aria-label={sidebarOpen ? "Close room members" : "Open room members"}
              aria-expanded={sidebarOpen}
            >
              <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                <span className="shrink-0 font-mono text-[12px] text-[#f3efe4]">#</span>
                <span className="truncate font-mono text-[10px] font-light tracking-[0.02em] text-[#f3efe4]">
                  {room}
                </span>
                <Users className="ml-2 h-3 w-3 shrink-0 text-[#1a9e6e]" />
                <span className="shrink-0 text-[10px] text-[#1a9e6e]">
                  {usersCount} {usersCount === 1 ? "member" : "members"}
                </span>
              </div>
            </button>
          </div>

          <div className="flex shrink-0 items-centre gap-0 pt-3.5">
            <ActionButton
              label=""
              ariaLabel="Share room invite"
              icon={shareCopied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              onClick={onShareInvite}
            />
            <ActionButton
              label=""
              ariaLabel="Leave room"
              icon={<LogOut className="h-4 w-4" />}
              onClick={onLeave}
              tone="danger"
            />
          </div>
        </div>
      </div>
    </motion.header>
  );
}

// ─── MemberPanel ─────────────────────────────────────────────────────────────
// Floating rounded card anchored to the top-left, below the topbar.
// Clicking the backdrop (anywhere outside) dismisses it.
// Matches the ANNET dark theme with mask-style avatars and emerald accents.

export function MemberPanel({
  users,
  currentName,
  open,
  onClose,
}: MemberPanelProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Full-screen invisible backdrop — click anywhere to close */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Floating panel card */}
          <motion.aside
            key="panel"
            role="dialog"
            aria-label="Room members"
            initial={{ opacity: 0, scale: 0.94, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            // Anchored below topbar, left-aligned, stretches to bottom of screen
            // Width matches the logo's right edge (~160px logo + 12px left padding)
            // className="fixed bottom-[78px] left-2 top-[76px] z-50 flex w-[168px] flex-col overflow-hidden rounded-[22px] border border-white/[0.09] shadow-[0_24px_60px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.04)]"
            className="fixed bottom-[78px] left-2 top-[76px] z-50 flex w-[170px] md:w-[280px] lg:w-[260px] flex-col overflow-hidden rounded-[22px] border border-white/[0.09] shadow-[0_24px_60px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.04)]"
            style={{
              background: "linear-gradient(160deg, #0d1117 0%, #0a0e14 60%, #080c11 100%)",
              willChange: "transform, opacity",
            }}
            // Stop clicks inside the panel from hitting the backdrop
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top glow line */}
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />

            {/* ── Header ── */}
            <div className="border-b border-white/[0.06] px-4 pb-3 pt-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.38em] text-emerald-300/50">
                Room Members
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-emerald-300/60" />
                <span className="font-mono text-[10px] uppercase tracking-[0.038em] text-emerald-300/50">
                  Online users
                </span>
                <span className="ml-auto rounded-full border border-emerald-100/10 bg-emerald-400/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-emerald-300/70">
                  {users.length}
                </span>
              </div>
            </div>

            {/* ── User list ── */}
            <div
            className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
            >
              {users.length === 0 && (
                <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] px-3 py-6 text-center font-mono text-[10px] tracking-[0.14em] text-white/25">
                  Awaiting relay participants...
                </div>
              )}

              {users.map((u) => {
                const isMe = u.name === currentName;
                const avatarBg = colorFor(u.name);
                // Glow color matches avatar hue
                let h = 0;
                for (let i = 0; i < u.name.length; i++) h = (h * 31 + u.name.charCodeAt(i)) % 360;
                const glowColor = `hsla(${h}, 66%, 44%, 0.35)`;

                return (
                  <div
                    key={(u.id ?? "") + u.name}
                    className={`mb-1.5 flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors duration-150
                      ${isMe
                        ? "border-emerald-400/[0.2] bg-emerald-400/[0.05]"
                        : "border-white/[0.05] bg-white/[0.025] hover:bg-white/[0.04]"
                      }`}
                  >
                    {/* Avatar with colored glow — mask-icon style */}
                    <div className="relative shrink-0">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-2xl text-[14px] font-semibold text-white"
                        style={{
                          backgroundColor: avatarBg,
                          boxShadow: `0 0 14px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.15)`,
                        }}
                      >
                        {initials(u.name)}
                      </div>
                      {/* Online dot */}
                      <span
                        className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 bg-emerald-400"
                        style={{ borderColor: "#0a0e14" }}
                      />
                    </div>

                    {/* Name + status */}
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-mono text-[10px] font-light tracking-[0em] text-white/85">
                          {u.name}
                        </span>
                        {isMe && (
                          <span className="shrink-0 rounded bg-emerald-400/15 px-1 py-px font-mono text-[8px] uppercase tracking-[0.18em] text-emerald-300/70">
                            you
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 font-mono text-[9px] tracking-[0.08em] text-white/30">
                        <span className="h-1 w-1 rounded-full bg-emerald-400/70" />
                        Active 
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Footer: mask state ── */}
            <div className="mt-auto border-t border-white/[0.06] p-3">
              <div className="flex items-center gap-3 rounded-2xl border border-white/[0.25] bg-red/[0.02] px-1 py-1">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-400/[0.12] bg-emerald-400/[0.06]">
                  <Shield className="h-8 w-8 text-emerald-300/70" />
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0em] text-white/35">
                    Mask State
                  </p>
                  <p className="mt-0.5 pr-0.5 font-sans text-[8px] font-light uppercase tracking-[0.2em] text-white/65">
                   Anonymous    
                  </p>
                </div>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
