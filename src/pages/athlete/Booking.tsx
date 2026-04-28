import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { bookingSlots } from "@/data/mock";
import { cn } from "@/lib/utils";

const Booking = () => {
  const nav = useNavigate();
  const [selected, setSelected] = useState<string | null>("10:00");

  return (
    <PhoneShell title="📅 Zakaži Termin" back="/vezbac" variant="athlete">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
        Sreda, 18. April
      </div>

      <div className="grid grid-cols-3 gap-2 mb-6">
        {bookingSlots.map((s) => {
          const disabled = s.state === "busy";
          const active = selected === s.time && !disabled;
          return (
            <button
              key={s.time}
              disabled={disabled}
              onClick={() => setSelected(s.time)}
              className={cn(
                "rounded-xl py-3 border-2 transition",
                disabled && "bg-surface border-border/40 opacity-40 cursor-not-allowed",
                !disabled && !active && "bg-accent-soft border-accent/40 text-accent-bright hover:border-accent",
                active && "bg-gradient-athlete border-accent text-white shadow-athlete",
              )}
            >
              <div className="text-base font-extrabold">{s.time}</div>
              <div className="text-[10px] opacity-80 mt-0.5">{disabled ? "zauzeto" : "slobodno"}</div>
            </button>
          );
        })}
      </div>

      <button
        disabled={!selected}
        onClick={() => nav("/vezbac")}
        className="w-full rounded-xl bg-gradient-athlete text-white font-bold py-3.5 shadow-athlete hover:opacity-95 transition disabled:opacity-50"
      >
        POTVRDI — {selected ?? "—"} ✓
      </button>
    </PhoneShell>
  );
};

export default Booking;
