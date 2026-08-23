import { useState } from "react";
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
  serije: Serija[];
};

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
    const { data } = await supabase.from("exercises").select("id, name, name_en").in("id", ids);
    const red = (data ?? []) as Array<{ id: string; name: string; name_en: string | null }>;
    setVezbe((s) => [
      ...s,
      ...ids.map((id) => {
        const e = red.find((x) => x.id === id);
        return {
          exercise_id: id,
          naziv: e?.name ?? e?.name_en ?? "Vežba",
          serije: [{ reps: "10", kg: "" }, { reps: "10", kg: "" }, { reps: "10", kg: "" }],
        };
      }),
    ]);
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

  const sacuvaj = async () => {
    if (!vezbe.length) { toast.error("Dodaj bar jednu vežbu"); return; }
    if (vezbe.some((v) => v.serije.length === 0)) {
      toast.error("Svaka vežba mora imati bar jednu seriju");
      return;
    }
    const min = broj(trajanje);
    if (min == null || min < 1) { toast.error("Unesi trajanje u minutima"); return; }

    setSalje(true);
    const { error } = await supabase.rpc("trainer_create_past_workout" as any, {
      p_athlete_id: athleteId,
      // datetime-local je LOKALNO vreme bez zone; new Date ga tumaci lokalno,
      // pa toISOString daje tacan trenutak u UTC-u.
      p_started_at: new Date(kada).toISOString(),
      p_duration_minutes: Math.round(min),
      p_exercises: vezbe.map((v) => ({
        exercise_id: v.exercise_id,
        sets: v.serije.map((r) => ({ reps: broj(r.reps), weight_kg: broj(r.kg) })),
      })),
      p_title: naslov.trim() || null,
      p_notes: null,
    });
    setSalje(false);
    if (error) { toast.error(porukaGreske(error)); return; }

    toast.success("Trening upisan");
    setVezbe([]); setNaslov("");
    onSaved();
    onClose();
  };

  return (
    <FullScreenSheet
      open={open}
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

      <ExercisePickerSheet
        open={biram}
        dayId={null}
        dayName="Dodaj vežbe"
        table="assigned_program_exercises"
        onClose={() => setBiram(false)}
        onAdded={() => setBiram(false)}
        onPickMany={(ids) => void dodajVezbe(ids)}
      />
    </FullScreenSheet>
  );
};

export default UpisTreninga;
