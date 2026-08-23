import { useEffect, useState } from "react";
import { Check, Link2, Loader2, Plus, Trash2, Unlink, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { porukaGreske } from "@/lib/errorMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FullScreenSheet,
  FullScreenSheetScroll,
  FullScreenSheetFooter,
} from "@/components/ui/full-screen-sheet";
import { ExercisePickerSheet } from "@/components/exercises/ExercisePickerSheet";

type Serija = { reps: string; kg: string };
type Vezba = {
  /** Kljuc reda. Ista vezba sme da se pojavi dvaput, pa exercise_id nije kljuc. */
  rid: string;
  exercise_id: string;
  naziv: string;
  /** Vezba na minute (trcanje, traka): jedna stavka sa minutima umesto serija. */
  kardio: boolean;
  minuti: string;
  serije: Serija[];
  /** NULL = obicna vezba. Isti broj = jedan superset krug. */
  superset: number | null;
};

/** Najvise vezbi po treningu - ista granica kao na serveru. */
const MAX_VEZBI = 30;
/** Najvise serija po vezbi - ista granica kao na serveru. */
const MAX_SERIJA = 12;

const broj = (t: string): number | null => {
  const v = t.trim().replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Ceo broj u zadatom opsegu. Server kastuje ova polja u int - decimala ga obara. */
const ceoUOpsegu = (t: string, min: number, max: number): boolean => {
  const n = broj(t);
  return n != null && Number.isInteger(n) && n >= min && n <= max;
};

/**
 * Pusta krugove koji vise nisu krugovi.
 *
 * Dva pravila, oba nauceni na tudjoj steti:
 *  - krug od jednog clana nije krug (ostane posle brisanja vezbe);
 *  - UZASTOPNOST JE INVARIJANTA. Kad se srednji clan kruga od tri izvuce u novi
 *    krug, preostala dva i dalje nose istu grupu ali vise nisu jedan uz drugog:
 *    prikaz bi nacrtao dve odvojene oznake "Superset" iznad po jedne vezbe, a
 *    server bi upis odbio. Isto pravilo stoji i u builderu.
 */
const ocistiKrugove = (s: Vezba[]): Vezba[] => {
  const indeksi = new Map<number, number[]>();
  s.forEach((v, i) => {
    if (v.superset != null) indeksi.set(v.superset, [...(indeksi.get(v.superset) ?? []), i]);
  });
  const puknute = new Set<number>();
  for (const [g, idx] of indeksi) {
    if (idx.length < 2 || idx[idx.length - 1] - idx[0] !== idx.length - 1) puknute.add(g);
  }
  if (!puknute.size) return s;
  return s.map((v) => (v.superset != null && puknute.has(v.superset) ? { ...v, superset: null } : v));
};

/**
 * Trener upisuje ceo trening umesto vezbaca koji nije poneo telefon.
 *
 * Ovo NIJE mesanje u zivi trening. Sesija koju pravi trainer_create_past_workout
 * je zavrsena od rodjenja (is_active = false, bez reda u workout_live_state), pa
 * je nijedan zivi RPC ne moze ni dohvatiti, a ni telefon ni sat nikad ne saznaju
 * za nju. Server uz to odbija upis dok vezbac bas tada trenira.
 *
 * Vreme i trajanje se NE unose. Trener zapisuje STA je vezbac radio, ne kad i
 * koliko; server uzima trenutak upisa, a trajanje ostaje prazno umesto da se
 * izmisljaju minuti koje niko nije merio.
 */
export const UpisTreninga = ({
  open,
  onClose,
  athleteId,
  athleteName,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  athleteId: string;
  athleteName: string | null;
  onSaved: () => void;
}) => {
  const [naslov, setNaslov] = useState("");
  const [vezbe, setVezbe] = useState<Vezba[]>([]);
  const [biram, setBiram] = useState(false);
  const [salje, setSalje] = useState(false);
  /** Skup oznacenih redova dok trener sastavlja krug; null = nije u tom rezimu. */
  const [spajam, setSpajam] = useState<Set<string> | null>(null);

  // Komponenta ostaje montirana dok je sheet zatvoren, pa se useState inicijalizator
  // otkuca tacno jednom - u trenutku kad se profil ucitao. Zato se forma resetuje na
  // svako OTVARANJE: trener koji odustane pa se kasnije vrati ne sme da zatekne
  // stare vezbe i stari naziv.
  useEffect(() => {
    if (!open) return;
    setNaslov("");
    setVezbe([]);
    setBiram(false);
    setSalje(false);
    setSpajam(null);
  }, [open]);

  const dodajVezbe = async (ids: string[]) => {
    setBiram(false);
    if (!ids.length) return;
    // Greska se NE gura pod tepih: bez naziva bi sve vezbe pisale "Vežba" i
    // trener ne bi znao sta je dodao, a upis bi svejedno prosao.
    const { data, error } = await supabase
      .from("exercises")
      .select("id, name, name_en, is_duration_based")
      .in("id", ids);
    if (error || !data) {
      toast.error("Nije uspelo učitavanje vežbi, probaj ponovo");
      return;
    }
    const red = data as Array<{
      id: string; name: string; name_en: string | null; is_duration_based: boolean | null;
    }>;
    setVezbe((s) => {
      const mesta = MAX_VEZBI - s.length;
      if (mesta <= 0) {
        toast.error(`Najviše ${MAX_VEZBI} vežbi po treningu`);
        return s;
      }
      if (ids.length > mesta) toast.info(`Dodato prvih ${mesta} - najviše ${MAX_VEZBI} vežbi po treningu`);
      return [
        ...s,
        ...ids.slice(0, mesta).map((id) => {
          const e = red.find((x) => x.id === id);
          return {
            rid: crypto.randomUUID(),
            exercise_id: id,
            naziv: e?.name ?? e?.name_en ?? "Vežba",
            kardio: !!e?.is_duration_based,
            minuti: "20",
            serije: [{ reps: "10", kg: "" }, { reps: "10", kg: "" }, { reps: "10", kg: "" }],
            superset: null,
          };
        }),
      ];
    });
  };

  const promeniSeriju = (vi: number, si: number, polje: keyof Serija, v: string) =>
    setVezbe((s) =>
      s.map((ex, i) =>
        i !== vi ? ex : { ...ex, serije: ex.serije.map((r, j) => (j !== si ? r : { ...r, [polje]: v })) },
      ),
    );

  const dodajSeriju = (vi: number) =>
    setVezbe((s) =>
      s.map((ex, i) => {
        if (i !== vi) return ex;
        if (ex.serije.length >= MAX_SERIJA) {
          toast.error(`Najviše ${MAX_SERIJA} serija po vežbi`);
          return ex;
        }
        return { ...ex, serije: [...ex.serije, { ...(ex.serije.at(-1) ?? { reps: "10", kg: "" }) }] };
      }),
    );

  const obrisiSeriju = (vi: number, si: number) =>
    setVezbe((s) =>
      s.map((ex, i) => (i !== vi ? ex : { ...ex, serije: ex.serije.filter((_, j) => j !== si) })),
    );

  const obrisiVezbu = (vi: number) =>
    setVezbe((s) => ocistiKrugove(s.filter((_, i) => i !== vi)));

  const oznaci = (rid: string) =>
    setSpajam((st) => {
      if (!st) return st;
      const n = new Set(st);
      if (n.has(rid)) n.delete(rid); else n.add(rid);
      return n;
    });

  /**
   * UZASTOPNOST JE INVARIJANTA: krug se crta preko suseda, i server ga takvog
   * trazi. Zato spajanje ne samo da oznaci vezbe nego ih i PREMESTI jednu uz
   * drugu, na mesto prve od njih - isto kao u builderu i uzivo.
   */
  const spojiSuperset = () => {
    if (!spajam || spajam.size < 2) return;
    const izabrane = spajam;
    setVezbe((s) => {
      const grupa = Math.max(0, ...s.map((v) => v.superset ?? 0)) + 1;
      const prvi = s.findIndex((v) => izabrane.has(v.rid));
      if (prvi < 0) return s;
      const clanovi = s.filter((v) => izabrane.has(v.rid)).map((v) => ({ ...v, superset: grupa }));
      const ostali = s.filter((v) => !izabrane.has(v.rid));
      // Koliko NEizabranih stoji pre prvog izabranog - tu se krug umece.
      const koliko = s.slice(0, prvi).filter((v) => !izabrane.has(v.rid)).length;
      return ocistiKrugove([...ostali.slice(0, koliko), ...clanovi, ...ostali.slice(koliko)]);
    });
    setSpajam(null);
  };

  const razdvojSuperset = (grupa: number) =>
    setVezbe((s) => s.map((v) => (v.superset === grupa ? { ...v, superset: null } : v)));

  const sacuvaj = async () => {
    if (!vezbe.length) { toast.error("Dodaj bar jednu vežbu"); return; }
    if (vezbe.some((v) => !v.kardio && v.serije.length === 0)) {
      toast.error("Svaka vežba mora imati bar jednu seriju");
      return;
    }
    // Minuti moraju biti CEO broj u opsegu: server ih kastuje u int, pa bi "20,5"
    // srusio ceo upis porukom koja ne kaze ni koje je polje krivo.
    const losMin = vezbe.find((v) => v.kardio && !ceoUOpsegu(v.minuti, 1, 600));
    if (losMin) {
      toast.error(`Minuti za "${losMin.naziv}" moraju biti ceo broj između 1 i 600`);
      return;
    }
    const losReps = vezbe.find(
      (v) => !v.kardio && v.serije.some((r) => r.reps.trim() !== "" && !ceoUOpsegu(r.reps, 1, 999)),
    );
    if (losReps) {
      toast.error(`Ponavljanja za "${losReps.naziv}" moraju biti ceo broj između 1 i 999`);
      return;
    }

    setSalje(true);
    try {
      const { error } = await supabase.rpc("trainer_create_past_workout" as any, {
        p_athlete_id: athleteId,
        // Kardio ide kao TACNO jedna stavka sa minutima - triger na serveru svakako
        // pribija sets na 1, pa bi tri serije bile tiho progutane.
        p_exercises: vezbe.map((v) => ({
          exercise_id: v.exercise_id,
          superset_group: v.superset,
          sets: v.kardio
            ? [{ duration_minutes: Math.round(broj(v.minuti) as number) }]
            : v.serije.map((r) => ({
                reps: r.reps.trim() === "" ? null : Math.round(broj(r.reps) as number),
                weight_kg: broj(r.kg),
              })),
        })),
        p_title: naslov.trim() || null,
      });
      if (error) { toast.error(porukaGreske(error)); return; }
    } finally {
      // U finally: bilo koji neocekivan izuzetak inace ostavlja dugme zauvek
      // zakljucano, jer "salje" nema drugog mesta gde se gasi.
      setSalje(false);
    }

    toast.success("Trening upisan");
    setVezbe([]); setNaslov("");
    onSaved();
    onClose();
  };

  const uSpajanju = spajam != null;

  return (
    <>
    <FullScreenSheet
      open={open}
      // Sakriva se dok se bira vezba. Birac je Radix Sheet na z-50, a ovaj sloj je
      // z-100 i neproziran - da ostane vidljiv, birac bi bio i nevidljiv i bez
      // dodira. Sakriven (a ne ugasen) zato sto gasenje skida DOM: skrol bi skakao
      // na vrh posle svakog dodavanja vezbe, a dugme "Dodaj vezbe" je na dnu.
      hidden={biram}
      onClose={onClose}
      title={athleteName ? `Upiši trening - ${athleteName}` : "Upiši trening"}
    >
      <FullScreenSheetScroll className="pt-5 space-y-4">
        <p className="text-[12.5px] text-muted-foreground">
          Za trening koji je vežbač odradio bez telefona. Videće ga u svojoj istoriji,
          sa današnjim datumom. Lični rekordi se iz ovakvog treninga ne računaju.
        </p>

        <div>
          <Label htmlFor="naslov">Naziv (opciono)</Label>
          <Input
            id="naslov"
            value={naslov}
            onChange={(e) => setNaslov(e.target.value)}
            placeholder="npr. Noge u sali"
            className="mt-1.5"
          />
        </div>

        {/* Superset: trener oznaci dve ili vise vezbi i spoji ih u krug. */}
        {vezbe.length >= 2 && (
          <div className="flex items-center gap-1.5">
            {spajam ? (
              <>
                <button
                  type="button"
                  disabled={spajam.size < 2}
                  onClick={spojiSuperset}
                  className="h-8 flex-1 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40 transition"
                >
                  <Link2 className="h-3.5 w-3.5" strokeWidth={2.4} />
                  Spoji {spajam.size >= 2 ? spajam.size : ""}
                </button>
                <button
                  type="button"
                  onClick={() => setSpajam(null)}
                  className="h-8 px-3 rounded-lg bg-surface-2 text-[12px] font-semibold text-muted-foreground"
                >
                  Otkaži
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setSpajam(new Set())}
                className="h-8 rounded-lg border border-hairline bg-surface-2 px-3 text-[12px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition"
              >
                <Link2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                Napravi superset
              </button>
            )}
          </div>
        )}

        {vezbe.map((v, vi) => {
          const ss = v.superset;
          const prviUKrugu = ss != null && (vezbe[vi - 1]?.superset ?? null) !== ss;
          const poslednjiUKrugu = ss != null && (vezbe[vi + 1]?.superset ?? null) !== ss;
          const oznacena = !!spajam?.has(v.rid);
          return (
          <div key={v.rid} className={ss != null ? "relative pl-3" : undefined}>
            {ss != null && (
              <span
                aria-hidden
                className={`absolute left-0 w-[3px] bg-primary/40 ${prviUKrugu ? "top-6 rounded-t-full" : "-top-4"} ${poslednjiUKrugu ? "bottom-0 rounded-b-full" : "-bottom-4"}`}
              />
            )}
            {prviUKrugu && (
              <div className="flex items-center gap-1.5 pb-1">
                <Link2 className="h-3 w-3 text-primary shrink-0" strokeWidth={2.6} />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                  Superset
                </span>
                {!uSpajanju && (
                  <button
                    type="button"
                    onClick={() => razdvojSuperset(ss)}
                    className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <Unlink className="h-3 w-3" strokeWidth={2.4} />
                    Razdvoji
                  </button>
                )}
              </div>
            )}

            <div className="rounded-xl border border-hairline bg-surface p-3">
              <div className="flex items-center gap-2 mb-2">
                {uSpajanju && (
                  <button
                    type="button"
                    onClick={() => oznaci(v.rid)}
                    aria-label={`Označi ${v.naziv}`}
                    aria-pressed={oznacena}
                    className={`shrink-0 h-7 w-7 rounded-lg border-2 flex items-center justify-center transition ${oznacena ? "border-primary bg-primary text-primary-foreground" : "border-hairline bg-surface"}`}
                  >
                    {oznacena && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </button>
                )}
                <div className="flex-1 min-w-0 text-[14px] font-semibold truncate">{v.naziv}</div>
                {!uSpajanju && (
                  <button
                    type="button"
                    onClick={() => obrisiVezbu(vi)}
                    aria-label={`Ukloni ${v.naziv}`}
                    className="h-8 w-8 rounded-lg bg-surface-2 text-muted-foreground inline-flex items-center justify-center"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {v.kardio ? (
                // Vezba na minute: jedno polje, bez serija i kilaze. Server za nju
                // trazi tacno jednu stavku sa minutima.
                <div>
                  <Label
                    htmlFor={`min-${v.rid}`}
                    className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                  >
                    Minuti
                  </Label>
                  <Input
                    id={`min-${v.rid}`}
                    value={v.minuti}
                    onChange={(e) =>
                      setVezbe((s) => s.map((ex, i) => (i !== vi ? ex : { ...ex, minuti: e.target.value })))
                    }
                    inputMode="numeric"
                    placeholder="npr. 20"
                    className="mt-1 h-9 text-[13px] tnum"
                  />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-[24px_1fr_1fr_32px] gap-2 items-center pb-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    <span />
                    <span className="text-center">Ponav.</span>
                    <span className="text-center">Kg</span>
                    <span />
                  </div>

                  {v.serije.map((r, si) => (
                    <div key={si} className="grid grid-cols-[24px_1fr_1fr_32px] gap-2 items-center py-0.5">
                      <span className="text-[12.5px] font-bold tnum">{si + 1}</span>
                      <Input
                        value={r.reps}
                        onChange={(e) => promeniSeriju(vi, si, "reps", e.target.value)}
                        inputMode="numeric"
                        aria-label={`Ponavljanja, serija ${si + 1}`}
                        className="h-9 px-1 text-[13px] text-center tnum"
                      />
                      <Input
                        value={r.kg}
                        onChange={(e) => promeniSeriju(vi, si, "kg", e.target.value)}
                        inputMode="decimal"
                        placeholder="-"
                        aria-label={`Kilaža, serija ${si + 1}`}
                        className="h-9 px-1 text-[13px] text-center tnum"
                      />
                      <button
                        type="button"
                        onClick={() => obrisiSeriju(vi, si)}
                        aria-label={`Obriši seriju ${si + 1}`}
                        className="h-8 w-8 rounded-lg text-muted-foreground/60 hover:text-destructive inline-flex items-center justify-center"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => dodajSeriju(vi)}
                    className="mt-2 h-9 w-full rounded-lg bg-surface-2 text-[12px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 transition"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
                    Dodaj seriju
                  </button>
                </>
              )}
            </div>
          </div>
          );
        })}

        <button
          type="button"
          onClick={() => setBiram(true)}
          className="h-11 w-full rounded-xl border border-hairline bg-surface-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 transition"
        >
          <Plus className="h-4 w-4" strokeWidth={2.4} />
          Dodaj vežbe
        </button>
      </FullScreenSheetScroll>

      <FullScreenSheetFooter>
        <Button
          onClick={() => void sacuvaj()}
          disabled={salje || !vezbe.length}
          className="w-full bg-gradient-brand text-white shadow-brand"
        >
          {salje ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Upiši trening
        </Button>
      </FullScreenSheetFooter>

    </FullScreenSheet>

    {/* Brat, ne dete - vidi komentar uz hidden gore. Montira se tek uz otvoren
        sheet: njegovi hookovi ne zavise od open propa, pa bi trajno montiran
        povlacio biblioteku vezbi na svako otvaranje profila vezbaca. */}
    {open && (
    <ExercisePickerSheet
      open={biram}
      dayId={null}
      dayName={athleteName ?? "Trening"}
      bareDayName
      table="assigned_program_exercises"
      onClose={() => setBiram(false)}
      onAdded={() => setBiram(false)}
      onPickMany={(ids) => void dodajVezbe(ids)}
    />
    )}
    </>
  );
};

export default UpisTreninga;
