import { useEffect, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Chip } from "@/components/ui-bits";
import { Check, Circle } from "lucide-react";
import { athleteWorkout } from "@/data/mock";

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

const ActiveWorkout = () => {
  const [rest, setRest] = useState(athleteWorkout.restSeconds);

  useEffect(() => {
    if (rest <= 0) return;
    const t = setInterval(() => setRest((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [rest]);

  return (
    <>
      <PhoneShell title={athleteWorkout.title} variant="athlete" back="/vezbac">
        <div className="flex items-center justify-between mb-4">
          <div className="text-base font-bold text-accent-bright">{athleteWorkout.current}</div>
          <Chip tone="info">{athleteWorkout.exerciseProgress}</Chip>
        </div>

        {/* header */}
        <div className="grid grid-cols-[20px_2fr_1fr_1fr_24px] gap-1.5 text-[9px] uppercase tracking-widest text-muted-foreground/60 px-1 mb-1">
          <span>#</span><span>KG</span><span className="text-center">Reps</span><span className="text-center">RPE</span><span></span>
        </div>

        {athleteWorkout.sets.map((s, i) => (
          <div key={i} className="grid grid-cols-[20px_2fr_1fr_1fr_24px] gap-1.5 mb-1.5 items-center">
            <span className="text-xs text-muted-foreground text-center">{i + 1}</span>
            <div className={`rounded-lg px-3 py-2.5 text-sm font-bold ${s.done ? "bg-surface-3" : "bg-accent-soft text-accent-bright"}`}>
              {s.kg ?? "—"}
            </div>
            <div className={`rounded-lg py-2.5 text-center text-sm font-bold ${s.done ? "bg-surface-3" : "bg-accent-soft text-accent-bright"}`}>
              {s.reps ?? "—"}
            </div>
            <div className={`rounded-lg py-2.5 text-center text-sm font-bold ${s.done ? "bg-surface-3" : "bg-accent-soft text-accent-bright"}`}>
              {s.rpe ?? "—"}
            </div>
            {s.done ? (
              <Check className="h-5 w-5 text-success" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground/40" />
            )}
          </div>
        ))}

        <div className="rounded-2xl bg-gradient-card-athlete border border-accent/30 p-5 text-center mt-5 shadow-athlete">
          <div className="text-[10px] uppercase tracking-widest text-accent-soft-foreground">Odmor</div>
          <div className="text-5xl font-black font-display text-accent-bright tabular-nums mt-1">
            {formatTime(rest)}
          </div>
          <button
            onClick={() => setRest(athleteWorkout.restSeconds)}
            className="mt-3 text-xs text-accent-soft-foreground/80 hover:text-white"
          >
            Resetuj
          </button>
        </div>

        <button className="mt-5 w-full rounded-xl bg-gradient-athlete text-white font-bold py-3.5 shadow-athlete hover:opacity-95 transition">
          ZAVRŠI SET ✓
        </button>
      </PhoneShell>
      <BottomNav role="athlete" />
    </>
  );
};

export default ActiveWorkout;
