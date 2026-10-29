import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, Dumbbell, Loader2 } from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { BroadcastButton } from "@/components/BroadcastButton";
import { QuickMessagePanel } from "@/components/trainer/QuickMessagePanel";
import { WatchSlash } from "@/components/trainer/WatchSlash";
import { ZaustaviTreningDugme, jeZaboravljen } from "@/components/trainer/ZaustaviTrening";
import { BaterijaVezbaca, baterijaVezbaca } from "@/components/trainer/BaterijaVezbaca";
import { cn } from "@/lib/utils";
import { HR_ZONE_COLOR, formatDuration, getHrColor } from "@/lib/workout/hrZone";
import { isHrSignalLive, isWatchConnected } from "@/lib/liveWorkout";
import { nazivIzvora } from "@/lib/uredjaji";
import type { ActiveAthlete } from "@/hooks/useActiveAthletes";
import { Blizanac, LiceZone, type PodaciUzivo } from "./DashboardActiveAthletes";

// "Trenira uzivo" na racunaru (Ponoc): vrh sa trakom zona na kojoj stoji svaki
// vezbac po svom pulsu, spisak levo i izabran vezbac desno (merac pulsa, vezba,
// brze poruke). Ceo trening jednog vezbaca i dalje je LiveWorkoutView.

const KCAL = "#FF8A4C";
// Iste granice kao getHrZone: lagano, umereno, tesko, maksimum.
const ZONE = [
  { od: 60, do: 110, ime: "Lagano", opis: "do 110", boja: HR_ZONE_COLOR.easy },
  { od: 110, do: 140, ime: "Umereno", opis: "110 do 140", boja: HR_ZONE_COLOR.moderate },
  { od: 140, do: 165, ime: "Teško", opis: "140 do 165", boja: HR_ZONE_COLOR.hard },
  { od: 165, do: 200, ime: "Maksimum", opis: "preko 165", boja: HR_ZONE_COLOR.max },
];

/** Mesto pulsa na traci zona, od 0 do 1; svaka zona dobija cetvrtinu trake. */
const mestoNaTraci = (bpm: number) => {
  const i = ZONE.findIndex((z) => bpm < z.do);
  const z = ZONE[i === -1 ? ZONE.length - 1 : i];
  const unutra = Math.min(1, Math.max(0, (bpm - z.od) / (z.do - z.od)));
  return (ZONE.indexOf(z) + unutra) / ZONE.length;
};

const odmorOstalo = (a: ActiveAthlete, now: number) => {
  const kraj = a.rest_ends_at ? new Date(a.rest_ends_at).getTime() : 0;
  return a.current_state === "rest" && kraj > now ? Math.round((kraj - now) / 1000) : 0;
};
// Kalorije se prikazuju samo kad ih sat ili ziv puls stvarno salje (isto pravilo za red, detalj i zbir).
const prikaziKcal = (a: ActiveAthlete, now: number) =>
  isWatchConnected(a.watch_last_hr_at, now) ||
  (isHrSignalLive(a.hr_last_at, a.watch_last_hr_at, now) && (a.current_active_calories ?? 0) > 0);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

type Filter = "svi" | "vezba" | "odmor";

