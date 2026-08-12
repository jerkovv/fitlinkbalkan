import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card, SectionTitle, StatCard } from "@/components/ui-bits";
import {
  Play, CalendarPlus, Apple, Loader2, Dumbbell, UserRound, Lock,
  Flame, Trophy, Scale, TrendingDown, TrendingUp,
} from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import { MessageTrainerCard } from "@/components/MessageTrainerCard";
import { NotificationBell } from "@/components/NotificationBell";
import { ChatBell } from "@/components/ChatBell";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useClanarinaLock } from "@/components/clanarina/useClanarinaLock";
import { getNextWorkoutDay, type NextWorkoutDay } from "@/lib/workouts";

/**
 * Kratak pregled napretka za pocetnu.
 *
 * Ranije je na ovom mestu stajala fiksna recenica "Zavrsi prvih nekoliko treninga
 * da vidis statistiku rekorda" - pisala je i vezbacu sa dvadeset odradjenih
 * treninga i gomilom rekorda. Sad se cita stvarno stanje, a ta recenica ostaje
 * samo za onog ko zaista jos nema nista.
 */
type Napredak = {
  nizNedelja: number;
  ukupnoTreninga: number;
  rekord: { vezba: string; kg: number; pon: number } | null;
  tezina: { sada: number; promena: number } | null;
};

