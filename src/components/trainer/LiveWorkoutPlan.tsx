import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpDown, Check, CheckCircle2, ChevronDown, Dumbbell, History, Link2, Loader2, Lock, Pencil, Plus, Repeat2, Scissors, Timer, Trash2, Trophy, Unlink, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { porukaGreske } from "@/lib/errorMessage";
import { useConfirm } from "@/hooks/useConfirm";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { useLastPerformance } from "@/hooks/useLastPerformance";
import { ExercisePickerSheet } from "@/components/exercises/ExercisePickerSheet";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { Input } from "@/components/ui/input";
import { GdeIdeNova } from "@/components/trainer/web/serije/GdeIdeNova";
import { IzborTipaSerije } from "@/components/trainer/web/serije/IzborTipaSerije";
import { OznakaSerije } from "@/components/trainer/web/serije/OznakaSerije";
import { PomeriMeni } from "@/components/trainer/web/serije/PomeriMeni";
import { RedosledUzivo } from "@/components/trainer/web/serije/RedosledUzivo";
import { blokovi, mapaNovihId, novRedosled, type Mesto } from "@/components/trainer/web/serije/redosled";
import { nazivTipa, opisSerije, type TipSerijeId } from "@/components/trainer/web/serije/tipSerije";
import { jePoRuci, poRuciSerije, prefiksRuku } from "@/lib/kgPoRuci";

type SetDetail = {
  set_number: number;
  reps: string | null;
  weight_kg: number | null;
  rest_seconds: number | null;
  /** Tip koji bira trener; NULL je obicna serija. */
  set_type?: string | null;
};

type DayExercise = {
  id: string;
  position: number;
  sets: number;
  reps: number | null;
  weight_kg: number | null;
  duration_minutes: number | null;
  rest_seconds: number | null;
  set_details: SetDetail[] | null;
  /** NULL = obicna vezba. Isti broj = jedan superset krug. */
  superset_group: number | null;
  /** true = kilaza je za jednu ruku (dve tegle), prikaz "2× 15 kg". */
  kg_po_ruci?: boolean | null;
  exercise_id: string;
  exercise: {
    name: string;
    name_en: string | null;
    thumbnail_url: string | null;
    is_duration_based: boolean | null;
  };
};

/** Pauza koju motor stvarno koristi: per-set red je izvor istine, vezba je rezerva. */
const trenutnaPauza = (ex: DayExercise): number | null =>
  ex.set_details?.[0]?.rest_seconds ?? ex.rest_seconds ?? null;

type DayFull = {
  day_name: string;
  /** true = slobodan trening (nema plan dana). */
  is_free?: boolean;
  exercises: DayExercise[];
};

/** Serija upisana U OVOM treningu (set_logs). */
type DanasnjiSet = {
  exercise_id: string;      // assigned_program_exercises.id
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  logged_by_trainer: boolean;
  /** Red je napravio trener svojom potvrdom; samo takav sme da skine. */
  created_by_trainer?: boolean | null;
};

/** Raspored kolona mreze: serija | prosli put | kg | ponavljanja | cekiranje. */
const KOLONE = "grid grid-cols-[20px_minmax(0,1fr)_56px_56px_32px] gap-x-2 items-center";
/** Racunar: broj serije je dugme za tip, a na kraju reda je uklanjanje serije. */
const KOLONE_RACUNAR = "grid grid-cols-[32px_minmax(0,1fr)_76px_76px_32px_28px] gap-x-2 items-center";

const serijeVezbe = (ex: DayExercise): number =>
  Math.max(ex.sets ?? 0, ex.set_details?.length ?? 0) || 1;

const imeVezbe = (ex: DayExercise): string => ex.exercise.name_en?.trim() || ex.exercise.name;

const GENERICKA_GRESKA = "Nešto nije u redu. Pokušaj ponovo.";
/** Serverske poruke iz RAISE nemaju prevod: tada ide konkretan tekst radnje, kao na telefonu. */
const porukaIli = (e: unknown, rezerva: string): string => {
  const p = porukaGreske(e);
  return p === GENERICKA_GRESKA ? rezerva : p;
};

/** Neupisan unos prati svoj red: kljuc "vezba:broj" iza obrisane serije ide broj nize. */
const pomeriUnosIza = <T,>(u: Record<string, T>, apeId: string, broj: number): Record<string, T> => {
  const p = `${apeId}:`;
  const novi: Record<string, T> = {};
  for (const [k, v] of Object.entries(u)) {
    const b = k.startsWith(p) ? Number(k.slice(p.length)) : NaN;
    if (!Number.isFinite(b) || b < broj) novi[k] = v;
    else if (b > broj) novi[`${p}${b - 1}`] = v;
  }
  return novi;
};

const datumKratko = (iso: string): string =>
  new Date(iso).toLocaleDateString("sr-Latn-RS", { day: "numeric", month: "short" });

/** "40 kg x 10", "2× 15 kg x 10" (po ruci) ili samo "x 10" za vezbe sa sopstvenom tezinom. */
const setTekst = (s: { reps: number | null; weight_kg: number | null }, poRuci = false): string => {
  const kg = s.weight_kg != null && Number(s.weight_kg) > 0 ? `${prefiksRuku(poRuci)}${Number(s.weight_kg)} kg` : null;
  const reps = s.reps != null ? `x ${s.reps}` : null;
  return [kg, reps].filter(Boolean).join(" ") || "-";
};

/** Cilj za danas, sazeto: "4 x 10 · 60 kg", "4 x 10 · 2× 15 kg" ili "20 min". */
const ciljTekst = (ex: DayExercise): string => {
  if (ex.exercise.is_duration_based) {
    return ex.duration_minutes != null ? `${ex.duration_minutes} min` : "Trajanje";
  }
  const brojSetova = ex.set_details?.length || ex.sets;
  const prvi = ex.set_details?.[0];
  const reps = prvi?.reps ?? (ex.reps != null ? String(ex.reps) : null);
  const kg = prvi?.weight_kg ?? ex.weight_kg;
  const delovi = [`${brojSetova} x ${reps ?? "-"}`];
  if (kg != null && Number(kg) > 0) delovi.push(`${prefiksRuku(jePoRuci(ex))}${Number(kg)} kg`);
  return delovi.join(" · ");
};

/**
 * Spisak vezbi treninga koji vezbac UPRAVO radi, na trenerovom uzivo ekranu.
 * Za svaku vezbu: danasnji cilj i sta je vezbac poslednji put digao za bas nju,
 * da trener u sali odmah zna koji broj da mu zada.
 *
 * Trenutna vezba je istaknuta, odradjene su zacrtane.
 *
 * Slobodan trening nema vezbe (day_id je null - vidi _start_free_workout_session),
 * pa se komponenta tada uopste ne montira; roditelj prikazuje svoje stanje.
 */
