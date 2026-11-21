import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, CreditCard, Loader2, MessagesSquare, Search, Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useChat } from "@/hooks/useChat";
import { ChatThread } from "@/components/ChatThread";
import { formatRelChat, type ChatThreadRow } from "@/lib/chatThreads";
import { porukaGreske } from "@/lib/errorMessage";
import { toIsoDate } from "@/lib/session";
import { cn } from "@/lib/utils";

// Isti brzi odgovori kao u nativnoj aplikaciji (TrenerChat.swift).
const BRZI_ODGOVORI = ["Naravno 👍", "Vidimo se", "Bravo, samo tako!", "Kako se osećaš?"];

// "YYYY-MM-DD" u lokalni datum, bez UTC pomeraja.
const lokalniDan = (iso: string) => {
  const [g, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(g, m - 1, d);
};

// Sledeci termin na staklu zaglavlja: "Danas 18:00", "Sutra 09:00", "Pet 21. 10:00".
const terminTekst = (datum: string, vreme: string | null) => {
  const d = lokalniDan(datum);
  const danas = new Date();
  const sutra = new Date(danas.getFullYear(), danas.getMonth(), danas.getDate() + 1);
  let dan: string;
  if (toIsoDate(d) === toIsoDate(danas)) dan = "Danas";
  else if (toIsoDate(d) === toIsoDate(sutra)) dan = "Sutra";
  else {
    const kratko = d.toLocaleDateString("sr-Latn-RS", { weekday: "short" }).replace(/\.$/, "");
    dan = `${kratko.charAt(0).toUpperCase()}${kratko.slice(1)} ${d.getDate()}.`;
  }
  return `${dan} ${vreme?.slice(0, 5) ?? ""}`.trim();
};

const clanarinaTekst = (ukupno: number | null, iskorisceno: number | null, kraj: string | null) => {
  const delovi: string[] = [];
  if (ukupno != null && ukupno > 0) delovi.push(`${iskorisceno ?? 0}/${ukupno}`);
  if (kraj) {
    const d = lokalniDan(kraj);
    delovi.push(`do ${d.getDate()}. ${d.toLocaleDateString("sr-Latn-RS", { month: "short" }).replace(/\.$/, "")}`);
  }
  return delovi.length ? delovi.join(" · ") : null;
};

const Lice = ({ ime, slika, className }: { ime: string; slika?: string | null; className: string }) =>
  slika ? (
    <img src={slika} alt="" className={cn("shrink-0 rounded-full object-cover", className)} />
  ) : (
    <div className={cn("flex shrink-0 items-center justify-center rounded-full bg-gradient-brand font-semibold text-white", className)}>
      {ime.slice(0, 1).toUpperCase()}
    </div>
  );

const novihPoruka = (n: number) =>
  n === 1
    ? "1 nova poruka"
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
      ? `${n} nove poruke`
      : `${n} novih poruka`;

/**
 * "Ko ceka odgovor" sa iOS spiska: poslednja neprocitana poruka i odgovor bez
 * otvaranja razgovora. Key na roditelju vezuje tekst za tog vezbaca, pa otkucano
 * ne moze da ode drugome kad spisak stigne u novom redosledu.
 */
const IstaknutRazgovor = ({
  nit,
  trainerId,
  onOtvori,
  onPoslato,
}: {
  nit: ChatThreadRow;
  trainerId: string;
  onOtvori: () => void;
  onPoslato: () => void;
}) => {
  const { sending, send, markRead } = useChat({ trainerId, athleteId: nit.athlete_id });
  const [odgovor, setOdgovor] = useState("");

  const posalji = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = odgovor.trim();
    if (!t || sending) return;
    const r = await send(t);
    if (r.error === "locked") return;
    if (r.error) { toast.error(porukaGreske(r.error)); return; }
    setOdgovor("");
    // Odgovoreno je: bez ovoga bi ista poruka ostala istaknuta kao neprocitana.
    await markRead();
    onPoslato();
  };

  return (
    <div className="w-full max-w-lg rounded-[26px] border border-primary/30 bg-surface p-5 text-left">
      <button type="button" onClick={onOtvori} className="block w-full text-left">
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-sm font-semibold text-white">
            {nit.athlete_name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold">{nit.athlete_name}</span>
            <span className="block text-[11.5px] text-muted-foreground tnum">
              {formatRelChat(nit.last_at)} · {novihPoruka(nit.unread_count)}
            </span>
          </span>
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-primary" />
        </span>
        <span className="mt-3 line-clamp-3 block text-[16px] font-semibold leading-snug">„{nit.last_body}“</span>
      </button>
      <form onSubmit={posalji} className="mt-3 flex items-center gap-2">
        <input
          value={odgovor}
          onChange={(e) => setOdgovor(e.target.value)}
          placeholder="Odgovori..."
          aria-label={`Odgovori: ${nit.athlete_name}`}
          className="h-10 min-w-0 flex-1 rounded-[14px] border border-hairline bg-background px-3.5 text-[13.5px] outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40"
        />
        <button
          type="submit"
          aria-label="Pošalji"
          disabled={!odgovor.trim() || sending}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-gradient-brand text-white transition disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
};

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
  // Neuspelo ucitavanje ne sme da izgleda kao prazan spisak.
  const [neuspelo, setNeuspelo] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.rpc("get_chat_threads" as any);
    if (error) {
      setNeuspelo(true);
      toast.error(porukaGreske(error));
    } else {
      setNeuspelo(false);
      if (data) setThreads(data as ChatThreadRow[]);
    }
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
  const istaknuta = threads.find((t) => t.unread_count > 0 && !!t.last_body);

  // Fotografije vezbaca: dok ne stignu stoji pocetno slovo, nikad tudja slika.
  const [slike, setSlike] = useState<Record<string, string | null>>({});
  const idjevi = useMemo(() => threads.map((t) => t.athlete_id).sort().join(","), [threads]);
  useEffect(() => {
    if (!idjevi) return;
    let ziv = true;
    (async () => {
      const { data, error } = await supabase.from("profiles").select("id, avatar_url").in("id", idjevi.split(","));
      if (!ziv) return;
      if (error) { toast.error(porukaGreske(error)); return; }
      const m: Record<string, string | null> = {};
      for (const p of (data as { id: string; avatar_url: string | null }[]) ?? []) m[p.id] = p.avatar_url;
      setSlike(m);
    })();
    return () => { ziv = false; };
  }, [idjevi]);

  // Sledeci termin i clanarina u zaglavlju razgovora, kao na telefonu.
  const [staklo, setStaklo] = useState<{ termin: string | null; clanarina: string | null }>({ termin: null, clanarina: null });
  useEffect(() => {
    setStaklo({ termin: null, clanarina: null });
    if (!athleteId || !user?.id) return;
    let ziv = true;
    (async () => {
      const [b, m] = await Promise.all([
        supabase
          .from("session_bookings")
          .select("date, start_time")
          .eq("trainer_id", user.id)
          .eq("athlete_id", athleteId)
          .gte("date", toIsoDate(new Date()))
          .neq("status", "cancelled")
          .order("date", { ascending: true })
          .order("start_time", { ascending: true })
          .limit(1),
        supabase
          .from("memberships")
          .select("sessions_total, sessions_used, ends_on")
          .eq("athlete_id", athleteId)
          .eq("trainer_id", user.id)
          .eq("status", "active")
          .order("ends_on", { ascending: false })
          .limit(1),
      ]);
      if (!ziv) return;
      if (b.error) toast.error(porukaGreske(b.error));
      if (m.error) toast.error(porukaGreske(m.error));
      const prvi = (b.data as { date: string; start_time: string | null }[] | null)?.[0];
      const c = (m.data as { sessions_total: number | null; sessions_used: number | null; ends_on: string | null }[] | null)?.[0];
      setStaklo({
        termin: prvi ? terminTekst(prvi.date, prvi.start_time) : null,
        clanarina: c ? clanarinaTekst(c.sessions_total, c.sessions_used, c.ends_on) : null,
      });
    })();
    return () => { ziv = false; };
  }, [athleteId, user?.id]);

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
          ) : neuspelo && threads.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[13px] text-muted-foreground">Razgovori nisu učitani.</p>
              <button
                type="button"
                onClick={() => { setLoading(true); load(); }}
                className="mt-3 h-9 rounded-full bg-primary-soft px-4 text-[12.5px] font-semibold text-primary transition hover:opacity-80"
              >
                Pokušaj ponovo
              </button>
            </div>
          ) : vidljivi.length === 0 ? (
            threads.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-[14px] font-semibold">Još nema poruka</p>
                <p className="mt-1 text-[12px] text-muted-foreground">Kad ti vežbač piše, razgovor se pojavi ovde.</p>
              </div>
            ) : (
              <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">Nema vežbača sa tim imenom.</p>
            )
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
                      <Lice ime={t.athlete_name} slika={slike[t.athlete_id]} className="h-10 w-10 text-[15px]" />
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
              <Lice ime={aktivni.athlete_name} slika={slike[aktivni.athlete_id]} className="h-9 w-9 text-sm" />
              <div className="min-w-0 flex-1 truncate font-semibold tracking-tight">{aktivni.athlete_name}</div>
              {staklo.termin && (
                <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-[11.5px] font-semibold tnum">
                  <CalendarDays className="h-3 w-3 text-primary" />
                  {staklo.termin}
                </span>
              )}
              {staklo.clanarina && (
                <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-[11.5px] font-semibold tnum">
                  <CreditCard className="h-3 w-3 text-primary" />
                  {staklo.clanarina}
                </span>
              )}
              <button
                onClick={() => navigate(`/trener/vezbaci/${athleteId}`)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-hairline px-3.5 text-[13px] font-semibold transition hover:bg-surface-2"
              >
                <UserRound className="h-4 w-4" />
                Vidi profil
              </button>
            </header>
            {/* key: drugi vezbac = cist useChat, bez poruka prethodnog razgovora */}
            <ChatThread
              key={athleteId}
              trainerId={user.id}
              athleteId={athleteId}
              brziOdgovori={BRZI_ODGOVORI}
              className="flex-1 min-h-0"
            />
          </>
        ) : !athleteId && istaknuta && user?.id ? (
          <div className="flex flex-1 items-center justify-center px-8">
            <IstaknutRazgovor
              key={istaknuta.athlete_id}
              nit={istaknuta}
              trainerId={user.id}
              onOtvori={() => navigate(`/trener/chat/${istaknuta.athlete_id}`)}
              onPoslato={load}
            />
          </div>
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