const Home = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { hasAccess, guard } = useClanarinaLock();
  const [loading, setLoading] = useState(true);
  const [next, setNext] = useState<NextWorkoutDay | null>(null);
  const [exerciseCount, setExerciseCount] = useState<number>(0);
  const [monthCount, setMonthCount] = useState<number>(0);
  const [trainerName, setTrainerName] = useState<string>("");
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [napredak, setNapredak] = useState<Napredak | null>(null);

  const emailHandle = (user?.email ?? "").split("@")[0] ?? "";
  const firstName = (fullName?.trim() || emailHandle).split(/\s+/)[0] ?? "";

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);

      // Profil
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      setFullName((prof as any)?.full_name ?? null);
      setProfileLoaded(true);


      // Sledeći dan u rotaciji
      const nextDay = await getNextWorkoutDay(user.id);
      setNext(nextDay ?? null);

      // Broj vežbi za taj dan
      if (nextDay) {
        const { count } = await supabase
          .from("assigned_program_exercises")
          .select("id", { count: "exact", head: true })
          .eq("day_id", nextDay.day_id)
          .is("deleted_at", null);
        setExerciseCount(count ?? 0);
      }

      // Treninzi ovog meseca
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const { count: monthC } = await supabase
        .from("workout_session_logs")
        .select("id", { count: "exact", head: true })
        .eq("athlete_id", user.id)
        .not("completed_at", "is", null)
        .gte("completed_at", start.toISOString());
      setMonthCount(monthC ?? 0);

      // Trener
      const { data: ath } = await supabase
        .from("athletes")
        .select("trainer_id")
        .eq("id", user.id)
        .maybeSingle();
      const tId = (ath as any)?.trainer_id ?? null;
      setTrainerId(tId);
      if (tId) {
        const { data: tr } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", tId)
          .maybeSingle();
        setTrainerName((tr as any)?.full_name ?? "");
      }

      // Napredak: niz nedelja, najjaci rekord i kretanje tezine.
      const [streakRes, prRes, metRes] = await Promise.all([
        supabase.rpc("get_athlete_streak", { p_athlete_id: user.id } as any),
        supabase
          .from("personal_records")
          .select("best_weight_kg, best_weight_reps, best_e1rm_kg, exercises(name)")
          .eq("athlete_id", user.id)
          .not("best_weight_kg", "is", null)
          .order("best_e1rm_kg", { ascending: false, nullsFirst: false })
          .limit(1),
        supabase
          .from("body_metrics")
          .select("weight_kg, recorded_on")
          .eq("athlete_id", user.id)
          .not("weight_kg", "is", null)
          .order("recorded_on", { ascending: false })
          .limit(8),
      ]);

      const streak = (streakRes.data as any)?.[0] ?? streakRes.data ?? null;
      const topPr = (prRes.data as any[])?.[0] ?? null;
      const merenja = ((metRes.data as any[]) ?? []).map((m) => Number(m.weight_kg));

      setNapredak({
        nizNedelja: streak?.weeks_streak ?? 0,
        ukupnoTreninga: streak?.total_workouts ?? 0,
        rekord: topPr
          ? {
              vezba: topPr.exercises?.name ?? "Vežba",
              kg: Number(topPr.best_weight_kg),
              pon: topPr.best_weight_reps ?? 0,
            }
          : null,
        // Promena je prvo merenje u nizu (najnovije) naspram najstarijeg koji imamo.
        tezina:
          merenja.length >= 2
            ? {
                sada: merenja[0],
                promena: Math.round((merenja[0] - merenja[merenja.length - 1]) * 10) / 10,
              }
            : merenja.length === 1
              ? { sada: merenja[0], promena: 0 }
              : null,
      });

      setLoading(false);
    };
    load();
  }, [user]);

  return (
    <>
      <PhoneShell
        hasBottomNav
        eyebrow="Dobro došao nazad"
        title={
          <h1 className="font-display text-[34px] leading-[1.05] font-bold tracking-tightest">
            Zdravo,{" "}
            {profileLoaded ? (
              <>
                {firstName}
                <span className="text-gradient-brand"> 💪</span>
              </>
            ) : (
              <span className="inline-block h-7 w-32 align-middle rounded-md bg-muted animate-pulse" />
            )}
          </h1>
        }
        rightSlot={
          <div className="flex items-center gap-2">
            <ChatBell />
            <NotificationBell />
            <UserMenu />
          </div>
        }
      >
        {trainerName && (
          <div className="-mt-3 mb-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2 border border-hairline self-start">
            <div className="h-5 w-5 rounded-full bg-gradient-brand text-white flex items-center justify-center">
              <UserRound className="h-3 w-3" strokeWidth={2.5} />
            </div>
            <span className="text-[12px] text-muted-foreground">
              Trener: <span className="font-semibold text-foreground">{trainerName}</span>
            </span>
          </div>
        )}
        {loading ? (
          <Card className="p-5 border-0 relative overflow-hidden bg-muted/40 animate-pulse min-h-[196px]">
            <div className="h-3 w-24 rounded bg-muted mb-3" />
            <div className="h-7 w-2/3 rounded bg-muted mb-2" />
            <div className="h-3 w-1/2 rounded bg-muted mb-5" />
            <div className="h-3 w-1/3 rounded bg-muted mb-5" />
            <div className="h-9 w-36 rounded-full bg-muted" />
          </Card>
        ) : next ? (
          <button
            onClick={guard(() => navigate(`/vezbac/trening/aktivan/${next.day_id}`))}
            className="block w-full text-left"
          >
            <Card className="p-5 bg-gradient-brand text-white border-0 shadow-brand relative overflow-hidden">
              <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
              <div className="relative">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80 mb-2">
                  Sledeći trening
                </div>
                <div className="font-display text-[26px] font-bold tracking-tighter leading-tight">
                  {next.day_name}
                </div>
                <div className="text-[13px] text-white/85 mt-1.5">
                  {next.program_name} · Dan {next.day_number} od {next.total_days}
                  {trainerName ? ` · Trener ${trainerName.split(" ")[0]}` : ""}
                </div>

                <div className="mt-4 text-[13px] text-white/90">
                  {exerciseCount} {exerciseCount === 1 ? "vežba" : "vežbi"} na rasporedu
                </div>

                <div className="mt-5 inline-flex items-center gap-2 bg-white text-foreground rounded-full px-4 py-2 text-[13px] font-bold shadow-soft">
                  {hasAccess ? <Play className="h-3.5 w-3.5 fill-foreground" /> : <Lock className="h-3.5 w-3.5" />} Počni trening
                </div>
              </div>
            </Card>
          </button>
        ) : (
          <Card className="p-6 text-center space-y-3">
            <div className="h-12 w-12 mx-auto rounded-2xl bg-muted flex items-center justify-center">
              <Dumbbell className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="font-display text-[18px] font-bold tracking-tight">
              Nemaš još dodeljen program
            </div>
            <p className="text-[13px] text-muted-foreground">
              Kontaktiraj trenera da ti dodeli plan treninga.
            </p>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3">
          <StatCard tone="brand" value={String(monthCount)} unit="treninga" label="Ovog meseca" />
          <StatCard tone="success" value={next ? String(next.total_days) : "-"} unit="dana" label="U programu" />
        </div>

        <section>
          <SectionTitle action={<Link to="/vezbac/napredak" className="text-[12px] font-semibold text-primary">Napredak →</Link>}>
            Tvoj napredak
          </SectionTitle>
          {napredak && (napredak.ukupnoTreninga > 0 || napredak.rekord || napredak.tezina) ? (
            <Card className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-surface-2 px-3.5 py-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <Flame className="h-3 w-3" /> Niz
                  </div>
                  <div className="mt-1 font-display text-[22px] font-bold tracking-tight leading-none tnum">
                    {napredak.nizNedelja}
                    <span className="text-[12px] font-semibold text-muted-foreground ml-1">
                      {napredak.nizNedelja === 1 ? "nedelja" : "nedelje"}
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl bg-surface-2 px-3.5 py-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <Dumbbell className="h-3 w-3" /> Ukupno
                  </div>
                  <div className="mt-1 font-display text-[22px] font-bold tracking-tight leading-none tnum">
                    {napredak.ukupnoTreninga}
                    <span className="text-[12px] font-semibold text-muted-foreground ml-1">treninga</span>
                  </div>
                </div>
              </div>

              {napredak.rekord && (
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-warning/10 text-warning flex items-center justify-center shrink-0">
                    <Trophy className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Najjači rekord
                    </div>
                    <div className="text-[13.5px] font-semibold truncate">{napredak.rekord.vezba}</div>
                  </div>
                  <div className="text-[14px] font-bold tnum shrink-0">
                    {napredak.rekord.kg} kg × {napredak.rekord.pon}
                  </div>
                </div>
              )}

              {napredak.tezina && (
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Scale className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Težina
                    </div>
                    <div className="text-[13.5px] font-semibold tnum">{napredak.tezina.sada} kg</div>
                  </div>
                  {napredak.tezina.promena !== 0 && (
                    <div
                      className={`inline-flex items-center gap-1 text-[13px] font-bold tnum shrink-0 ${
                        napredak.tezina.promena < 0 ? "text-success" : "text-foreground"
                      }`}
                    >
                      {napredak.tezina.promena < 0 ? (
                        <TrendingDown className="h-3.5 w-3.5" />
                      ) : (
                        <TrendingUp className="h-3.5 w-3.5" />
                      )}
                      {napredak.tezina.promena > 0 ? "+" : ""}
                      {napredak.tezina.promena} kg
                    </div>
                  )}
                </div>
              )}
            </Card>
          ) : (
            <Card className="p-5 text-[13px] text-muted-foreground">
              Završi prvih nekoliko treninga da vidiš statistiku rekorda.
            </Card>
          )}
        </section>

        <Link
          to="/vezbac/rezervacija"
          className="flex items-center gap-3 card-premium-hover px-5 py-4"
        >
          <div className="h-11 w-11 rounded-2xl bg-gradient-brand text-white shadow-brand flex items-center justify-center">
            <CalendarPlus className="h-[18px] w-[18px]" />
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-semibold tracking-tight">Rezerviši termin</div>
            <div className="text-[12.5px] text-muted-foreground">Pogledaj dostupne slotove</div>
          </div>
          <span className="text-primary font-bold">→</span>
        </Link>

        <Link
          to="/vezbac/ishrana"
          className="flex items-center gap-3 card-premium-hover px-5 py-4"
        >
          <div className="h-11 w-11 rounded-2xl bg-gradient-brand-soft text-primary flex items-center justify-center">
            <Apple className="h-[18px] w-[18px]" />
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-semibold tracking-tight">Plan ishrane</div>
            <div className="text-[12.5px] text-muted-foreground">Današnji obroci</div>
          </div>
          <span className="text-muted-foreground">→</span>
        </Link>

        <MessageTrainerCard trainerId={trainerId} />
      </PhoneShell>
      <BottomNav role="athlete" />
    </>
  );
};

export default Home;