export const LiveWorkoutPlan = ({
  sessionId,
  dayId,
  athleteId,
  currentIdx,
  currentSetNumber,
  onPlanPromenjen,
}: {
  sessionId: string;
  /** null = slobodan trening (nema plan dana, vezbe zive uz sesiju). */
  dayId: string | null;
  athleteId: string;
  currentIdx: number | null;
  /** Sluzi kao okidac za osvezavanje danasnjih serija kad vezbac zavrsi set. */
  currentSetNumber: number | null;
  /** Server je pomerio tekucu vezbu ili seriju; roditelj odmah povuce zivo stanje. */
  onPlanPromenjen?: () => void;
}) => {
  const { locked, openLock } = usePretplataLock();
  const confirm = useConfirm();
  // Komponenta je zajednicka sa telefonskim vebom: sve nove kontrole su samo na racunaru.
  const desktop = useDesktopWeb();
  // Serija ciji tip trener menja (prozor sa tipovima i uklanjanjem).
  const [izborSerije, setIzborSerije] = useState<{ apeId: string; broj: number } | null>(null);
  const [redosled, setRedosled] = useState(false);
  // Tek dodate vezbe dok trener ne izabere gde idu.
  const [noveVezbe, setNoveVezbe] = useState<string[]>([]);
  const [planNijeStigao, setPlanNijeStigao] = useState(false);
  // Brava za izmene plana: drzi se i dok traje ponovno citanje, da brojevi serija budu svezi.
  const radiRef = useRef(false);
  const [day, setDay] = useState<DayFull | null>(null);
  const [loading, setLoading] = useState(true);
  // Vezba koju trener menja (assigned_program_exercises.id), null = sheet zatvoren.
  const [menjam, setMenjam] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);
  // Serije upisane u ovom treningu, grupisane po vezbi.
  const [danas, setDanas] = useState<Record<string, DanasnjiSet[]>>({});
  // Rezim oznacavanja vise vezbi. Nosi i SVRHU: superset je ranije zivio unutar
  // rezima brisanja, pa se do njega dolazilo samo preko crvenog dugmeta "Obriši
  // vežbe" - trener ga prakticno nije ni nalazio.
  const [izbor, setIzbor] = useState<{ svrha: "brisanje" | "superset"; ids: Set<string> } | null>(null);
  // Rucno otkucana pauza po vezbi, dok se kuca. Kljuc je ape id.
  const [pauza, setPauza] = useState<Record<string, string>>({});
  // Sheet za dodavanje novih vezbi na kraj treninga.
  const [dodajem, setDodajem] = useState(false);
  // Rukom otkucane vrednosti po celiji mreze, kljuc "apeId:brojSerije".
  // Drzi se odvojeno od upisanog, da kucanje ne bude pregazeno osvezavanjem.
  const [unos, setUnos] = useState<Record<string, { kg?: string; reps?: string }>>({});
  // Otvorena vezba (mreza se vidi samo za nju). null = prati trenutnu vezbu
  // vezbaca, "" = sve sklopljeno, inace id bas te vezbe.
  const [otvorena, setOtvorena] = useState<string | null>(null);
  const dayRef = useRef<DayFull | null>(null);
  dayRef.current = day;

  const ucitaj = useCallback(async (): Promise<DayExercise[] | null> => {
    // Isti RPC koji koristi i vezbacev ekran; trener sme da ga zove jer
    // funkcija propusta i p.trainer_id = auth.uid().
    // Po SESIJI, ne po danu: slobodan trening nema day_id, a i kod treninga sa
    // planom ovo vraca vezbe SESIJE ako je trener danas nesto menjao.
    const { data, error } = await supabase.rpc("get_session_plan_full" as any, {
      p_session_id: sessionId,
    });
    // Neuspelo citanje nije prazan plan: ostaje ono sto se vec vidi.
    if (error) {
      toast.error(porukaGreske(error), { id: "uzivo-plan" });
      setPlanNijeStigao(!dayRef.current);
      setLoading(false);
      return null;
    }
    const d = (Array.isArray(data) ? data[0] : data) as DayFull | null;
    // Prva izmena pravi kopiju plana za danas i menja id-jeve vezbi: otvorena
    // kartica i otkucani brojevi prelaze na novi id.
    const mapa = mapaNovihId(dayRef.current?.exercises ?? [], d?.exercises ?? []);
    if (Object.keys(mapa).length > 0) {
      const novId = (id: string) => mapa[id] ?? id;
      setOtvorena((o) => (o ? novId(o) : o));
      setPauza((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [novId(k), v])));
      setUnos((u) => Object.fromEntries(Object.entries(u).map(([k, v]) => {
        const i = k.lastIndexOf(":");
        return [`${novId(k.slice(0, i))}${k.slice(i)}`, v];
      })));
      setNoveVezbe((n) => n.map(novId));
      setIzborSerije((s) => (s ? { ...s, apeId: novId(s.apeId) } : s));
    }
    setPlanNijeStigao(false);
    dayRef.current = d ?? null;
    setDay(d ?? null);
    setLoading(false);
    return d?.exercises ?? [];
  }, [sessionId]);

  // Serije upisane u OVOM treningu. Trener ih ima pravo da cita ("trainer reads
  // set logs" RLS politika). set_logs nije u realtime objavi, pa se osvezava kad
  // se promeni pozicija vezbaca - a ona se menja bas kad neko upise seriju.
  const ucitajDanas = useCallback(async (): Promise<Record<string, DanasnjiSet[]> | null> => {
    const { data, error } = await supabase
      .from("set_logs")
      .select("exercise_id, set_number, reps, weight_kg, logged_by_trainer, created_by_trainer")
      .eq("session_log_id", sessionId)
      .eq("done", true)
      .order("set_number");
    // Bez ovoga bi kratak prekid obrisao kvacice, a upisana serija bi izgledala neupisano.
    if (error) {
      toast.error(porukaGreske(error), { id: "uzivo-serije" });
      return null;
    }
    const grupisano: Record<string, DanasnjiSet[]> = {};
    for (const red of ((data ?? []) as DanasnjiSet[])) {
      (grupisano[red.exercise_id] ??= []).push(red);
    }
    setDanas(grupisano);
    return grupisano;
  }, [sessionId]);

  useEffect(() => {
    setLoading(true);
    void ucitaj();
  }, [ucitaj]);

  useEffect(() => {
    void ucitajDanas();
  }, [ucitajDanas, currentIdx, currentSetNumber]);

  // Zamena vezbe usred treninga. Server proverava da je sesija ziva, da je vezbac
  // bas ovog trenera i da vezba pripada BAS ovom danu, pa podigne plan_version -
  // sto je signal vezbacevom telefonu da ponovo ucita plan.
  const zameni = async (noviExerciseId: string) => {
    if (!menjam) return;
    if (locked) { setMenjam(null); return openLock(); }
    setSalje(true);
    const { data, error } = await supabase.rpc("trainer_replace_exercise" as any, {
      p_session_id: sessionId,
      p_assigned_exercise_id: menjam,
      p_new_exercise_id: noviExerciseId,
    });
    setSalje(false);
    setMenjam(null);
    if (error) {
      toast.error(porukaGreske(error));
      return;
    }
    toast.success(`Zamenjeno: ${(data as any)?.name ?? "vežba"}`);
    await ucitaj();
  };

  const broj = (t: string): number | null => {
    const v = t.trim().replace(",", ".");
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  /**
   * Spajanje oznacenih vezbi u superset (krug koji se radi naizmenicno, bez
   * pauze izmedju). Server ih premesta da budu uzastopne i odbija vezbu koja
   * vec ima upisanu seriju - spajanje menja redosled, a odradjeno se ne
   * prerasporedjuje unazad.
   */
  const spojiSuperset = async () => {
    if (!izbor || izbor.ids.size < 2) return;
    if (locked) return openLock();
    setSalje(true);
    const { error } = await supabase.rpc("trainer_set_superset" as any, {
      p_session_id: sessionId,
      p_ape_ids: [...izbor.ids],
    });
    setSalje(false);
    if (error) { toast.error(porukaGreske(error)); return; }
    toast.success("Superset napravljen");
    setIzbor(null);
    await ucitaj();
    await ucitajDanas();
  };

  const razdvojSuperset = async (apeId: string) => {
    if (locked) return openLock();
    setSalje(true);
    const { error } = await supabase.rpc("trainer_clear_superset" as any, {
      p_session_id: sessionId, p_ape_id: apeId,
    });
    setSalje(false);
    if (error) { toast.error(porukaGreske(error)); return; }
    toast.success("Superset razdvojen");
    await ucitaj();
  };

  // Brisanje vise vezbi odjednom. Server odbija vezbu koja vec ima upisanu
  // seriju, i sam preracuna poziciju vezbaca posle brisanja.
  const obrisiOznacene = async () => {
    if (!izbor || izbor.ids.size === 0) return;
    if (locked) return openLock();
    // Kad brisanje odnese sve sto je ostalo, server zatvara trening: prvo potvrda.
    if (desktop && !jeSlobodan
        && vezbe.filter((x) => !izbor.ids.has(x.id)).every((x) => neupisano(x) === 0)
        && !(await potvrdiZavrsetak())) return;
    setSalje(true);
    const { error } = await supabase.rpc("trainer_remove_exercises" as any, {
      p_session_id: sessionId,
      p_ids: [...izbor.ids],
    });
    setSalje(false);
    if (error) { toast.error(porukaGreske(error)); return; }
    toast.success(`Obrisano ${izbor.ids.size}`);
    setIzbor(null);
    await ucitaj();
    await ucitajDanas();
  };

  // Dodavanje novih vezbi na kraj treninga (3 serije x 10, kao u builderu).
  const dodajVezbe = async (ids: string[]) => {
    if (!ids.length) return;
    if (locked) { setDodajem(false); return openLock(); }
    setSalje(true);
    const { error } = await supabase.rpc("trainer_add_exercises" as any, {
      p_session_id: sessionId,
      p_exercise_ids: ids,
    });
    setSalje(false);
    setDodajem(false);
    if (error) { toast.error(porukaGreske(error)); return; }
    toast.success(`Dodato ${ids.length}`);
    const sveze = await ucitaj();
    // Server ih dodaje na kraj, redom kako su izabrane; trener odmah bira gde idu.
    if (desktop && sveze) {
      setNoveVezbe(sveze.slice(-ids.length).filter((x) => ids.includes(x.exercise_id)).map((x) => x.id));
    }
  };

  const neupisano = (x: DayExercise, logovi: Record<string, DanasnjiSet[]> = danas): number =>
    Math.max(0, serijeVezbe(x) - (logovi[x.id]?.length ?? 0));

  /** Kraj se ne moze vratiti, zato radnja koja zatvara trening prvo trazi potvrdu. */
  const potvrdiZavrsetak = () =>
    confirm({
      title: "Završiti trening?",
      description: "Posle ovoga u planu ne ostaje nijedna serija, pa se trening završava i čuva.",
      confirmLabel: "Potvrdi i završi trening",
    });

  /** Izmena plana za danas: poziv, pa sveze citanje plana i serija pod istom bravom. */
  const izmena = async (
    ime: string,
    parametri: Record<string, unknown>,
    { uspeh, greska, posle }: { uspeh?: string; greska: string; posle?: () => void },
  ): Promise<boolean> => {
    if (locked) { openLock(); return false; }
    if (radiRef.current) return false;
    radiRef.current = true;
    setSalje(true);
    try {
      const { error } = await supabase.rpc(ime as any, parametri as any);
      if (error) { toast.error(porukaIli(error, greska)); return false; }
      if (uspeh) toast.success(uspeh);
      posle?.();
      await Promise.all([ucitaj(), ucitajDanas()]);
      onPlanPromenjen?.();
      return true;
    } catch (e) {
      toast.error(porukaIli(e, greska));
      return false;
    } finally {
      radiRef.current = false;
      setSalje(false);
    }
  };

  /** Tip serije vazi samo za danasnji trening; null je obicna serija. */
  const postaviTip = (apeId: string, broj: number, tip: TipSerijeId | null) =>
    void izmena("trainer_set_set_type", {
      p_session_id: sessionId, p_ape_id: apeId, p_set_number: broj, p_type: tip,
    }, { uspeh: `Serija ${broj}: ${nazivTipa(tip)}.`, greska: "Tip serije nije sačuvan." });

  /**
   * Brise seriju i njen upis ako postoji; server prenumerise ostale. Stanje se
   * prvo cita iznova: vezbac je mozda bas upisao tu seriju, a upisana trazi potvrdu.
   */
  const ukloniSeriju = async (apeId: string, broj: number) => {
    if (locked) return openLock();
    if (radiRef.current) return;
    const stareVezbe = dayRef.current?.exercises ?? [];
    radiRef.current = true;
    setSalje(true);
    const [plan, logovi] = await Promise.all([ucitaj(), ucitajDanas()]);
    radiRef.current = false;
    setSalje(false);
    if (!plan || !logovi) return;

    const staraVezba = stareVezbe.find((x) => x.id === apeId);
    const noviId = mapaNovihId(stareVezbe, plan)[apeId] ?? apeId;
    const v = plan.find((x) => x.id === noviId);
    if (!v || (staraVezba && serijeVezbe(staraVezba) !== serijeVezbe(v))) {
      toast.info("Plan se u međuvremenu promenio. Proveri seriju pa pokušaj ponovo.");
      return;
    }

    const upisana = (logovi[v.id] ?? []).some((l) => l.set_number === broj);
    if (upisana) {
      const ok = await confirm({
        title: "Ukloniti seriju?",
        description: `Serija ${broj} je već upisana. Brisanjem nestaje i upis.`,
        confirmLabel: "Ukloni seriju",
        destructive: true,
      });
      if (!ok) return;
    } else if (
      !jeSlobodan && neupisano(v, logovi) === 1
      && plan.filter((x) => x.id !== v.id).every((x) => neupisano(x, logovi) === 0)
      && !(await potvrdiZavrsetak())
    ) {
      return;
    }
    await izmena("trainer_remove_set", { p_session_id: sessionId, p_ape_id: v.id, p_set_number: broj }, {
      uspeh: `Serija ${broj} uklonjena.`,
      greska: "Serija nije uklonjena.",
      posle: () => setUnos((u) => pomeriUnosIza(u, v.id, broj)),
    });
  };

  /** Salje ceo spisak u novom redosledu; server pomera tekucu vezbu ako treba. */
  const postaviRedosled = async (nov: DayExercise[], uspeh = "Redosled promenjen."): Promise<boolean> => {
    if (locked) { openLock(); return false; }
    if (radiRef.current) return false;
    const staro = dayRef.current;
    if (!staro) return false;
    if (nov.every((x, i) => x.id === staro.exercises[i]?.id)) { setNoveVezbe([]); return true; }
    const stareNove = noveVezbe;
    const novDan = { ...staro, exercises: nov };
    dayRef.current = novDan;
    setDay(novDan);
    setNoveVezbe([]);
    const ok = await izmena("trainer_reorder_exercises", {
      p_session_id: sessionId, p_ape_ids: nov.map((x) => x.id),
    }, { uspeh, greska: "Redosled nije promenjen." });
    if (!ok) {
      dayRef.current = staro;
      setDay(staro);
      setNoveVezbe(stareNove);
      void ucitaj();
    }
    return ok;
  };

  const premesti = (ids: string[], mesto: Mesto) => {
    const nov = novRedosled(vezbe, ids, mesto, tekuca);
    if (!nov) return;
    const jedna = ids.length === 1;
    const v = vezbe.find((x) => x.id === ids[0]);
    const naziv = jedna ? (v ? imeVezbe(v) : "Vežba") : "Nove vežbe";
    const uspeh = mesto === "prvo"
      ? (jedna ? `${naziv} je sad prva.` : `${naziv} su sad prve.`)
      : mesto === "sledeca"
        ? (jedna ? `${naziv} ide sledeća.` : `${naziv} idu sledeće.`)
        : "Redosled promenjen.";
    void postaviRedosled(nov, uspeh);
  };

  const postaviCeliju = (kljuc: string, polje: "kg" | "reps", v: string) =>
    setUnos((u) => ({ ...u, [kljuc]: { ...u[kljuc], [polje]: v } }));

  /**
   * Izlazak iz polja u mrezi. Isto polje znaci dve stvari, po stanju serije:
   *
   * - serija JOS NIJE cekirana -> to je CILJ te serije. Trener upise 50 kg i
   *   vezbacu se odmah promeni cilj, pa i predlog u "Aktivna serija".
   * - serija JESTE cekirana -> to je ispravka onoga sto je stvarno dignuto.
   *
   * Zato nema zasebnog dugmeta za cilj: polje je vec na pravom mestu.
   */
  /**
   * Trener potvrdjuje da je serija (ili cela vezba) odradjena, umesto vezbaca.
   *
   * Pozicija vezbaca se racuna iz zavrsenih serija, pa ga ovo POMERA napred -
   * to je i smisao radnje, ali zato ide kroz RPC koji odmah pomeri i zivo
   * stanje, bez pokretanja pauze. Skidanje potvrde radi samo na onome sto je
   * trener sam obelezio; sto je vezbac odradio, trenerov tap ne moze da obrise.
   */
  const potvrdiOdradjeno = async (
    ex: DayExercise,
    setNumber: number | null,
    odradjeno: boolean,
  ) => {
    if (salje) return;
    if (locked) return openLock();
    // Potvrda koja upisuje poslednje sto je ostalo zatvara trening.
    if (desktop && odradjeno && !jeSlobodan
        && vezbe.filter((x) => x.id !== ex.id).every((x) => neupisano(x) === 0)
        && (setNumber == null ? neupisano(ex) > 0 : neupisano(ex) === 1)
        && !(await potvrdiZavrsetak())) return;
    setSalje(true);
    const { error } = await supabase.rpc("trainer_mark_set_done" as any, {
      p_session_id: sessionId,
      p_ape_id: ex.id,
      p_set_number: setNumber,
      p_done: odradjeno,
    });
    setSalje(false);
    if (error) { toast.error(porukaGreske(error)); return; }
    await Promise.all([ucitajDanas(), ucitaj()]);
    onPlanPromenjen?.();
  };

  const sacuvajCeliju = async (
    ex: DayExercise,
    setNumber: number,
    upisana: DanasnjiSet | undefined,
  ) => {
    const kljuc = `${ex.id}:${setNumber}`;
    const d = unos[kljuc];
    if (!d) return;
    if (locked) return openLock();

    if (upisana) {
      // Prazno polje zadrzava staru vrednost: ispravka kilaze ne sme da obrise ponavljanja.
      const { error } = await supabase.rpc("trainer_log_set" as any, {
        p_session_id: sessionId, p_ape_id: ex.id, p_set_number: setNumber,
        p_reps: broj(d.reps ?? "") ?? upisana.reps,
        p_weight: broj(d.kg ?? "") ?? upisana.weight_kg,
      });
      if (error) { toast.error(porukaGreske(error)); return; }
      setUnos((u) => { const n = { ...u }; delete n[kljuc]; return n; });
      await ucitajDanas();
      return;
    }

    // Isto za cilj: menja se samo polje koje je trener dirao.
    const cilj = ex.set_details?.find((s) => s.set_number === setNumber);
    const { error } = await supabase.rpc("trainer_set_set_target" as any, {
      p_session_id: sessionId, p_ape_id: ex.id, p_set_number: setNumber,
      p_reps: (d.reps ?? "").trim() || cilj?.reps || (ex.reps != null ? String(ex.reps) : null),
      p_weight: broj(d.kg ?? "") ?? cilj?.weight_kg ?? ex.weight_kg ?? null,
    });
    if (error) { toast.error(porukaGreske(error)); return; }
    // Otkucano se brise da polje opet prikazuje CILJ kao bledi tekst - tako se
    // na prvi pogled razlikuje zadato od odradjenog.
    setUnos((u) => { const n = { ...u }; delete n[kljuc]; return n; });
    await ucitaj();
  };

  /**
   * Dodavanje serije vezbi za danas. Menja plan, pa vazi samo za ovaj trening i
   * podize plan_version - vezbacev telefon i sat odmah vide novi broj serija.
   */
  /**
   * Pauza za tu vezbu, usred treninga. Vazi od SLEDECE pauze - ona koja tece je
   * vec usidrena, a menjati odbrojavanje pod nogama coveku bilo bi gore nego
   * sacekati. Server upisuje i na vezbu i na sve njene serije (motor cita
   * per-set vrednost, pa bi izmena samo na vezbi izgledala kao da nista nije
   * uradjeno).
   */
  const sacuvajPauzu = async (ex: DayExercise) => {
    const t = (pauza[ex.id] ?? "").trim();
    if (t === "") return;
    const n = Number(t.replace(",", "."));
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 600) {
      toast.error("Pauza mora biti ceo broj sekundi, između 0 i 600");
      return;
    }
    if (n === trenutnaPauza(ex)) return;
    if (locked) return openLock();
    setSalje(true);
    const { error } = await supabase.rpc("trainer_set_rest" as any, {
      p_session_id: sessionId, p_ape_id: ex.id, p_seconds: n,
    });
    setSalje(false);
    if (error) { toast.error(porukaGreske(error)); return; }
    if (desktop) toast.success(n === 0 ? "Bez pauze posle ove vežbe." : `Pauza ${n} s, važi od sledeće.`);
    else toast.success(n === 0 ? "Bez pauze posle ove vežbe" : `Pauza ${n}s`);
    await ucitaj();
  };

  /**
   * Kilaza po ruci (dve tegle) za tu vezbu, usred treninga. Kao i pauza, menja
   * plan samo za danas i podize plan_version, pa vezbacev telefon odmah vidi "2×".
   */
  const postaviPoRuci = async (ex: DayExercise, vrednost: boolean) => {
    if (locked) return openLock();
    setSalje(true);
    const { error } = await supabase.rpc("trainer_set_kg_po_ruci" as any, {
      p_session_id: sessionId, p_ape_id: ex.id, p_value: vrednost,
    });
    setSalje(false);
    if (error) { toast.error(porukaGreske(error)); return; }
    toast.success(vrednost ? "Kilaža je po ruci, broji se duplo" : "Kilaža više nije po ruci");
    await ucitaj();
  };

  const dodajSeriju = async (ex: DayExercise, sets: number) => {
    if (locked) return openLock();
    setSalje(true);
    const { data, error } = await supabase.rpc("trainer_set_exercise_target" as any, {
      p_session_id: sessionId, p_ape_id: ex.id,
      p_sets: sets, p_reps: null, p_weight: null,
    });
    setSalje(false);
    if (error) { toast.error(porukaGreske(error)); return; }
    // Kardio okidac drzi trajanje na jednoj seriji - reci to, ne pretvarati se.
    const r = data as { capped?: boolean; sets?: number } | null;
    if (r?.capped) toast.info(desktop ? `Najviše ${r.sets ?? 10} serija.` : `Vežba na minute ostaje na ${r.sets} seriji`);
    else toast.success("Dodata serija");
    await ucitaj();
    await ucitajDanas();
  };

  const vezbe = day?.exercises ?? [];
  const jeSlobodan = !!day?.is_free;
  const { byExercise: prosliPut } = useLastPerformance(
    athleteId,
    vezbe.map((e) => e.exercise_id),
  );
  // Tekuca vezba: indeks iz zivog stanja, inace prva koja nije gotova.
  const tekuca = currentIdx != null && currentIdx >= 0 && currentIdx < vezbe.length
    ? currentIdx
    : vezbe.findIndex((x) => (danas[x.id]?.length ?? 0) < serijeVezbe(x));
  const tekucaId = tekuca >= 0 ? vezbe[tekuca]?.id ?? null : null;

  // Otvorena kartica se ne menja sama dok trener radi u njoj: na sledecu vezbu
  // prelazi tek kad je otvorena gotova i kad u njoj nema otkucanog broja.
  const proslaTekuca = useRef(tekucaId);
  useEffect(() => {
    if (!desktop || izborSerije) return;
    const stara = proslaTekuca.current;
    if (otvorena && tekucaId && otvorena === stara && stara !== tekucaId) {
      const v = dayRef.current?.exercises.find((x) => x.id === stara);
      const kuca = Object.keys(unos).some((k) => k.startsWith(`${stara}:`));
      if (kuca || (v && (danas[v.id]?.length ?? 0) < serijeVezbe(v))) return;
      if (v) setOtvorena(tekucaId);
    }
    proslaTekuca.current = tekucaId;
  }, [desktop, izborSerije, tekucaId, otvorena, danas, unos]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  // Plan nije stigao: to nije isto sto i trening bez vezbi.
  if (desktop && planNijeStigao) {
    return (
      <div className="py-1">
        <div className="pb-2 text-[13px] text-muted-foreground">Plan treninga nije učitan.</div>
        <button
          type="button"
          onClick={() => { setLoading(true); void ucitaj(); }}
          className="h-9 w-full rounded-lg border border-hairline bg-surface-2 text-[12.5px] font-semibold text-muted-foreground transition hover:text-foreground"
        >
          Pokušaj ponovo
        </button>
      </div>
    );
  }
  // Prazan spisak je NORMALNO stanje slobodnog treninga, ne greska - zato ovde
  // stoji i dugme za dodavanje. Ranije je pisalo samo "nema vezbe", pa je trener
  // u slobodnom treningu dolazio u corsokak.
  if (!vezbe.length) {
    return (
      <div className="py-1">
        <div className="text-[13px] text-muted-foreground pb-2">
          {jeSlobodan
            ? desktop
              ? "Slobodan trening, vežbač trenira bez plana. Dodaj vežbe ako hoćeš da mu ih vodiš."
              : "Slobodan trening - vežbač trenira bez plana. Dodaj vežbe ako hoćeš da mu ih pratiš."
            : "Ovaj trening nema vežbe."}
        </div>
        <button
          type="button"
          onClick={() => setDodajem(true)}
          className="h-9 w-full rounded-lg border border-hairline bg-surface-2 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 transition"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
          Dodaj vežbe
        </button>

        <ExercisePickerSheet
          open={dodajem}
          dayId={dayId}
          dayName={day?.day_name ?? "Trening"}
          table="assigned_program_exercises"
          onClose={() => setDodajem(false)}
          onAdded={() => setDodajem(false)}
          onPickMany={(ids) => void dodajVezbe(ids)}
        />
      </div>
    );
  }

  const uOznacavanju = izbor !== null;
  const uSupersetu = izbor?.svrha === "superset";
  const brojBlokova = blokovi(vezbe).length;
  const ukupnoSerija = vezbe.reduce((z, x) => z + serijeVezbe(x), 0);
  const uradjenoSerija = vezbe.reduce((z, x) => z + Math.min(serijeVezbe(x), danas[x.id]?.length ?? 0), 0);
  const opisPlana = [jeSlobodan ? "Slobodan trening" : day?.day_name, `${uradjenoSerija} od ${ukupnoSerija} serija`]
    .filter(Boolean)
    .join(" · ");
  const prisutneNove = vezbe.filter((x) => noveVezbe.includes(x.id));
  const alatTreninga = "h-9 min-w-[132px] flex-1 whitespace-nowrap rounded-lg border border-hairline bg-surface-2 px-2.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 inline-flex items-center justify-center gap-1.5 transition";
  const izabranaVezba = izborSerije ? vezbe.find((x) => x.id === izborSerije.apeId) : undefined;

  return (
    <div className="space-y-1.5">
      {desktop && (
        <div className="pb-1">
          <div className="text-[12.5px] font-medium text-foreground tnum">{opisPlana}</div>
          {!izbor && (
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              Vežbač vidi izmene odmah. Prazna polja pokazuju cilj; posle potvrde ispravljaš urađeno.
            </p>
          )}
        </div>
      )}
      {/* Traka radnji nad celim treningom. Tri ulaza, svaki svoj: brisanje,
          superset, dodavanje. Superset je ranije bio unutar rezima brisanja, iza
          crvenog dugmeta - tehnicki je radio, ali ga niko nije nalazio. */}
      <div className={cn("flex items-center gap-1.5 pb-1", desktop && !izbor && "flex-wrap")}>
        {izbor ? (
          <>
            <button
              type="button"
              disabled={salje || izbor.ids.size < (uSupersetu ? 2 : 1)}
              onClick={() => void (uSupersetu ? spojiSuperset() : obrisiOznacene())}
              className={cn(
                "h-8 flex-1 rounded-lg text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40 transition",
                uSupersetu
                  ? "bg-primary text-primary-foreground"
                  : "bg-destructive text-destructive-foreground",
              )}
            >
              {salje ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                     : uSupersetu ? <Link2 className="h-3.5 w-3.5" strokeWidth={2.4} />
                                  : <Trash2 className="h-3.5 w-3.5" strokeWidth={2.4} />}
              {uSupersetu ? "Spoji" : "Obriši"} {izbor.ids.size > 0 ? izbor.ids.size : ""}
            </button>
            <button
              type="button"
              onClick={() => setIzbor(null)}
              className="h-8 px-3 rounded-lg bg-surface-2 text-[12.5px] font-semibold text-muted-foreground"
            >
              Otkaži
            </button>
          </>
        ) : desktop ? (
          // Racunar: sve radnje nad treningom su vidljive, sa istim nazivima kao
          // u meniju "Izmeni" na telefonu.
          <>
            <button type="button" onClick={() => (locked ? openLock() : setDodajem(true))} className={alatTreninga}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
              Dodaj vežbe
            </button>
            {brojBlokova >= 2 && (
              <button type="button" disabled={salje} onClick={() => (locked ? openLock() : setRedosled(true))} className={cn(alatTreninga, "disabled:opacity-50")}>
                <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={2.2} />
                Promeni redosled
              </button>
            )}
            {vezbe.length >= 2 && (
              <button type="button" onClick={() => (locked ? openLock() : setIzbor({ svrha: "superset", ids: new Set() }))} className={alatTreninga}>
                <Link2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                Spoji u superset
              </button>
            )}
            <button type="button" onClick={() => (locked ? openLock() : setIzbor({ svrha: "brisanje", ids: new Set() }))} className={alatTreninga}>
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
              Obriši vežbe
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setIzbor({ svrha: "brisanje", ids: new Set() })}
              className="h-8 flex-1 rounded-lg border border-hairline bg-surface-2 text-[12px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 transition"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
              Obriši
            </button>
            {/* Superset trazi bar dve vezbe u treningu. */}
            {vezbe.length >= 2 && (
              <button
                type="button"
                onClick={() => setIzbor({ svrha: "superset", ids: new Set() })}
                className="h-8 flex-1 rounded-lg border border-hairline bg-surface-2 text-[12px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 transition"
              >
                <Link2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                Superset
              </button>
            )}
            <button
              type="button"
              onClick={() => setDodajem(true)}
              className="h-8 flex-1 rounded-lg border border-hairline bg-surface-2 text-[12px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 transition"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
              Dodaj
            </button>
          </>
        )}
      </div>
      {izbor && (
        <p className="text-[11.5px] text-muted-foreground pb-1">
          {desktop
            ? uSupersetu ? "Od 2 do 5 vežbi, bez započetih" : "Započete vežbe ostaju"
            : uSupersetu
              ? "Označi dve ili više vežbi koje idu bez pauze između. Vežba u kojoj je serija već upisana ne može u krug."
              : "Označi vežbe koje sklanjaš iz današnjeg treninga."}
        </p>
      )}

      {desktop && !izbor && prisutneNove.length > 0 && (
        <GdeIdeNova
          nazivi={prisutneNove.map(imeVezbe)}
          mozePrvo={novRedosled(vezbe, noveVezbe, "prvo", tekuca) !== null}
          mozeSledeca={novRedosled(vezbe, noveVezbe, "sledeca", tekuca) !== null}
          disabled={salje}
          onPrvo={() => premesti(noveVezbe, "prvo")}
          onSledeca={() => premesti(noveVezbe, "sledeca")}
          onOstavi={() => setNoveVezbe([])}
        />
      )}

      {vezbe.map((ex, i) => {
        const ime = imeVezbe(ex);
        const istorija = prosliPut[ex.exercise_id];
        const danasnje = danas[ex.id] ?? [];
        const kardio = !!ex.exercise.is_duration_based;
        const poRuci = jePoRuci(ex);
        const brojSerija = serijeVezbe(ex);
        const upisanih = danasnje.length;
        const gotova = brojSerija > 0 && upisanih >= brojSerija;
        // Racunar cita iz upisanih serija: posle promene redosleda gotova vezba
        // moze da stoji i iza tekuce.
        const trenutna = desktop ? i === tekuca : currentIdx != null && i === currentIdx;
        const odradjena = desktop ? gotova : currentIdx != null && i < currentIdx;
        const otvorenaId = otvorena ?? (desktop ? tekucaId ?? undefined : currentIdx != null ? vezbe[currentIdx]?.id : undefined);
        const razvijena = otvorenaId === ex.id;
        const kolone = desktop ? KOLONE_RACUNAR : KOLONE;
        // Superset se crta kao JEDAN blok: oznaka stoji samo na prvoj vezbi kruga,
        // a clanovi se vezuju bocnom linijom.
        const ss = ex.superset_group ?? null;
        const prethodna = i > 0 ? vezbe[i - 1] : null;
        const sledeca = i + 1 < vezbe.length ? vezbe[i + 1] : null;
        const prviUKrugu = ss != null && prethodna?.superset_group !== ss;
        const poslednjiUKrugu = ss != null && sledeca?.superset_group !== ss;

        return (
          <div key={`w-${ex.id}`} className={cn(ss != null && "relative pl-3")}>
          {/* Bocna linija spaja clanove kruga u jednu celinu. */}
          {ss != null && (
            <span
              aria-hidden
              className={cn(
                "absolute left-0 w-[3px] bg-primary/40",
                prviUKrugu ? "top-6 rounded-t-full" : "top-0",
                poslednjiUKrugu ? "bottom-1 rounded-b-full" : "bottom-0",
              )}
            />
          )}
          {prviUKrugu && (
            <div className="flex items-center gap-1.5 pb-1 pt-0.5">
              <Link2 className="h-3 w-3 text-primary shrink-0" strokeWidth={2.6} />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                Superset
              </span>
              {!uOznacavanju && (
                <button
                  type="button"
                  disabled={salje}
                  onClick={() => void razdvojSuperset(ex.id)}
                  className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <Unlink className="h-3 w-3" strokeWidth={2.4} />
                  Razdvoji
                </button>
              )}
            </div>
          )}
          <div
            key={ex.id}
            className={cn(
              "rounded-xl border px-2.5 py-2 transition",
              trenutna
                ? "border-primary/40 bg-primary-soft"
                : "border-hairline bg-surface",
              odradjena && "opacity-55",
            )}
          >
            <div className="flex items-center gap-2.5">
              {izbor ? (
                // Vezba sa vec upisanom serijom se ne moze ni obrisati ni ubaciti
                // u krug (server je u oba slucaja odbija), pa se ne nudi.
                <button
                  type="button"
                  disabled={danasnje.length > 0}
                  onClick={() =>
                    setIzbor((st) => {
                      if (!st) return st;
                      const n = new Set(st.ids);
                      if (n.has(ex.id)) n.delete(ex.id);
                      // Superset prima najvise pet vezbi; sesta se ne oznacava.
                      else if (!desktop || st.svrha === "brisanje" || n.size < 5) n.add(ex.id);
                      return { ...st, ids: n };
                    })
                  }
                  aria-label={`Označi ${ime}`}
                  aria-pressed={izbor.ids.has(ex.id)}
                  className={cn(
                    "h-7 w-7 rounded-lg border-2 flex items-center justify-center shrink-0 transition",
                    danasnje.length > 0
                      ? "border-hairline bg-surface-2 opacity-40"
                      : izbor.ids.has(ex.id)
                        ? uSupersetu
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-destructive bg-destructive text-destructive-foreground"
                        : cn("border-hairline bg-surface", uSupersetu
                            ? "hover:border-primary/50"
                            : "hover:border-destructive/50"),
                  )}
                >
                  {izbor.ids.has(ex.id) && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  {desktop && danasnje.length > 0 && <Lock className="h-3 w-3 text-muted-foreground" strokeWidth={2.4} />}
                </button>
              ) : (
                <div
                  className={cn(
                    "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-bold tnum",
                    trenutna
                      ? "bg-gradient-brand text-white shadow-brand"
                      : "bg-surface-2 text-muted-foreground",
                  )}
                >
                  {odradjena ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </div>
              )}

              {/* Slicica, ime, cilj I STRELICA su u ISTOM dugmetu. Ranije je
                  strelica stajala pored njega, pa je tap bas po njoj - a ona
                  najvise i lici na "otvori" - padao u prazno.
                  Cilj se odavde ne menja: dugme u dugmetu nije ispravan HTML,
                  pa cilj ide kroz polja u mrezi. */}
              <button
                type="button"
                disabled={uOznacavanju}
                onClick={() => setOtvorena(razvijena ? "" : ex.id)}
                aria-expanded={razvijena}
                className="flex-1 min-w-0 flex items-center gap-2.5 text-left disabled:cursor-default"
              >
                {ex.exercise.thumbnail_url ? (
                  <img
                    src={ex.exercise.thumbnail_url}
                    alt=""
                    loading="lazy"
                    className="h-9 w-9 rounded-lg object-cover bg-surface-2 shrink-0"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
                    <Dumbbell className="h-4 w-4 text-muted-foreground/60" />
                  </div>
                )}

                <span className="flex-1 min-w-0">
                <div
                  className={cn(
                    "text-[13.5px] font-semibold truncate",
                    trenutna && "text-primary-soft-foreground",
                  )}
                >
                  {ime}
                </div>
                <div className="text-[11.5px] text-muted-foreground truncate tnum">
                  {ciljTekst(ex)}
                  {/* Samo kad je sklopljena - otvorena vezba brojac ima u mrezi,
                      a ovde bi samo odsekao cilj sa tri tackice. */}
                  {!desktop && !razvijena && !kardio && upisanih > 0 && (
                    <span className="text-success-soft-foreground font-semibold">
                      {" · "}{upisanih}/{brojSerija} upisano
                    </span>
                  )}
                </div>
                </span>

                {/* Racunar: oznake i stanje vezbe, isto kao desna strana kartice na telefonu. */}
                {desktop && (
                  <span className="flex shrink-0 items-center gap-1.5">
                    {ss != null && (
                      <span className="rounded-full bg-sky-400/15 px-2 py-0.5 text-[10.5px] font-semibold text-sky-300">Superset</span>
                    )}
                    {poRuci && (
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10.5px] font-semibold text-primary-soft-foreground">2×</span>
                    )}
                    {gotova ? (
                      <CheckCircle2 className="h-[18px] w-[18px] text-success" strokeWidth={2.4} aria-label="Vežba je gotova" />
                    ) : trenutna ? (
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary-soft-foreground">Sad</span>
                    ) : (
                      <span className="text-[11.5px] font-semibold tnum text-muted-foreground">{upisanih}/{brojSerija}</span>
                    )}
                  </span>
                )}

                {!uOznacavanju && (
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform",
                      razvijena && "rotate-180",
                    )}
                    strokeWidth={2.4}
                  />
                )}
              </button>

              {/* Zamena se nudi samo za vezbe koje jos nisu odradjene - menjanje
                  zavrsene vezbe bi prepisalo ono sto je vezbac vec uradio.
                  Dugme nosi i rec, ne samo ikonicu: gola strelica se ne cita kao
                  "zameni vezbu" i trener je ne prepozna. */}
              {razvijena && !uOznacavanju && (desktop ? danasnje.length === 0 : !odradjena) && (
                <button
                  type="button"
                  onClick={() => (locked ? openLock() : setMenjam(ex.id))}
                  disabled={salje}
                  aria-label={`Zameni vežbu ${ime}`}
                  className="h-8 shrink-0 rounded-lg border border-hairline bg-surface-2 px-2.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition disabled:opacity-50"
                >
                  <Repeat2 className="h-3.5 w-3.5" strokeWidth={2.4} />
                  Zameni
                </button>
              )}

              {desktop && razvijena && !uOznacavanju && (
                <PomeriMeni
                  vezbe={vezbe}
                  vezba={ex}
                  tekuca={tekuca}
                  disabled={salje}
                  onPremesti={(mesto) => premesti([ex.id], mesto)}
                  onCeoRedosled={() => (locked ? openLock() : setRedosled(true))}
                />
              )}

            </div>

            {desktop && razvijena && !uOznacavanju && kardio && (
              <div className="mt-2 flex items-center justify-between gap-2 pl-[38px]">
                <span className="text-[11.5px] text-muted-foreground">Vežba na vreme: vežbač beleži trajanje sam.</span>
                {ss != null && (
                  <button
                    type="button"
                    disabled={salje}
                    onClick={() => void razdvojSuperset(ex.id)}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-[12px] font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                  >
                    <Scissors className="h-3.5 w-3.5" strokeWidth={2.4} />
                    Razdvoji
                  </button>
                )}
              </div>
            )}

            {/* Kardio nema mrezu, pa mu prosli put stoji ovde. */}
            {kardio && istorija?.performed_at && istorija.sets.length > 0 && (
              <div className="mt-1.5 flex items-start gap-1.5 pl-[38px]">
                <History className="h-3 w-3 text-muted-foreground shrink-0 mt-[3px]" strokeWidth={2.2} />
                <div className="flex flex-wrap gap-1">
                  {istorija.sets.map((s2) => (
                    <span key={s2.set_number} className="inline-flex items-center rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium tnum text-muted-foreground">
                      {setTekst(s2, poRuciSerije(s2, istorija))}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* MREZA: jedan red po seriji - sta je bilo prosli put, i sta je
                danas dignuto. Trener upisuje u BILO KOJU celiju, i pre i posle
                zavrsetka treninga; cekiranje ne dira vezbacev tempo.
                Kardio se meri minutima i po okidacu ima tacno jednu seriju, pa
                za njega mreza nema smisla - ostaje samo cilj. */}
            {razvijena && !uOznacavanju && !kardio && (
              <div className="mt-2.5 pl-[38px]">
                <div className={cn(kolone, "pb-1 text-[9.5px] uppercase tracking-wider font-semibold text-muted-foreground")}>
                  <span />
                  <span>Prošli put</span>
                  <span className="text-center">{poRuci ? "2× kg" : "Kg"}</span>
                  <span className="text-center">Pon.</span>
                  <span />
                  {desktop && <span />}
                </div>

                {Array.from({ length: brojSerija }, (_, k) => k + 1).map((sn) => {
                  const upisana = danasnje.find((d) => d.set_number === sn);
                  const c = ex.set_details?.find((d) => d.set_number === sn);
                  const pro = istorija?.sets.find((d) => d.set_number === sn);
                  const kljuc = `${ex.id}:${sn}`;
                  const vKg = unos[kljuc]?.kg
                    ?? (upisana?.weight_kg != null ? String(Number(upisana.weight_kg)) : "");
                  const vReps = unos[kljuc]?.reps
                    ?? (upisana?.reps != null ? String(upisana.reps) : "");
                  return (
                    <div key={sn} className={cn(kolone, "py-[3px]")}>
                      {desktop ? (
                        // Broj serije otvara tip serije i uklanjanje (samo trener).
                        <button
                          type="button"
                          disabled={salje}
                          onClick={() => (locked ? openLock() : setIzborSerije({ apeId: ex.id, broj: sn }))}
                          aria-label={`${opisSerije(sn, c?.set_type)}. Tip serije ili uklanjanje serije`}
                          title="Tip serije"
                          className={cn(
                            "h-8 w-8 rounded-lg border border-hairline bg-surface-2 text-[12.5px] font-bold transition hover:border-primary/50 hover:bg-surface-3 disabled:opacity-50",
                            upisana ? "text-success" : "text-muted-foreground",
                          )}
                        >
                          <OznakaSerije broj={sn} tip={c?.set_type} />
                        </button>
                      ) : (
                        <span className="text-[12.5px] font-bold tnum">{sn}</span>
                      )}
                      <span className="text-[11px] tnum text-muted-foreground truncate">
                        {pro ? setTekst(pro, poRuciSerije(pro, istorija)) : "-"}
                      </span>
                      <Input
                        value={vKg}
                        onChange={(e) => postaviCeliju(kljuc, "kg", e.target.value)}
                        onBlur={() => void sacuvajCeliju(ex, sn, upisana)}
                        inputMode="decimal"
                        placeholder={c?.weight_kg != null ? String(Number(c.weight_kg)) : "-"}
                        aria-label={poRuci ? `Kilaža po ruci, serija ${sn}` : `Kilaža, serija ${sn}`}
                        className="h-8 px-1 text-[12.5px] text-center tnum"
                      />
                      <Input
                        value={vReps}
                        onChange={(e) => postaviCeliju(kljuc, "reps", e.target.value)}
                        onBlur={() => void sacuvajCeliju(ex, sn, upisana)}
                        inputMode="numeric"
                        placeholder={c?.reps ?? "-"}
                        aria-label={`Ponavljanja, serija ${sn}`}
                        className="h-8 px-1 text-[12.5px] text-center tnum"
                      />
                      {/* Zeleno pali vezbac svojim klikom, a trener sme da potvrdi
                          umesto njega kad zaboravi. Tap POMERA vezbaca na sledecu
                          seriju - pozicija se racuna iz zavrsenih serija - pa se
                          skida samo ono sto je trener sam obelezio. Tackica znaci
                          da je iza serije stao trener (obelezio je ili ispravio
                          brojeve). */}
                      <button
                        type="button"
                        disabled={salje || (!!upisana && !(desktop ? upisana.created_by_trainer === true : upisana.logged_by_trainer))}
                        onClick={() => void potvrdiOdradjeno(ex, sn, !upisana)}
                        aria-label={
                          upisana
                            ? `Serija ${sn} odrađena${upisana.logged_by_trainer ? ", skini potvrdu" : ""}`
                            : `Potvrdi da je serija ${sn} odrađena`
                        }
                        aria-pressed={!!upisana}
                        className={cn(
                          "relative h-8 w-8 rounded-lg flex items-center justify-center transition",
                          upisana
                            ? "bg-success text-success-foreground"
                            : "bg-surface-2 text-muted-foreground/30 hover:text-success hover:bg-success-soft",
                          "disabled:cursor-default",
                        )}
                      >
                        <Check className="h-4 w-4" strokeWidth={3} />
                        {upisana?.logged_by_trainer && (
                          <span className="absolute h-1.5 w-1.5 rounded-full bg-current opacity-70 translate-x-[11px] -translate-y-[11px]" />
                        )}
                      </button>
                      {/* Na telefonu se serija brise prevlacenjem ulevo; na racunaru je to ovo dugme. */}
                      {desktop && (
                        <button
                          type="button"
                          disabled={salje || brojSerija <= 1}
                          onClick={() => void ukloniSeriju(ex.id, sn)}
                          aria-label={`Ukloni seriju ${sn}`}
                          title="Ukloni seriju"
                          className="grid h-8 w-7 place-items-center rounded-lg text-muted-foreground/70 transition hover:bg-destructive-soft hover:text-destructive disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground/70"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                        </button>
                      )}
                    </div>
                  );
                })}

                {desktop && istorija?.best_weight_kg != null && Number(istorija.best_weight_kg) > 0 && (
                  <div className="flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground tnum">
                    <Trophy className="h-3 w-3 shrink-0 text-warning" strokeWidth={2.2} />
                    Rekord {Number(istorija.best_weight_kg)} kg
                    {istorija.performed_at ? ` · prošli put ${datumKratko(istorija.performed_at)}` : ""}
                  </div>
                )}

                {/* Cela vezba odjednom - za slucaj kad vezbac zaboravi da klikne,
                    a trener stoji pored njega. Skidanje se nudi samo ako je sve
                    zeleno stavio trener; vezbacev rad se odavde ne brise. */}
                {(() => {
                  const sveUpisane = brojSerija > 0 && danasnje.length >= brojSerija;
                  if (desktop) {
                    const trenerove = danasnje.filter((d) => d.created_by_trainer === true);
                    return (
                      <button
                        type="button"
                        disabled={salje || (sveUpisane && trenerove.length === 0)}
                        onClick={() => void potvrdiOdradjeno(ex, null, !sveUpisane)}
                        className={cn(
                          "mt-2 h-9 w-full rounded-lg text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 transition disabled:opacity-60",
                          sveUpisane
                            ? "bg-surface-2 text-muted-foreground enabled:hover:text-foreground"
                            : "bg-success-soft text-success-soft-foreground hover:opacity-90",
                        )}
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={2.8} />
                        {sveUpisane
                          ? trenerove.length === 0 ? "Vežbač je uradio sve serije" : "Skini tvoje potvrde"
                          : "Označi celu vežbu kao urađenu"}
                      </button>
                    );
                  }
                  const sveTrenerove =
                    danasnje.length > 0 && danasnje.every((d) => d.logged_by_trainer);
                  if (sveUpisane && !sveTrenerove) return null;
                  return (
                    <button
                      type="button"
                      disabled={salje}
                      onClick={() => void potvrdiOdradjeno(ex, null, !sveUpisane)}
                      className={cn(
                        "mt-2 h-9 w-full rounded-lg text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition disabled:opacity-50",
                        sveUpisane
                          ? "bg-surface-2 text-muted-foreground hover:text-foreground"
                          : "bg-success-soft text-success-soft-foreground hover:opacity-90",
                      )}
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={2.8} />
                      {sveUpisane ? "Skini potvrdu za celu vežbu" : "Cela vežba je urađena"}
                    </button>
                  );
                })()}

                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={salje}
                    onClick={() => void dodajSeriju(ex, brojSerija + 1)}
                    className="h-9 flex-1 rounded-lg bg-surface-2 text-[12px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
                    Dodaj seriju
                  </button>
                  {/* Pauza posle ove vezbe. Clan superset kruga koji nije
                      poslednji svakako ide bez pauze, pa se polje tu ne nudi. */}
                  {desktop && ss != null && (
                    <button
                      type="button"
                      disabled={salje}
                      onClick={() => void razdvojSuperset(ex.id)}
                      className="h-9 shrink-0 rounded-lg bg-surface-2 px-2.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition disabled:opacity-50"
                    >
                      <Scissors className="h-3.5 w-3.5" strokeWidth={2.4} />
                      Razdvoji
                    </button>
                  )}
                  {(desktop || !(ss != null && !poslednjiUKrugu)) && (
                    <label className="h-9 rounded-lg bg-surface-2 px-2 inline-flex items-center gap-1.5 shrink-0">
                      <Timer className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={2.2} />
                      <Input
                        value={pauza[ex.id] ?? String(trenutnaPauza(ex) ?? "")}
                        onChange={(e) => setPauza((s) => ({ ...s, [ex.id]: e.target.value }))}
                        onBlur={() => void sacuvajPauzu(ex)}
                        inputMode="numeric"
                        aria-label={`Pauza posle vežbe ${ime}, u sekundama`}
                        className="h-7 w-12 px-1 text-[12.5px] text-center tnum border-0 bg-transparent"
                      />
                      <span className="text-[11.5px] text-muted-foreground">s</span>
                    </label>
                  )}
                </div>

                {/* Dve tegle (bucice): upisuje se kilaza jedne ruke, a volumen je
                    broji duplo. Vazi samo za danasnji trening, kao i pauza. */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={poRuci}
                  disabled={salje}
                  onClick={() => void postaviPoRuci(ex, !poRuci)}
                  className={cn(
                    "mt-1.5 h-9 w-full rounded-lg px-2.5 inline-flex items-center gap-2 text-[12px] font-semibold transition disabled:opacity-50",
                    poRuci
                      ? "bg-primary-soft text-primary-soft-foreground"
                      : "bg-surface-2 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "h-4 w-4 shrink-0 rounded-[5px] border flex items-center justify-center transition",
                      poRuci ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50",
                    )}
                  >
                    {poRuci && <Check className="h-3 w-3" strokeWidth={3.2} />}
                  </span>
                  <span className="whitespace-nowrap">2× (po ruci)</span>
                  {poRuci && (
                    <span className="ml-auto whitespace-nowrap text-[11px] font-medium opacity-80">
                      broji se duplo
                    </span>
                  )}
                </button>
              </div>
            )}

          </div>
          </div>
        );
      })}

      {/* Isti birac vezbi kao u builderu, u rezimu zamene (onPick) - bira se
          jedna vezba i vraca ovamo umesto da se dodaje u dan. */}
      {/* Dodavanje novih vezbi na kraj treninga - obican (visestruki) rezim
          biraca, isti kao u builderu. */}
      <ExercisePickerSheet
        open={dodajem}
        dayId={dayId}
        dayName={day?.day_name ?? "Trening"}
        table="assigned_program_exercises"
        onClose={() => setDodajem(false)}
        onAdded={() => setDodajem(false)}
        onPickMany={(ids) => void dodajVezbe(ids)}
      />

      <ExercisePickerSheet
        open={menjam !== null}
        dayId={dayId}
        dayName={desktop && menjam
          ? `Zamena: ${(() => { const v = vezbe.find((x) => x.id === menjam); return v ? imeVezbe(v) : "vežba"; })()}`
          : "Zameni vežbu"}
        table="assigned_program_exercises"
        onClose={() => setMenjam(null)}
        onAdded={() => setMenjam(null)}
        onPick={(exerciseId) => void zameni(exerciseId)}
      />

      {desktop && izborSerije && izabranaVezba && (
        <IzborTipaSerije
          broj={izborSerije.broj}
          tip={izabranaVezba.set_details?.find((s) => s.set_number === izborSerije.broj)?.set_type}
          mozeUkloniti={serijeVezbe(izabranaVezba) > 1}
          onIzaberi={(tip) => postaviTip(izabranaVezba.id, izborSerije.broj, tip)}
          onUkloni={() => void ukloniSeriju(izabranaVezba.id, izborSerije.broj)}
          onClose={() => setIzborSerije(null)}
        />
      )}

      {desktop && redosled && (
        <RedosledUzivo
          vezbe={vezbe.map((x) => ({
            id: x.id,
            exercise_id: x.exercise_id,
            superset_group: x.superset_group,
            naziv: imeVezbe(x),
            slika: x.exercise.thumbnail_url,
          }))}
          napredak={(x) => {
            const v = vezbe.find((y) => y.id === x.id);
            return { uradjeno: danas[x.id]?.length ?? 0, ukupno: v ? serijeVezbe(v) : 0 };
          }}
          onSacuvaj={(ids) => {
            const poId = new Map(vezbe.map((x) => [x.id, x]));
            return postaviRedosled(ids.flatMap((id) => poId.get(id) ?? []));
          }}
          onClose={() => setRedosled(false)}
        />
      )}
    </div>
  );
};

export default LiveWorkoutPlan;
