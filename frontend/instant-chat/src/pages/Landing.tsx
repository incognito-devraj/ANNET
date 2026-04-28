import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VenetianMask, Sparkles } from "lucide-react";

const VALID = /^[A-Za-z0-9_]{1,24}$/;

export default function Landing() {
  const navigate = useNavigate();
  const [room, setRoom] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!VALID.test(room)) {
      setError("Room: 1-24 chars, letters, numbers, underscores only.");
      return;
    }
    navigate(`/anonet/${encodeURIComponent(room)}`);
  };

  return (
    <div className="min-h-full flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8 select-none">
          <div className="h-14 w-14 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mb-4 shadow-[0_0_40px_-10px_hsl(var(--primary)/0.6)]">
            <VenetianMask className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            An<span className="text-primary">net</span>
          </h1>
          <p className="text-muted-foreground mt-2 text-sm flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Anonymous real-time chat. Zero login.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="bg-card/70 backdrop-blur border border-border rounded-2xl p-6 space-y-4 shadow-2xl"
        >
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Room</label>
            <Input
              autoFocus
              placeholder="e.g. lounge"
              value={room}
              maxLength={24}
              onChange={(e) => setRoom(e.target.value)}
              className="bg-secondary/60 border-border h-11"
            />
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full h-11 text-base font-semibold">
            Join Room
          </Button>

          <p className="text-xs text-muted-foreground text-center pt-1">
            Max 24 chars · letters, numbers, underscores
          </p>
        </form>
      </div>
    </div>
  );
}
