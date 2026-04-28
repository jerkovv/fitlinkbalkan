import { PhoneShell } from "@/components/PhoneShell";
import { Button, Card, SectionTitle } from "@/components/ui-bits";
import { Plus } from "lucide-react";
import { programDays } from "@/data/mock";

const ProgramBuilder = () => {
  return (
    <PhoneShell back="/trener" title="Novi program" eyebrow="Kreator">
      <input
        defaultValue="PPL — Snaga & Hipertrofija"
        className="w-full card-premium px-4 py-3.5 text-[15px] font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
      />

      {programDays.map((day) => (
        <section key={day.title}>
          <SectionTitle>{day.title}</SectionTitle>
          <Card className="p-4 space-y-2">
            {/* header */}
            <div className="grid grid-cols-[1fr_44px_56px_56px] gap-2 px-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80 font-semibold">
              <span>Vežba</span>
              <span className="text-center">Set</span>
              <span className="text-center">Reps</span>
              <span className="text-center">Pauza</span>
            </div>
            {day.exercises.map((ex) => (
              <div key={ex.name} className="grid grid-cols-[1fr_44px_56px_56px] gap-2 items-center bg-surface-2 rounded-xl px-2 py-2">
                <div className="text-[14px] font-semibold tracking-tight">{ex.name}</div>
                <div className="text-center text-[14px] font-bold tnum">{ex.sets}</div>
                <div className="text-center text-[14px] font-bold tnum">{ex.reps}</div>
                <div className="text-center text-[14px] font-bold tnum">{ex.rest}</div>
              </div>
            ))}
            <button className="w-full mt-1 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-hairline hover:border-primary/40 py-2.5 text-[12.5px] font-semibold text-muted-foreground hover:text-primary-soft-foreground transition">
              <Plus className="h-3.5 w-3.5" /> Dodaj vežbu
            </button>
          </Card>
        </section>
      ))}

      <Button variant="brand" size="lg" fullWidth>Dodeli vežbaču →</Button>
    </PhoneShell>
  );
};

export default ProgramBuilder;
