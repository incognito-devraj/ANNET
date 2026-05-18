// Renders "X is typing…" inline with animated dots — no box/border.

export default function TypingIndicator({ typingUsers }: { typingUsers: string[] }) {
  if (typingUsers.length === 0) return null;

  let label: string;
  if (typingUsers.length === 1) {
    label = `${typingUsers[0]} is typing`;
  } else if (typingUsers.length === 2) {
    label = `${typingUsers[0]} and ${typingUsers[1]} are typing`;
  } else {
    label = `${typingUsers[0]}, ${typingUsers[1]} and ${typingUsers.length - 2} others are typing`;
  }

  return (
    <div className="px-5 pb-1 pt-0 flex items-center gap-1.5 h-5">
      <span className="text-[11px] font-mono text-primary/50 tracking-wide">{label}</span>
      <span className="flex gap-[3px] items-center mb-[1px]" aria-hidden="true">
        {[0, 160, 320].map((delay) => (
          <span
            key={delay}
            className="h-[3px] w-[3px] rounded-full bg-primary/50 animate-bounce"
            style={{ animationDelay: `${delay}ms`, animationDuration: "0.8s" }}
          />
        ))}
      </span>
    </div>
  );
}
