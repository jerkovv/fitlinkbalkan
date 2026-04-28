import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Chat shortcut sa unread badge-om. Vodi:
 *  - trener  → /trener/chat
 *  - vežbač  → /vezbac/chat
 *
 * Realtime: sluša INSERT/UPDATE na messages gde je korisnik učesnik.
 */
export const ChatBell = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [unread, setUnread] = useState(0);

  const refresh = async () => {
    const { data } = await supabase.rpc("get_unread_chat_count" as any);
    setUnread(typeof data === "number" ? data : 0);
  };

  useEffect(() => {
    if (!user?.id) return;
    refresh();
    const filter =
      role === "trainer" ? `trainer_id=eq.${user.id}` : `athlete_id=eq.${user.id}`;
    const ch = supabase
      .channel(`chat-bell:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter }, () =>
        refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, role]);

  const target = role === "athlete" ? "/vezbac/chat" : "/trener/chat";

  return (
    <button
      aria-label="Chat"
      onClick={() => navigate(target)}
      className={cn(
        "relative h-10 w-10 rounded-full flex items-center justify-center",
        "bg-surface-2 text-foreground/80 hover:bg-surface-3 transition active:scale-95",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
      )}
    >
      <MessageCircle className="h-[18px] w-[18px]" strokeWidth={2.25} />
      {unread > 0 && (
        <span
          className={cn(
            "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full",
            "bg-gradient-brand text-white text-[10px] font-bold tracking-tight",
            "flex items-center justify-center shadow-brand tnum",
          )}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
};
