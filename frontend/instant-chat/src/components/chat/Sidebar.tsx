import { ChatUser } from "@/types/chat";
import { Users } from "lucide-react";

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

export default function Sidebar({ users, currentName }: Props) {
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-card/40 backdrop-blur">
      <div className="px-4 h-14 flex items-center gap-2 border-b border-border">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">
          Online <span className="text-muted-foreground">({users.length})</span>
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin py-2">
        {users.length === 0 && (
          <p className="text-xs text-muted-foreground text-center px-4 py-6">
            Waiting for users…
          </p>
        )}
        {users.map((u) => {
          const isMe = u.name === currentName;
          return (
            <div
              key={(u.id ?? "") + u.name}
              className={`mx-2 my-0.5 px-3 py-2 rounded-lg flex items-center gap-3 transition-colors ${
                isMe ? "bg-primary/15 border border-primary/30" : "hover:bg-secondary/60"
              }`}
            >
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                style={{ backgroundColor: colorFor(u.name) }}
              >
                {initials(u.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {u.name} {isMe && <span className="text-primary text-xs">(you)</span>}
                </div>
              </div>
              <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
            </div>
          );
        })}
      </div>
    </aside>
  );
}
