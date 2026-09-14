import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, MessagesSquare, Search, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { ChatThread } from "@/components/ChatThread";
import { formatRelChat, type ChatThreadRow } from "@/lib/chatThreads";
import { cn } from "@/lib/utils";

/**
 * Poruke na racunaru (fitlink.rs/dashboard): levo spisak razgovora, desno otvoren
 * razgovor - u jednom okviru visine ekrana, kao desktop mesindzer. Telefonski
 * raspored (spisak pa zaseban ekran razgovora) je na sirokom ekranu bio uska
 * kolona sa zaglavljem i poljem za unos koji plutaju odvojeno.
 *
 * Isti URL-ovi kao na telefonu (/trener/chat i /trener/chat/:athleteId), pa
 * linkovi iz obavestenja i ChatBell-a vode pravo u otvoren razgovor.
 */
export const TrainerChatDesktop = ({ athleteId }: { athleteId?: string }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<ChatThreadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pretraga, setPretraga] = useState("");

  const load = async () => {
    const { data, error } = await supabase.rpc("get_chat_threads" as any);
    if (!error && data) setThreads(data as ChatThreadRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Isti kanal kao telefonski spisak (chat-list:<uid>); nikad nisu montirani zajedno.
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`chat-list:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `trainer_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  const vidljivi = useMemo(() => {
    const q = pretraga.trim().toLowerCase();
    return q ? threads.filter((t) => t.athlete_name.toLowerCase().includes(q)) : threads;
  }, [threads, pretraga]);

  // Spisak dolazi iz RPC-a koji vraca samo trenerove vezbace, pa je clanstvo u
  // spisku ujedno i provera da razgovor sme da se otvori (RLS svakako brani).
  const aktivni = athleteId ? threads.find((t) => t.athlete_id === athleteId) : undefined;

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] w-full max-w-[1120px] overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm animate-fade-in">
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-hairline">
        <div className="px-5 pt-5 pb-3">
          <h1 className="font-display text-[22px] font-bold tracking-tight">Poruke</h1>
          <div className="relative mt-3">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={pretraga}
              onChange={(e) => setPretraga(e.target.value)}
              placeholder="Pretraži vežbače"
              aria-label="Pretraži vežbače"
              className="h-9 w-full rounded-full bg-surface-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : vidljivi.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
              {threads.length === 0 ? "Još nemaš vežbača da bi pričao s nekim." : "Nema vežbača sa tim imenom."}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {vidljivi.map((t) => {
                const aktivan = t.athlete_id === athleteId;
                const neprocitano = t.unread_count > 0;
                return (
                  <li key={t.athlete_id}>
                    <button
                      onClick={() => navigate(`/trener/chat/${t.athlete_id}`)}
                      aria-current={aktivan || undefined}
                      className={cn(
                        "flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition",
                        aktivan ? "bg-primary-soft" : "hover:bg-surface-2",
                      )}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-[15px] font-semibold text-white">
                        {t.athlete_name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={cn("truncate text-[14px] tracking-tight", neprocitano ? "font-bold" : "font-semibold")}>
                            {t.athlete_name}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground tnum">{formatRelChat(t.last_at)}</span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <span className={cn("line-clamp-1 text-[12.5px]", neprocitano ? "text-foreground" : "text-muted-foreground")}>
                            {t.last_body
                              ? `${t.last_sender_id === user?.id ? "Ti: " : ""}${t.last_body}`
                              : "Bez poruka"}
                          </span>
                          {neprocitano && (
                            <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tnum">
                              {t.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-background">
        {athleteId && aktivni && user?.id ? (
          <>
            <header className="flex h-16 shrink-0 items-center gap-3 border-b border-hairline bg-surface px-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-sm font-semibold text-white">
                {aktivni.athlete_name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 truncate font-semibold tracking-tight">{aktivni.athlete_name}</div>
              <button
                onClick={() => navigate(`/trener/vezbaci/${athleteId}`)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-hairline px-3.5 text-[13px] font-semibold transition hover:bg-surface-2"
              >
                <UserRound className="h-4 w-4" />
                Vidi profil
              </button>
            </header>
            {/* key: drugi vezbac = cist useChat, bez poruka prethodnog razgovora */}
            <ChatThread key={athleteId} trainerId={user.id} athleteId={athleteId} className="flex-1 min-h-0" />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand-soft">
              <MessagesSquare className="h-6 w-6 text-primary" />
            </div>
            <h2 className="font-display text-lg font-bold">
              {athleteId && !loading ? "Razgovor nije dostupan" : "Izaberi razgovor"}
            </h2>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              {athleteId && !loading
                ? "Ovaj vežbač nije na tvom spisku."
                : "Poruke sa vežbačem se otvaraju ovde, a spisak ostaje levo."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

export default TrainerChatDesktop;
