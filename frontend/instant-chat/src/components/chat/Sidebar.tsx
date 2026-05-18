import { ChatUser } from "@/types/chat";
import { Shield, Users } from "lucide-react";

type Props = {
  users: ChatUser[];
  currentName: string;
};

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 70% 45%)`;
}

// Exported so it can be reused inside the mobile Sheet drawer
export function SidebarContent({ users, currentName }: Props) {
  return (
    <>
      <div className="px-4 h-14 flex items-center gap-2 border-b border-white/[0.07] shrink-0">
        <Users className="h-3.5 w-3.5 text-primary/80" />
        <h2 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground/80">
          Online <span className="text-primary/70 ml-0.5">({users.length})</span>
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin py-2 px-2">
        {users.length === 0 && (
          <p className="text-xs text-muted-foreground/60 text-center px-4 py-8">
            Waiting for users…
          </p>
        )}
        {users.map((u) => {
          const isMe = u.name === currentName;
          return (
            <div
              key={(u.id ?? "") + u.name}
              className={`my-0.5 px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-150 ${
                isMe
                  ? "bg-primary/10 border border-primary/20 shadow-[0_0_12px_hsl(var(--primary)/0.08)]"
                  : "hover:bg-white/[0.05] border border-transparent"
              }`}
            >
              {/* Avatar */}
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 shadow-md"
                style={{
                  backgroundColor: colorFor(u.name),
                  boxShadow: isMe ? `0 0 10px ${colorFor(u.name)}55` : undefined,
                }}
              >
                {initials(u.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate leading-tight">
                  {u.name}
                  {isMe && <span className="text-primary/70 text-[10px] ml-1.5 font-normal">you</span>}
                </div>
              </div>
              {/* Online dot */}
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 shadow-[0_0_6px_hsl(var(--primary)/0.8)]" />
            </div>
          );
        })}
      </div>
      <div className="shrink-0 border-t border-white/[0.06] p-3">
        <div className="anonymous-panel rounded-2xl border border-red-500/20 p-3">
          <div className="flex items-center gap-3">
            <div className="hud-arc flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl">
              <div className="hud-arc-inner flex h-8 w-8 items-center justify-center rounded-full">
                <Shield className="h-4 w-4 text-red-300" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-[0.4em] text-red-300/70 mb-0.5">
                Anonymous
              </div>
              <div className="font-mono text-xs font-semibold text-red-100 leading-tight">
                YOU ARE ANONYMOUS
              </div>
              <div className="text-[10px] text-red-200/50 mt-0.5">
                masked relay active
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Desktop sidebar — hidden on mobile
export default function Sidebar({ users, currentName }: Props) {
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-white/[0.07] bg-black/20 backdrop-blur-xl">
      <SidebarContent users={users} currentName={currentName} />
    </aside>
  );
}
