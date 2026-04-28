import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card, Chip, SectionTitle } from "@/components/ui-bits";
import { calendarDays } from "@/data/mock";
import { cn } from "@/lib/utils";

const dayHeaders = ["P", "U", "S", "Č", "P", "S", "N"];

const Calendar = () => {
  return (
    <>
      <PhoneShell hasBottomNav title="Kalendar" eyebrow="April 2025">
        <Card className="p-4">
          <div className="grid grid-cols-7 gap-1.5 mb-2">
            {dayHeaders.map((d, i) => (
              <div key={i} className="aspect-square flex items-center justify-center text-[11px] font-semibold text-muted-foreground/60">
                {d}
              </div>
            ))}
            {calendarDays.map((c, i) => (
              <button
                key={i}
                className={cn(
                  "aspect-square rounded-xl flex items-center justify-center text-[13px] font-semibold transition",
                  !c.type && "text-foreground/70 hover:bg-surface-2",
                  c.type === "busy" && "bg-trainer-soft text-trainer-soft-foreground",
                  c.type === "free" && "bg-success-soft text-success-soft-foreground",
                  c.type === "today" && "bg-gradient-brand text-white shadow-brand",
                )}
              >
                {c.d}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] mt-3 pt-3 border-t border-hairline">
            <span className="flex items-center gap-1.5 text-trainer-soft-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-trainer-soft border border-trainer/30" /> zauzeto
            </span>
            <span className="flex items-center gap-1.5 text-success-soft-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-success-soft border border-success/30" /> slobodno
            </span>
            <span className="flex items-center gap-1.5 text-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-gradient-brand" /> danas
            </span>
          </div>
        </Card>

        <section>
          <SectionTitle>Slobodni termini danas</SectionTitle>
          <Card className="p-4">
            <div className="flex flex-wrap gap-2">
              {["10:00", "14:00", "17:00"].map((t) => (
                <Chip key={t} tone="success" size="md" className="font-bold tnum">{t}</Chip>
              ))}
            </div>
          </Card>
        </section>
      </PhoneShell>
      <BottomNav role="trainer" />
    </>
  );
};

export default Calendar;
