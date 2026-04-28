import { PhoneShell } from "@/components/PhoneShell";
import { Plus } from "lucide-react";
import { programDays } from "@/data/mock";

const ProgramBuilder = () => {
  return (
    <PhoneShell title="Novi Program" back="/trener" variant="trainer">
      <input
        defaultValue="PPL — Snaga & Hipertrofija"
        className="w-full rounded-xl bg-surface-3 px-3.5 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40 mb-4"
      />

      {programDays.map((day) => (
        <div key={day.title} className="mb-5">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            {day.title}
          </div>
          <div className="space-y-1.5">
            {/* header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-1.5 text-[9px] uppercase tracking-widest text-muted-foreground/60 px-2">
              <span>Vežba</span><span className="text-center">Set</span><span className="text-center">Rep</span><span className="text-center">Pauza</span>
            </div>
            {day.exercises.map((ex) => (
              <div key={ex.name} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-1.5">
                <div className="rounded-lg bg-surface-3 px-3 py-2 text-sm font-semibold">{ex.name}</div>
                <div className="rounded-lg bg-surface-3 py-2 text-center text-sm font-bold">{ex.sets}</div>
                <div className="rounded-lg bg-surface-3 py-2 text-center text-sm font-bold">{ex.reps}</div>
                <div className="rounded-lg bg-surface-3 py-2 text-center text-sm font-bold">{ex.rest}</div>
              </div>
            ))}
            <button className="w-full mt-1 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 py-2 text-xs font-semibold text-primary-soft-foreground hover:bg-primary-soft/40 transition">
              <Plus className="h-3 w-3" /> Dodaj vežbu
            </button>
          </div>
        </div>
      ))}

      <button className="w-full rounded-xl bg-gradient-trainer text-white font-bold py-3.5 shadow-trainer hover:opacity-95 transition">
        DODELI → Nikola P.
      </button>
    </PhoneShell>
  );
};

export default ProgramBuilder;
