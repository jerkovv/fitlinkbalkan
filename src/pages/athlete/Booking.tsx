import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { Button, SectionTitle } from "@/components/ui-bits";
import { bookingSlots } from "@/data/mock";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";

const days = [
  { d: 28, dn: "UTO" },
  { d: 29, dn: "SRE" },
  { d: 30, dn: "ČET", active: true },
  { d: 1, dn: "PET" },
  { d: 2, dn: "SUB" },
];

const Booking = () => {
  const nav = useNavigate();
  const [day, setDay] = useState(30);
  const [selected, setSelected] = useState<string | null>("10:00");

  return (
    <PhoneShell back="/vezbac" title="Rezerviši trening" eyebrow="Termini">
      <section>
        <SectionTitle>Koji dan?</SectionTitle>
        <div className="flex gap-2 -mx-2 px-2 overflow-x-auto no-scrollbar">
          {days.map((d) => {
            const active = day === d.d;
            return (
              <button
                key={d.d}
                onClick={() => setDay(d.d)}
                className={cn(
                  "shrink-0 w-[68px] py-3 rounded-2xl text-center transition",
                  active
                    ? "bg-gradient-brand text-white shadow-brand"
                    : "card-premium-hover text-foreground",
                )}
              >
                <div className="font-display text-[22px] font-bold tracking-tightest leading-none">{d.d}</div>
                <div className={cn("text-[10px] font-semibold mt-1 tracking-wider", active ? "text-white/80" : "text-muted-foreground")}>
                  {d.dn}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle>U kojem terminu?</SectionTitle>
        <ul className="space-y-2">
          {bookingSlots.map((s) => {
            const disabled = s.state === "busy";
            const active = selected === s.time && !disabled;
            return (
              <li key={s.time}>
                <button
                  disabled={disabled}
                  onClick={() => setSelected(s.time)}
                  className={cn(
                    "w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left transition",
                    disabled && "bg-surface-2 opacity-50 cursor-not-allowed",
                    !disabled && !active && "card-premium-hover",
                    active && "bg-foreground text-background shadow-medium",
                  )}
                >
                  <div className={cn(
                    "h-11 w-11 rounded-2xl flex items-center justify-center",
                    active ? "bg-white/15" : disabled ? "bg-surface-3" : "bg-primary-soft text-primary-soft-foreground",
                  )}>
                    <Clock className="h-[18px] w-[18px]" />
                  </div>
                  <div className="flex-1">
                    <div className="font-display text-[18px] font-bold tracking-tighter tnum">{s.time}</div>
                    <div className={cn("text-[12px]", active ? "text-white/70" : "text-muted-foreground")}>
                      Personalni trening · 1h
                    </div>
                  </div>
                  <span className={cn(
                    "text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full",
                    disabled && "bg-surface-3 text-muted-foreground",
                    !disabled && !active && "bg-success-soft text-success-soft-foreground",
                    active && "bg-white/15 text-white",
                  )}>
                    {disabled ? "Zauzeto" : active ? "Izabrano" : "Slobodno"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <Button variant="brand" size="lg" fullWidth disabled={!selected} onClick={() => nav("/vezbac")}>
        Potvrdi {selected ?? ""} ✓
      </Button>
    </PhoneShell>
  );
};

export default Booking;
