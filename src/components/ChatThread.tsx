import { useEffect, useRef, useState } from "react";
import { useChat } from "@/hooks/useChat";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatThreadProps {
  trainerId: string;
  athleteId: string;
  /** Naslov u headeru ako se prikazuje samostalno; ako je null, header se ne renderuje. */
  title?: string;
  subtitle?: string;
  /** Gornji header je opcioni; obično ga roditelj već renderuje. */
  showHeader?: boolean;
  className?: string;
}

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString("sr-Latn-RS", { hour: "2-digit", minute: "2-digit" });
};

const sameDay = (a: string, b: string) =>
  new Date(a).toDateString() === new Date(b).toDateString();

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Danas";
  if (d.toDateString() === y.toDateString()) return "Juče";
  return d.toLocaleDateString("sr-Latn-RS", { day: "2-digit", month: "long" });
};

export const ChatThread = ({
  trainerId,
  athleteId,
  title,
  subtitle,
  showHeader = false,
  className,
}: ChatThreadProps) => {
  const { user } = useAuth();
  const { messages, loading, sending, send, markRead } = useChat({ trainerId, athleteId });
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Mark read on open + every time messages arrive
  useEffect(() => {
    if (!loading) markRead();
  }, [loading, messages.length, markRead]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const r = await send(text);
    if (r.error) setDraft(text); // restore na grešci
  };

  return (
    <div className={cn("flex flex-col h-full min-h-0", className)}>
      {showHeader && (title || subtitle) && (
        <div className="px-4 py-3 border-b border-hairline">
          {title && <div className="font-semibold tracking-tight text-[15px]">{title}</div>}
          {subtitle && <div className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</div>}
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-2"
      >
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-[13px] text-muted-foreground py-10 px-6">
            Još nema poruka. Pošalji prvu — pozdrav, pitanje, šta god.
          </div>
        ) : (
          messages.map((m, i) => {
            const mine = m.sender_id === user?.id;
            const prev = i > 0 ? messages[i - 1] : null;
            const showDay = !prev || !sameDay(prev.created_at, m.created_at);
            const grouped =
              prev && prev.sender_id === m.sender_id && sameDay(prev.created_at, m.created_at) &&
              new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="my-3 flex items-center justify-center">
                    <span className="px-2.5 py-1 rounded-full bg-surface-2 text-[11px] text-muted-foreground tracking-wide">
                      {dayLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <div className={cn("flex", mine ? "justify-end" : "justify-start", grouped ? "mt-0.5" : "mt-1.5")}>
                  <div
                    className={cn(
                      "max-w-[78%] px-3.5 py-2 text-[14px] leading-snug whitespace-pre-wrap break-words",
                      mine
                        ? "bg-gradient-brand text-white rounded-2xl rounded-br-md shadow-brand"
                        : "bg-surface-2 text-foreground rounded-2xl rounded-bl-md border border-hairline",
                    )}
                  >
                    {m.body}
                    <div
                      className={cn(
                        "text-[10.5px] mt-1 tnum",
                        mine ? "text-white/75 text-right" : "text-muted-foreground",
                      )}
                    >
                      {formatTime(m.created_at)}
                      {mine && m.read_at && <span className="ml-1">· pročitano</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={handleSend}
        className="px-3 pt-2 pb-3 border-t border-hairline bg-surface/80 backdrop-blur"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e as any);
              }
            }}
            rows={1}
            placeholder="Napiši poruku…"
            className="flex-1 resize-none rounded-2xl border border-input bg-background px-3.5 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-ring max-h-32"
            style={{ minHeight: 42 }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={sending || !draft.trim()}
            className="h-[42px] w-[42px] rounded-2xl shrink-0"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
};
