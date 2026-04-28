import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { calendarDays } from "@/data/mock";
import { cn } from "@/lib/utils";

const dayHeaders = ["P", "U", "S", "Č", "P", "S", "N"];

const Calendar = () => {
  return (
    <>
      <PhoneShell title="📅 April 2025" variant="trainer">
        <div className="grid grid-cols-7 gap-1.5 mb-4">
          {dayHeaders.map((d, i) => (
            <div key={i} className="aspect-square flex items-center justify-center text-[10px] text-muted-foreground/50 font-bold">
              {d}
            </div>
          ))}
          {calendarDays.map((c, i) => (
            <button
              key={i}
              className={cn(
                "aspect-square rounded-lg flex items-center justify-center text-xs font-semibold transition hover:scale-105",
                !c.type && "bg-surface text-muted-foreground/50",
                c.type === "busy" && "bg-primary-soft text-primary-soft-foreground",
                c.type === "free" && "bg-success-soft text-success-soft-foreground",
                c.type === "today" && "bg-gradient-trainer text-white shadow-trainer",
              )}
            >
              {c.d}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 text-[11px] mb-4">
          <span className="flex items-center gap-1.5 text-primary-soft-foreground"><span className="h-2.5 w-2.5 rounded-sm bg-primary-soft" />zauzeto</span>
          <span className="flex items-center gap-1.5 text-success-soft-foreground"><span className="h-2.5 w-2.5 rounded-sm bg-success" />slobodno</span>
          <span className="flex items-center gap-1.5 text-accent-bright"><span className="h-2.5 w-2.5 rounded-sm bg-gradient-trainer" />danas</span>
        </div>

        <div className="rounded-xl bg-surface border border-border/60 p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Slobodni termini danas</div>
          <div className="text-sm font-semibold text-success-soft-foreground">10:00 · 14:00 · 17:00</div>
        </div>
      </PhoneShell>
      <BottomNav role="trainer" />
    </>
  );
};

export default Calendar;
