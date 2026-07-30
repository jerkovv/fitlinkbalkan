import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface SetLoggerProps {
  setNumber: number;
  totalSets: number;
  targetReps: number | null;
  targetWeightKg: number | null;
  initialReps?: number | null;
  initialWeightKg?: number | null;
  onComplete: (data: {
    reps: number;
    weight_kg: number;
    rpe: number | null;
    notes: string | null;
  }) => Promise<void> | void;
  /** Zakljucano (npr izgubljen sat) -> dugme "zavrsi seriju" onemoguceno. */
  disabled?: boolean;
}

// Broj -> tekst za prikaz (bez suvisnih decimala). Isto pravilo kao ranije (samo prikaz).
const formatStepperValue = (value: number) =>
  Number.isFinite(value) ? (value % 1 === 0 ? value.toString() : value.toFixed(1)) : "0";

// Drzi-da-ubrzava: kratak tap = jedan korak (odmah, na pointerDown); drzanje due od
// HOLD_DELAY_MS pocinje da ponavlja korak na REPEAT_MS - da korisnik ne mora da klikce
// dugme 20-30 puta da stigne npr. do 50kg (fin korak od 1 bez ovoga bi bio jos gori od
// starog koraka od 2.5). Racuna se iz LOKALNE promenljive unutar gesta (ne cita nazad
// `value` prop izmedju tikova) - nezavisno od brzine roditeljskog re-rendera, svaki korak
// je tacan i ravnomeran.
const HOLD_DELAY_MS = 350;
const REPEAT_MS = 90;

function useHoldStep(
  direction: 1 | -1,
  value: number,
  step: number,
  min: number,
  max: number,
  onChange: (v: number) => void,
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  // Cleanup na unmount (npr. promena seta usred drzanja dugmeta).
  useEffect(() => stop, []);

  const start = () => {
    stop();
    let current = value;
    const tick = () => {
      current =
        direction > 0
          ? Math.min(max, +(current + step).toFixed(2))
          : Math.max(min, +(current - step).toFixed(2));
      onChange(current);
    };
    tick();
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(tick, REPEAT_MS);
    }, HOLD_DELAY_MS);
  };

  return { onPointerDown: start, onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop };
}

const Stepper = ({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) => {
  const decHold = useHoldStep(-1, value, step, min, max, onChange);
  const incHold = useHoldStep(1, value, step, min, max, onChange);

  // Slobodan unos: lokalni tekst dozvoljava kucanje proizvoljnog broja (npr. "47.5"),
  // ne samo +/- korake. Sinhronise se sa spoljnom vrednoscu SAMO dok input nije fokusiran
  // (da +/- dugmad i promena seta i dalje azuriraju prikaz), a dok korisnik kuca ne
  // pregazi ono sto je uneo.
  const [text, setText] = useState(() => formatStepperValue(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatStepperValue(value));
  }, [value, focused]);

  const commit = (raw: string) => {
    const n = parseFloat(raw.replace(",", "."));
    if (Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, n));
      onChange(clamped);
      setText(formatStepperValue(clamped));
    } else {
      setText(formatStepperValue(value));
    }
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        {...decHold}
        aria-label="Smanji (drzi za brze menjanje)"
        className="h-12 w-12 rounded-2xl bg-surface border border-hairline active:scale-95 transition flex items-center justify-center shrink-0 touch-none select-none"
      >
        <Minus className="h-4 w-4" strokeWidth={2.5} />
      </button>
      <div className="flex-1 flex items-baseline justify-center gap-1 px-1 min-w-0">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onFocus={() => setFocused(true)}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => {
            setFocused(false);
            commit(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="w-full max-w-[72px] bg-transparent text-center font-display text-[18px] font-semibold leading-none tracking-tight tnum text-foreground whitespace-nowrap focus:outline-none"
        />
        {suffix && (
          <span className="text-[11px] text-muted-foreground font-semibold shrink-0">{suffix}</span>
        )}
      </div>
      <button
        type="button"
        {...incHold}
        aria-label="Povecaj (drzi za brze menjanje)"
        className="h-12 w-12 rounded-2xl bg-surface border border-hairline active:scale-95 transition flex items-center justify-center shrink-0 touch-none select-none"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </div>
  );
};

export const SetLogger = ({
  setNumber,
  totalSets,
  targetReps,
  targetWeightKg,
  initialReps,
  initialWeightKg,
  onComplete,
  disabled = false,
}: SetLoggerProps) => {
  const [reps, setReps] = useState<number>(
    initialReps ?? targetReps ?? 0
  );
  const [weight, setWeight] = useState<number>(
    initialWeightKg ?? targetWeightKg ?? 0
  );
  const [rpe, setRpe] = useState<number | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setReps(initialReps ?? targetReps ?? 0);
    setWeight(initialWeightKg ?? targetWeightKg ?? 0);
    setRpe(null);
    setNotes("");
    setNotesOpen(false);
  }, [setNumber, targetReps, targetWeightKg, initialReps, initialWeightKg]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onComplete({
        reps: Number(reps) || 0,
        weight_kg: Number(weight) || 0,
        rpe: rpe ?? null,
        notes: notes.trim() ? notes.trim() : null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-3xl bg-surface border border-hairline p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Aktivna serija
        </div>
        <div className="text-[12px] text-foreground/80 font-semibold">
          Serija {setNumber} od {totalSets}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
            Ponavljanja
          </div>
          <Stepper value={reps} onChange={setReps} step={1} max={999} />
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
            Težina (kg)
          </div>
          <Stepper value={weight} onChange={setWeight} step={1} max={999} />
        </div>
      </div>

      {/* RPE */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            RPE (težina 1-10)
          </div>
          {rpe != null && (
            <button
              type="button"
              onClick={() => setRpe(null)}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Poništi
            </button>
          )}
        </div>
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRpe(n)}
              className={cn(
                "h-9 rounded-lg text-[12px] font-bold tnum transition",
                rpe === n
                  ? "bg-gradient-brand text-white shadow-brand"
                  : "bg-surface-2 text-muted-foreground hover:text-foreground"
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setNotesOpen((o) => !o)}
          className="text-[12px] font-semibold text-muted-foreground inline-flex items-center gap-1"
        >
          {notesOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Beleška (opciono)
        </button>
        {notesOpen && (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Kako se serija osetila?"
            rows={2}
            className="mt-2 w-full rounded-2xl bg-surface-2 border border-hairline p-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        )}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={submitting || disabled}
        className="w-full h-14 rounded-2xl bg-gradient-brand text-white font-bold text-[15px] inline-flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-brand disabled:opacity-60"
      >
        <Check className="h-5 w-5" strokeWidth={3} />
        {submitting ? "Čuvanje..." : "Završio set"}
      </button>
    </div>
  );
};

export default SetLogger;
