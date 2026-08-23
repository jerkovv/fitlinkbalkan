import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
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
  exercise_id: string;
  naziv: string;
  /** Vezba na minute (trcanje, traka): jedna stavka sa minutima umesto serija. */
  kardio: boolean;
  minuti: string;
  serije: Serija[];
};

/** Najvise vezbi po treningu - ista granica kao na serveru. */
const MAX_VEZBI = 30;

/** Lokalno vreme u obliku koji trazi <input type="datetime-local">. */
const zaInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

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
 * Trener upisuje ceo trening umesto vezbaca koji nije poneo telefon.
 *
 * Ovo NIJE mesanje u zivi trening. Sesija koju pravi trainer_create_past_workout
 * je zavrsena od rodjenja (is_active = false, bez reda u workout_live_state), pa
 * je nijedan zivi RPC ne moze ni dohvatiti, a ni telefon ni sat nikad ne saznaju
 * za nju. Server uz to odbija upis dok vezbac bas tada trenira.
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
  const [kada, setKada] = useState(() => zaInput(new Date(Date.now() - 60 * 60 * 1000)));
  const [trajanje, setTrajanje] = useState("60");
  const [naslov, setNaslov] = useState("");
  const [vezbe, setVezbe] = useState<Vezba[]>([]);
  const [biram, setBiram] = useState(false);
  const [salje, setSalje] = useState(false);

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
            exercise_id: id,
            naziv: e?.name ?? e?.name_en ?? "Vežba",
            kardio: !!e?.is_duration_based,
            minuti: "20",
            serije: [{ reps: "10", kg: "" }, { reps: "10", kg: "" }, { reps: "10", kg: "" }],
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
      s.map((ex, i) =>
        i !== vi ? ex : { ...ex, serije: [...ex.serije, { ...(ex.serije.at(-1) ?? { reps: "10", kg: "" }) }] },
      ),
    );

  const obrisiSeriju = (vi: number, si: number) =>
    setVezbe((s) =>
      s.map((ex, i) => (i !== vi ? ex : { ...ex, serije: ex.serije.filter((_, j) => j !== si) })),
    );

  const obrisiVezbu = (vi: number) => setVezbe((s) => s.filter((_, i) => i !== vi));

  // Komponenta ostaje montirana dok je sheet zatvoren, pa se useState inicijalizator
  // otkuca tacno jednom - u trenutku kad se profil ucitao. Bez ovoga bi "Kada" bilo
  // ustajalo vec pri prvom upisu, a drugi upis zaredom pao na serversku zastitu
  // "Trening sa istim pocetkom je vec upisan".
  //
  // Resetuje se CELA forma, ne samo vreme: trener koji odustane pa se kasnije vrati
  // ne sme da zatekne stare vezbe i stari naziv uz danasnji datum.
  useEffect(() => {
    if (!open) return;
    setKada(zaInput(new Date(Date.now() - 60 * 60 * 1000)));
    setTrajanje("60");
    setNaslov("");
    setVezbe([]);
    setBiram(false);
    setSalje(false);
  }, [open]);

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
    const min = broj(trajanje);
    if (min == null || min < 1) { toast.error("Unesi trajanje u minutima"); return; }
    if (min > 600) { toast.error("Trajanje ne može biti duže od 600 minuta"); return; }
    // Prazan ili nepotpun datum: new Date("") je Invalid Date, a toISOString na
    // njemu BACA. Poziv je "void sacuvaj()", pa greska ne bi imala ko da uhvati -
    // ostao bi zavrten spiner i mrtvo dugme do napustanja stranice.
    const pocetak = new Date(kada);
    if (!kada || Number.isNaN(pocetak.getTime())) {
      toast.error("Izaberi datum i vreme treninga");
      return;
    }

    setSalje(true);
    try {
      const { error } = await supabase.rpc("trainer_create_past_workout" as any, {
        p_athlete_id: athleteId,
        // datetime-local je LOKALNO vreme bez zone; new Date ga tumaci lokalno,
        // pa toISOString daje tacan trenutak u UTC-u.
        p_started_at: pocetak.toISOString(),
        p_duration_minutes: Math.round(min),
        // Kardio ide kao TACNO jedna stavka sa minutima - triger na serveru svakako
        // pribija sets na 1, pa bi tri serije bile tiho progutane.
        p_exercises: vezbe.map((v) => ({
          exercise_id: v.exercise_id,
          sets: v.kardio
            ? [{ duration_minutes: Math.round(broj(v.minuti) as number) }]
            : v.serije.map((r) => ({
                reps: r.reps.trim() === "" ? null : Math.round(broj(r.reps) as number),
                weight_kg: broj(r.kg),
              })),
        })),
        p_title: naslov.trim() || null,
        p_notes: null,
      });
      if (error) { toast.error(porukaGreske(error)); return; }
    } finally {
      // U finally: bilo koji neocekivan izuzetak inace ostavlja dugme zauvek
      // zakljucano, jer "salje" nema drugog mesta gde se gasi.
      setSalje(false);
    }

    // Datum u poruci: trening upisan unazad ne mora da stane u listu poslednjih
    // deset, pa bez ovoga izgleda kao da upis nije prosao.
    toast.success(`Trening upisan za ${pocetak.toLocaleDateString("sr-Latn-RS")}`);
    setVezbe([]); setNaslov("");
    onSaved();
    onClose();
  };

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
          Za trening koji je vežbač odradio bez telefona. Videće ga u svojoj istoriji.
          Lični rekordi se iz ovakvog treninga ne računaju.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="kada">Kada</Label>
            <Input
              id="kada"
              type="datetime-local"
              value={kada}
              onChange={(e) => setKada(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="trajanje">Trajanje (min)</Label>
            <Input
              id="trajanje"
              value={trajanje}
              onChange={(e) => setTrajanje(e.target.value)}
              inputMode="numeric"
              max={600}
              className="mt-1.5"
            />
          </div>
        </div>

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

        {vezbe.map((v, vi) => (
          <div key={`${v.exercise_id}-${vi}`} className="rounded-xl border border-hairline bg-surface p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 min-w-0 text-[14px] font-semibold truncate">{v.naziv}</div>
              <button
                type="button"
                onClick={() => obrisiVezbu(vi)}
                aria-label={`Ukloni ${v.naziv}`}
                className="h-8 w-8 rounded-lg bg-surface-2 text-muted-foreground inline-flex items-center justify-center"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {v.kardio ? (
              // Vezba na minute: jedno polje, bez serija i kilaze. Server za nju
              // trazi tacno jednu stavku sa minutima.
              <div>
                <Label htmlFor={`min-${vi}`} className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Minuti
                </Label>
                <Input
                  id={`min-${vi}`}
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
        ))}

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
