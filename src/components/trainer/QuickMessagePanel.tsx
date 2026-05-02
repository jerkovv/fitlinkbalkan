import { FormEvent, useEffect, useRef, useState } from "react";
import { ThumbsUp, AlertTriangle, TrendingDown, Wind, Send, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type MessageType = "text" | "encouragement" | "warning";

type SentMessage = {
  id: string;
  message: string;
  message_type: MessageType;
  sent_at: string;
};

interface QuickMessagePanelProps {
  sessionId: string;
}

const PRESETS: { label: string; type: MessageType; Icon: typeof ThumbsUp }[] = [
  { label: "Bravo, samo tako!", type: "encouragement", Icon: ThumbsUp },
  { label: "Smanji tempo", type: "warning", Icon: AlertTriangle },
  { label: "Spusti težinu", type: "warning", Icon: TrendingDown },
  { label: "Diši dublje", type: "text", Icon: Wind },
];

const fmtTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  } catch {
    return "";
  }
};

export const QuickMessagePanel = ({ sessionId }: QuickMessagePanelProps) => {
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<SentMessage[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initial fetch
  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("workout_live_messages" as any)
        .select("id, message, message_type, sent_at")
        .eq("session_log_id", sessionId)
        .order("sent_at", { ascending: false })
        .limit(10);
      if (!alive) return;
      setMessages(((data as any[]) ?? []) as SentMessage[]);
    })();
    return () => {
      alive = false;
    };
  }, [sessionId]);

  // Realtime: own messages appear instantly
  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`live-msg-trainer:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "workout_live_messages",
          filter: `session_log_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as any;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [
              {
                id: row.id,
                message: row.message,
                message_type: row.message_type ?? "text",
                sent_at: row.sent_at ?? new Date().toISOString(),
              },
              ...prev,
            ].slice(0, 10);
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const send = async (message: string, type: MessageType) => {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setSending(true);
    const { error } = await supabase.rpc("send_workout_message" as any, {
      p_session_id: sessionId,
      p_message: trimmed,
      p_message_type: type,
    } as any);
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setText("");
    inputRef.current?.focus();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(text, "text");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map(({ label, type, Icon }) => (
          <button
            key={label}
            type="button"
            disabled={sending}
            onClick={() => send(label, type)}
            className={cn(
              "rounded-2xl border border-hairline bg-surface px-3 py-3 flex items-center gap-2 text-left transition active:scale-[0.98] hover:border-primary/40 disabled:opacity-50",
              type === "warning" && "hover:bg-warning-soft/40",
              type === "encouragement" && "hover:bg-success-soft/40",
            )}
          >
            <div
              className={cn(
                "h-8 w-8 rounded-xl flex items-center justify-center shrink-0",
                type === "encouragement" && "bg-success-soft text-success-soft-foreground",
                type === "warning" && "bg-warning-soft text-warning-soft-foreground",
                type === "text" && "bg-primary-soft text-primary",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={2.25} />
            </div>
            <span className="text-[12.5px] font-semibold leading-tight">{label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Napiši poruku..."
          className="flex-1 h-12 px-4 rounded-2xl bg-surface border border-hairline text-[14px] focus:outline-none focus:border-primary/40 transition"
          disabled={sending}
          maxLength={200}
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          aria-label="Pošalji poruku"
          className="h-12 w-12 rounded-2xl bg-gradient-brand text-white inline-flex items-center justify-center shadow-brand transition active:scale-95 disabled:opacity-50"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" strokeWidth={2.4} />
          )}
        </button>
      </form>

      {messages.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Poslate poruke
          </div>
          <ul className="space-y-1.5 max-h-64 overflow-y-auto">
            {messages.map((m) => (
              <li
                key={m.id}
                className={cn(
                  "rounded-xl px-3 py-2 flex items-start gap-2 border",
                  m.message_type === "warning" &&
                    "bg-warning-soft/50 border-warning/20 text-warning-soft-foreground",
                  m.message_type === "encouragement" &&
                    "bg-success-soft/50 border-success/20 text-success-soft-foreground",
                  m.message_type === "text" &&
                    "bg-surface border-hairline text-foreground",
                )}
              >
                <span className="text-[12.5px] font-medium flex-1 leading-snug">{m.message}</span>
                <span className="text-[11px] tnum text-muted-foreground shrink-0">
                  {fmtTime(m.sent_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default QuickMessagePanel;