export const LiveDesktop = ({ podaci }: { podaci: PodaciUzivo }) => {
  const { athletes, now, loading, ukloni } = podaci;
  const [filter, setFilter] = useState<Filter>("svi");
  const [izabran, setIzabran] = useState<string | null>(null);

  // Kriva pulsa u spisku: brojke koje su stigle dok je ekran otvoren (do 30 merenja).
  const tragovi = useRef(new Map<string, number[]>());
  useEffect(() => {
    for (const a of athletes) {
      if (!a.current_hr || a.current_hr <= 0) continue;
      const t = tragovi.current.get(a.session_id) ?? [];
      if (t[t.length - 1] !== a.current_hr || t.length < 2) t.push(a.current_hr);
      tragovi.current.set(a.session_id, t.slice(-30));
    }
  }, [athletes]);

  const odmor = athletes.filter((a) => odmorOstalo(a, now) > 0);
  const vezba = athletes.filter((a) => odmorOstalo(a, now) === 0);
  const spisak = filter === "odmor" ? odmor : filter === "vezba" ? vezba : athletes;
  const ziviPuls = athletes.filter((a) => isHrSignalLive(a.hr_last_at, a.watch_last_hr_at, now) && (a.current_hr ?? 0) > 0);
  const prosek = ziviPuls.length ? Math.round(ziviPuls.reduce((s, a) => s + (a.current_hr ?? 0), 0) / ziviPuls.length) : null;
  const kcalVezbaca = athletes.filter((a) => prikaziKcal(a, now));
  const ukupnoKcal = Math.round(kcalVezbaca.reduce((s, a) => s + (a.current_active_calories ?? 0), 0));
  // Detalj prati filter: izabran vezbac samo ako je u spisku, inace prvi iz spiska.
  const sel = useMemo(
    () => spisak.find((a) => a.session_id === izabran) ?? spisak[0] ?? null,
    [izabran, spisak],
  );
  const natpisSpiska =
    filter === "odmor" ? `${spisak.length} na odmoru` : filter === "vezba" ? `${spisak.length} vežba` : `${spisak.length} trenira`;

  return (
    <PhoneShell
      eyebrow="Pregled"
      title="Trenira uživo"
      desktopWidth="wide"
      action={
        <>
          <div className="inline-flex gap-1 rounded-full border border-hairline bg-surface p-1">
            {(
              [
                ["svi", "Svi", athletes.length],
                ["vezba", "Vežba", vezba.length],
                ["odmor", "Odmor", odmor.length],
              ] as const
            ).map(([k, ime, n]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold transition",
                  filter === k ? "bg-surface-2 text-foreground shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.1)]" : "text-muted-foreground",
                )}
              >
                {ime}
                <span className={cn("text-[11px] font-bold tnum", filter === k ? "text-primary-soft-foreground" : "text-muted-foreground/70")}>{n}</span>
              </button>
            ))}
          </div>
          <BroadcastButton label="Obaveštenje svima" className="h-10 rounded-full" />
        </>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : athletes.length === 0 ? (
        <div className="card-premium flex flex-col items-center rounded-[28px] px-6 py-20 text-center">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-surface-2">
            <Activity className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.5} />
          </div>
          <div className="font-display text-[17px] font-bold tracking-tight">Niko ne trenira trenutno</div>
          <div className="mt-1 max-w-[320px] text-[13px] leading-snug text-muted-foreground">
            Kad vežbač pokrene trening, pojaviće se ovde uživo.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Vrh: koliko trenira, traka zona sa svakim vezbacem, zbir za salu. */}
          <section
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-8 gap-y-5 rounded-[28px] border border-hairline px-7 py-6 xl:grid-cols-[210px_minmax(0,1fr)_190px]"
            style={{ background: "linear-gradient(120deg, hsl(267 81% 58% / 0.2), hsl(258 22% 9% / 0.3) 45%, hsl(154 70% 55% / 0.07))" }}
          >
            <div>
              <span className="fig text-gradient-brand text-[62px] leading-[0.9]">{athletes.length}</span>
              <p className="mt-2 text-[13px] text-muted-foreground">
                {athletes.length === 1 ? "vežbač trenira upravo sada" : "vežbača trenira upravo sada"}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-success-soft px-2.5 text-[11px] font-semibold text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  {vezba.length} vežba
                </span>
                {odmor.length > 0 && (
                  <span className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold" style={{ background: "hsl(var(--hr-zone-1) / 0.14)", color: "hsl(var(--hr-zone-1))" }}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {odmor.length} odmor
                  </span>
                )}
              </div>
            </div>
            <div className="relative order-last col-span-2 h-[138px] xl:order-none xl:col-span-1" role="img" aria-label="Vežbači po zonama pulsa">
              {ziviPuls.map((a) => {
                const boja = getHrColor(a.current_hr);
                return (
                  <div
                    key={a.session_id}
                    className="absolute bottom-[42px] flex -translate-x-1/2 flex-col items-center"
                    style={{ left: `${mestoNaTraci(a.current_hr!) * 100}%` }}
                  >
                    <span className="fig mb-1.5 text-[17px] leading-none" style={{ color: boja }}>{a.current_hr}</span>
                    <LiceZone ime={a.athlete_name} boja={boja} velicina={30} />
                    <span className="mt-1 h-3 w-0.5 rounded-sm opacity-70" style={{ background: boja }} />
                  </div>
                );
              })}
              <div className="absolute inset-x-0 bottom-[30px] grid h-3 grid-cols-4 gap-1">
                {ZONE.map((z) => (
                  <i key={z.ime} className="rounded-full opacity-90" style={{ background: z.boja }} />
                ))}
              </div>
              <div className="absolute inset-x-0 bottom-0 grid grid-cols-4 gap-1 text-center text-[10px] text-muted-foreground/70">
                {ZONE.map((z) => (
                  <span key={z.ime}>
                    <b className="block text-[10.5px] font-semibold text-muted-foreground">{z.ime}</b>
                    {z.opis}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3.5">
              <div>
                {prosek ? (
                  <span className="flex items-baseline gap-1.5" style={{ color: getHrColor(prosek) }}>
                    <Blizanac znak="puls" boja={getHrColor(prosek)} vrednost={prosek} bojaBroja={getHrColor(prosek)} />
                  </span>
                ) : (
                  <span className="fig text-[30px]">-</span>
                )}
                <small className="mt-0.5 block text-[11.5px] text-muted-foreground">prosečan puls u sali</small>
              </div>
              <div>
                <Blizanac znak="kcal" boja={KCAL} vrednost={ukupnoKcal.toLocaleString("sr-RS")} />
                <small className="mt-0.5 block text-[11.5px] text-muted-foreground">
                  {kcalVezbaca.length === 0 ? "kcal, nijedan sat ne šalje" : "kcal ukupno do sada"}
                </small>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_372px]">
            <section className="card-premium overflow-hidden rounded-[26px]">
              <div className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <h2 className="font-display text-[16.5px] font-semibold tracking-tight">Vežbači uživo</h2>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[11.5px] font-semibold text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    {natpisSpiska}
                  </span>
                </div>
                <span className="text-[11.5px] text-muted-foreground">izaberi vežbača za detalje</span>
              </div>
              <div className="grid grid-cols-[186px_minmax(0,1fr)_62px_66px_56px] gap-3 border-y border-hairline bg-white/[0.02] px-5 py-2.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                <span>Vežbač</span>
                <span>Trenutno</span>
                <span>Puls</span>
                <span>Kcal</span>
                <span>Kriva</span>
              </div>
              {spisak.length === 0 && (
                <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">
                  {filter === "odmor" ? "Trenutno niko nije na odmoru." : "Trenutno niko nije usred vežbe."}
                </div>
              )}
              <ul className="divide-y divide-hairline">
                {spisak.map((a) => {
                  const hrLive = isHrSignalLive(a.hr_last_at, a.watch_last_hr_at, now);
                  const boja = hrLive ? getHrColor(a.current_hr) : null;
                  const showKcal = prikaziKcal(a, now);
                  const ostalo = odmorOstalo(a, now);
                  const uredjaj = nazivIzvora(a.hr_source, a.sensor_name);
                  const trag = tragovi.current.get(a.session_id) ?? [];
                  const zaboravljen = jeZaboravljen(a.started_at, now);
                  const izab = sel?.session_id === a.session_id;
                  return (
                    <li key={a.session_id}>
                      <button
                        type="button"
                        onClick={() => setIzabran(a.session_id)}
                        className={cn(
                          "grid w-full grid-cols-[186px_minmax(0,1fr)_62px_66px_56px] items-center gap-3 px-5 py-2.5 text-left transition hover:bg-white/[0.02]",
                          izab && "bg-gradient-to-r from-primary/15 to-transparent shadow-[inset_3px_0_0_hsl(262_100%_82%)]",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <LiceZone ime={a.athlete_name} boja={boja} odmor={ostalo > 0} />
                          <span className="min-w-0">
                            <span className="block text-[13.5px] font-semibold leading-tight">{a.athlete_name ?? "Vežbač"}</span>
                            <span className={cn("flex flex-wrap items-center gap-x-1 text-[11px] tnum", zaboravljen ? "text-destructive" : "text-muted-foreground")}>
                              {formatDuration(a.started_at ? now - new Date(a.started_at).getTime() : 0)}
                              {uredjaj ? ` · ${uredjaj}` : ""}
                              <BaterijaVezbaca a={a} />
                            </span>
                          </span>
                        </span>
                        <span className="min-w-0">
                          <span className={cn("block text-[13px] leading-snug", a.current_exercise_name ? "font-medium" : "text-muted-foreground")}>
                            {a.current_exercise_name ?? "Priprema..."}
                          </span>
                          {a.current_exercise_name && (
                            <span className="text-[11.5px] text-muted-foreground">
                              Serija {a.current_set_number ?? 1}
                              {a.total_sets ? ` od ${a.total_sets}` : ""}
                              {ostalo > 0 && (
                                <span className="ml-1.5 inline-flex rounded-full px-1.5 font-semibold tnum" style={{ background: "hsl(var(--hr-zone-1) / 0.14)", color: "hsl(var(--hr-zone-1))" }}>
                                  odmor {mmss(ostalo)}
                                </span>
                              )}
                            </span>
                          )}
                        </span>
                        <span>{hrLive ? <Blizanac znak="puls" boja={boja!} vrednost={a.current_hr ?? "-"} bojaBroja={boja!} /> : <WatchSlash size={16} />}</span>
                        <span>{showKcal ? <Blizanac znak="kcal" boja={KCAL} vrednost={Math.round(a.current_active_calories ?? 0)} /> : <span className="text-muted-foreground">-</span>}</span>
                        <span style={{ color: boja ?? "hsl(var(--muted-foreground))" }}>
                          {trag.length > 1 ? (
                            <svg viewBox="0 0 58 20" className="h-[22px] w-14" aria-hidden>
                              <polyline
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                points={(() => {
                                  const mn = Math.min(...trag) - 4;
                                  const mx = Math.max(...trag) + 4;
                                  return trag.map((v, i) => `${(i / (trag.length - 1)) * 56 + 1},${19 - ((v - mn) / (mx - mn)) * 18}`).join(" ");
                                })()}
                              />
                            </svg>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/60">-</span>
                          )}
                        </span>
                      </button>
                      {zaboravljen && (
                        <div className="flex items-center gap-3 border-t border-hairline bg-warning-soft/60 px-5 py-2.5">
                          <span className="flex-1 text-[12px] text-warning">
                            Trening traje {formatDuration(a.started_at ? now - new Date(a.started_at).getTime() : 0)}. Možda nije ugašen.
                          </span>
                          <ZaustaviTreningDugme sessionId={a.session_id} athleteName={a.athlete_name} onStopped={() => ukloni(a.session_id)} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {sel ? (
              <Detalj key={sel.session_id} a={sel} now={now} ukloni={ukloni} />
            ) : (
              <section className="card-premium rounded-[26px] px-5 py-10 text-center text-[13px] text-muted-foreground">
                Izaberi drugi filter da vidiš detalje vežbača.
              </section>
            )}
          </div>
        </div>
      )}
    </PhoneShell>
  );
};

/** Desni panel: izabran vezbac sa meracem pulsa, vezbom i brzim porukama. */
const Detalj = ({ a, now, ukloni }: { a: ActiveAthlete; now: number; ukloni: (id: string) => void }) => {
  const hrLive = isHrSignalLive(a.hr_last_at, a.watch_last_hr_at, now);
  const bpm = hrLive && a.current_hr && a.current_hr > 0 ? a.current_hr : null;
  const boja = bpm ? getHrColor(bpm) : "hsl(var(--muted-foreground))";
  const f = bpm ? mestoNaTraci(bpm) : 0;
  const aktivna = bpm ? Math.min(3, Math.floor(f * 4)) : -1;
  const ugao = Math.PI * (1 - f);
  const tx = 150 + 120 * Math.cos(ugao);
  const ty = 152 - 120 * Math.sin(ugao);
  const showKcal = prikaziKcal(a, now);
  const ostalo = odmorOstalo(a, now);
  const zaboravljen = jeZaboravljen(a.started_at, now);
  const uredjaj = nazivIzvora(a.hr_source, a.sensor_name);

  return (
    <section className="card-premium rounded-[26px] px-5 pb-5 pt-[18px]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <LiceZone ime={a.athlete_name} boja={bpm ? boja : null} odmor={ostalo > 0} velicina={38} />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold leading-tight">{a.athlete_name ?? "Vežbač"}</div>
            <div className={cn("text-[11.5px]", zaboravljen ? "text-destructive" : "text-muted-foreground")}>
              {zaboravljen ? "Možda nije ugašen" : ostalo > 0 ? `Na odmoru, još ${mmss(ostalo)}` : "Trenira sad"}
            </div>
            {(uredjaj || baterijaVezbaca(a)) && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {uredjaj}
                <BaterijaVezbaca a={a} />
              </div>
            )}
          </div>
        </div>
        {zaboravljen ? (
          <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-warning-soft px-2.5 text-[11px] font-semibold text-warning">
            dugo traje
          </span>
        ) : (
          <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-success-soft px-2.5 text-[11px] font-semibold text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            uživo
          </span>
        )}
      </div>

      <div className="relative mx-auto mt-1.5 h-[170px] w-[300px]" role="img" aria-label={bpm ? `Puls ${bpm}` : "Puls ne stiže"}>
        <svg viewBox="0 0 300 170" className="h-[170px] w-[300px]">
          {ZONE.map((z, i) => (
            <path
              key={z.ime}
              d="M30 152A120 120 0 0 1 270 152"
              fill="none"
              stroke={z.boja}
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray="88 400"
              strokeDashoffset={-(i * 94.2 + 3)}
              opacity={i === aktivna ? 1 : 0.28}
            />
          ))}
          {bpm && <circle cx={tx} cy={ty} r="9" fill={boja} stroke="hsl(var(--card))" strokeWidth="4" />}
        </svg>
        <div className="absolute inset-x-0 top-[62px] text-center">
          {bpm ? (
            <span className="fig text-[62px] leading-[0.9]" style={{ color: boja }}>{bpm}</span>
          ) : (
            <span className="inline-flex justify-center"><WatchSlash size={34} /></span>
          )}
          <small className="mt-1.5 block text-[12px] text-muted-foreground">
            {bpm ? `bpm · ${ZONE[aktivna]?.ime.toLowerCase()}` : "Puls ne stiže"}
          </small>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-hairline bg-white/[0.03] px-3 py-2.5">
          {showKcal ? <Blizanac znak="kcal" boja={KCAL} vrednost={Math.round(a.current_active_calories ?? 0)} /> : <span className="fig text-[20px]">-</span>}
          <small className="mt-0.5 block text-[10.5px] text-muted-foreground">kcal</small>
        </div>
        <div className="rounded-2xl border border-hairline bg-white/[0.03] px-3 py-2.5">
          <span className="fig text-[20px] leading-none">{formatDuration(a.started_at ? now - new Date(a.started_at).getTime() : 0)}</span>
          <small className="mt-0.5 block text-[10.5px] text-muted-foreground">trajanje</small>
        </div>
        <div className="rounded-2xl border border-hairline bg-white/[0.03] px-3 py-2.5">
          <span className="fig text-[20px] leading-none">{a.total_completed_sets ?? 0}</span>
          <small className="mt-0.5 block text-[10.5px] text-muted-foreground">serija urađeno</small>
        </div>
      </div>

      <div className="mt-3.5 flex items-center gap-3 rounded-[20px] bg-white/[0.03] px-4 py-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
          <Dumbbell className="h-[17px] w-[17px]" strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold leading-snug">{a.current_exercise_name ?? (ostalo > 0 ? "Odmor" : "Priprema...")}</div>
          {a.current_exercise_name && (
            <div className="text-[11.5px] text-muted-foreground">
              Serija {a.current_set_number ?? 1}
              {a.total_sets ? ` od ${a.total_sets}` : ""}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3.5">
        <QuickMessagePanel sessionId={a.session_id} />
      </div>

      <div className="mt-3.5 flex gap-2">
        <Link
          to={`/trener/vezbac/${a.athlete_id}/live`}
          className="inline-flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-full border border-white/15 text-[12px] font-semibold"
        >
          Ceo trening
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <ZaustaviTreningDugme sessionId={a.session_id} athleteName={a.athlete_name} onStopped={() => ukloni(a.session_id)} className="flex-1" />
      </div>
    </section>
  );
};

export default LiveDesktop;
