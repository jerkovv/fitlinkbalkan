import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Loader2, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { formatRelChat as formatRel, type ChatThreadRow as Thread } from "@/lib/chatThreads";
import { TrainerChatDesktop } from "@/components/trainer/web/TrainerChatDesktop";

const ChatListMobile = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data, error } = await supabase.rpc("get_chat_threads" as any);
    if (!error && data) setThreads(data as Thread[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Realtime: refresh liste na svaku novu poruku gde je trener učesnik
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`chat-list:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `trainer_id=eq.${user.id}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  return (
    <>
      <PhoneShell hasBottomNav back="/trener" eyebrow="Razgovori" title="Chat">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : threads.length === 0 ? (
          <div className="text-center text-[13px] text-muted-foreground px-6 py-12">
            <div className="h-12 w-12 rounded-2xl bg-muted mx-auto mb-3 flex items-center justify-center">
              <MessagesSquare className="h-5 w-5" />
            </div>
            Još nemaš vežbača da bi pričao s nekim.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {threads.map((t) => (
              <li key={t.athlete_id}>
                <button
                  onClick={() => navigate(`/trener/chat/${t.athlete_id}`)}
                  className={cn(
                    "w-full text-left flex gap-3 px-3 py-3 rounded-2xl card-premium-hover transition active:scale-[0.99]",
                    t.unread_count > 0 && "bg-primary/5",
                  )}
                >
                  <div className="h-11 w-11 rounded-2xl bg-gradient-brand text-white font-semibold flex items-center justify-center shrink-0">
                    {t.athlete_name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="font-semibold tracking-tight truncate">{t.athlete_name}</div>
                      <div className="text-[11px] text-muted-foreground tnum shrink-0">
                        {formatRel(t.last_at)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <div className="text-[12.5px] text-muted-foreground line-clamp-1">
                        {t.last_body
                          ? `${t.last_sender_id === user?.id ? "Ti: " : ""}${t.last_body}`
                          : "Bez poruka"}
                      </div>
                      {t.unread_count > 0 && (
                        <span className="shrink-0 h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold inline-flex items-center justify-center tnum">
                          {t.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PhoneShell>
      <BottomNav role="trainer" />
    </>
  );
};

// Racunar: spisak i razgovor u jednom okviru. Grana se bira PRE bilo kog hook-a
// telefonskog spiska - oba drze isti Realtime kanal (chat-list:<uid>) i ne smeju
// da budu montirana zajedno.
const ChatList = () => (useDesktopWeb() ? <TrainerChatDesktop /> : <ChatListMobile />);

export default ChatList;
