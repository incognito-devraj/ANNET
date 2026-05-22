import { ReactNode, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, LogOut, Shield, Share2, Users } from "lucide-react";
import { ChatUser } from "@/types/chat";

type MemberPanelProps = {
  users: ChatUser[];
  currentName: string;
  open: boolean;
  mobile?: boolean;
  topOffsetClassName?: string;
  onClose?: () => void;
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

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 66% 44%)`;
}

function ActionButton({ label, ariaLabel, icon, onClick, tone = "default" }: ActionButtonProps) {
  const [rippleKey, setRippleKey] = useState(0);
  const toneClassName = tone === "danger"
    ? "text-[#d38b93] border-white/10"
    : "text-[#ece8dc] border-white/10";

  const handleClick = () => {
    setRippleKey((value) => value + 1);
    onClick();
  };

  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      onClick={handleClick}
      whileHover={{ y: -1, scale: 1.02 }}
      whileTap={{ scale: 0.94 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex min-w-[64px] flex-col items-center gap-2 outline-none"
    >
      <span
        className={`relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] lg:h-11 lg:w-11 lg:bg-white/[0.05] lg:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_20px_rgba(120,255,220,0.10)] ${toneClassName}`}
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
        className="h-[40px] w-auto max-w-[240px] object-contain object-left md:h-[40px] md:max-w-[240px]"
        draggable={false}
      />
    </motion.button>
  );
}

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
  const statusDotClassName = connected
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

        <div className="hidden h-full items-stretch lg:flex">
          <div className="flex shrink-0 items-start pl-3 pt-2">
            <AnnetBrandingButton open={sidebarOpen} onClick={onToggleMembers} />
          </div>

          <div className="mx-3 my-3 w-px self-stretch bg-white/10" />

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
              <span className={`h-2.5 w-2.5 rounded-full ${statusDotClassName}`} />
            </div>

            <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px] text-[#1a9e6e]">
              <Users className="h-3 w-3" />
              <span>{usersCount} {usersCount === 1 ? "member" : "members"}</span>
            </div>
          </button>

          <div className="mr-4 flex shrink-0 items-center gap-5">
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

        <div className="flex h-full items-start justify-between gap-2 px-3 pt-2 lg:hidden">
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
                className="h-[36px] w-auto max-w-[160px] object-contain object-left"
                draggable={false}
              />
            </motion.button>

            <button
              type="button"
              onClick={onToggleMembers}
              className="mt-0.75 min-w-0 max-w-full pl-1.5 text-left outline-none"
              aria-label={sidebarOpen ? "Close room members" : "Open room members"}
              aria-expanded={sidebarOpen}
            >
              <div className="flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap">
                <span className="shrink-0 font-mono text-[12px] text-[#f3efe4]">#</span>
                <span className="truncate font-mono text-[10px] font-light tracking-[0.02em] text-[#f3efe4] [text-shadow:0_0_10px_rgba(243,239,228,0.1)]">
                  {room}
                </span>
                <Users className="ml-3 h-3 w-3 shrink-0 text-[#1a9e6e]" />
                <span className="shrink-0 text-[10px] text-[#1a9e6e]">
                  {usersCount} {usersCount === 1 ? "member" : "members"}
                </span>
              </div>
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
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

export function MemberPanel({
  users,
  currentName,
  open,
  mobile = false,
  topOffsetClassName = "top-[72px]",
  onClose,
}: MemberPanelProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {mobile && (
            <motion.button
              type="button"
              aria-label="Close room members"
              className="fixed inset-0 z-40 bg-black/45 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.16 } }}
              exit={{ opacity: 0, transition: { duration: 0.14 } }}
              onClick={onClose}
            />
          )}

          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ x: "-100%", transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }}
            className={`fixed bottom-0 left-0 z-50 flex flex-col overflow-hidden border-r border-emerald-300/12 bg-[linear-gradient(180deg,#08111a_0%,#09131b_100%)] ${
              mobile ? `w-[min(17rem,calc(100vw-2.75rem))] ${topOffsetClassName} md:hidden` : `hidden w-[18rem] ${topOffsetClassName} md:flex`
            }`}
            style={{ willChange: "transform" }}
          >
            <div className="border-b border-emerald-300/10 px-3 py-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-emerald-100/58">
                relay members
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-emerald-100/72" />
                <span className="font-mono text-[13px] font-light tracking-[0.08em] text-emerald-50/88">
                  Online users
                </span>
                <span className="rounded-full border border-emerald-300/14 px-1.5 py-0.5 font-mono text-[10px] text-emerald-50/60">
                  {users.length}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin">
              {users.length === 0 && (
                <div className="rounded-2xl border border-emerald-300/8 bg-white/[0.015] px-3 py-5 text-center font-mono text-[11px] tracking-[0.12em] text-emerald-50/42">
                  Awaiting relay participants...
                </div>
              )}

              {users.map((u) => {
                const isMe = u.name === currentName;
                const avatarColor = colorFor(u.name);

                return (
                  <div
                    key={(u.id ?? "") + u.name}
                    className={`mb-2 flex items-center gap-2.5 rounded-[20px] border px-3 py-3 ${
                      isMe ? "border-emerald-300/14 bg-[#111923]" : "border-emerald-300/8 bg-[#0f1721]"
                    }`}
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-light text-white"
                      style={{ backgroundColor: avatarColor }}
                    >
                      {initials(u.name)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[12px] font-light uppercase tracking-[0.14em] text-emerald-50/88">
                        {u.name}
                        {isMe && <span className="ml-1.5 text-[9px] uppercase tracking-[0.18em] text-emerald-100/56">you</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] text-emerald-50/42">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                        active relay
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-emerald-300/10 p-2">
              <div className="flex items-center gap-2.5 rounded-[20px] border border-emerald-300/8 bg-[#0f1720] px-3 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/8 bg-white/[0.015]">
                  <Shield className="h-3.5 w-3.5 text-emerald-50/72" />
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.26em] text-emerald-50/54">
                    mask state
                  </div>
                  <div className="mt-1 font-mono text-[11px] font-light uppercase tracking-[0.08em] text-emerald-50/78">
                    anonymous relay stable
                  </div>
                </div>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
