import { useNavigate, useParams } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { Avatar } from "@/components/ui-bits";
import { useState } from "react";
import { athletes } from "@/data/mock";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const methods = [
  { key: "cash", icon: "💵", label: "Keš" },
  { key: "qr", icon: "📱", label: "QR" },
  { key: "bank", icon: "🏦", label: "Uplatn." },
] as const;

const Payment = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const athlete = athletes.find((a) => a.id === id) ?? athletes[0];
  const [method, setMethod] = useState<(typeof methods)[number]["key"]>("cash");

  return (
    <PhoneShell title="Evidentiranje Uplate" back={`/trener/vezbaci/${athlete.id}`} variant="trainer">
      <div className="flex items-center gap-3 mb-4">
        <Avatar initials={athlete.initials} tone="trainer" />
        <div>
          <div className="text-sm font-semibold">{athlete.name}</div>
          <div className="text-xs text-muted-foreground">Mesečna — 5.000 RSD</div>
        </div>
      </div>

      <div className="rounded-xl bg-surface-3 p-4 mb-4">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Iznos</div>
        <div className="text-3xl font-black text-gradient-brand font-display">5.000 RSD</div>
        <div className="text-xs text-muted-foreground mt-1">period: Maj 2025</div>
      </div>

      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Način plaćanja</div>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {methods.map((m) => (
          <button
            key={m.key}
            onClick={() => setMethod(m.key)}
            className={cn(
              "rounded-xl py-3 flex flex-col items-center gap-1 border-2 transition",
              method === m.key
                ? "bg-primary-soft border-primary text-primary-soft-foreground"
                : "bg-surface border-border/60 text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="text-xl">{m.icon}</span>
            <span className="text-[11px] font-bold">{m.label}</span>
          </button>
        ))}
      </div>

      <button
        onClick={() => nav("/trener")}
        className="w-full rounded-xl bg-gradient-success text-white font-bold py-3.5 shadow-success hover:opacity-95 transition flex items-center justify-center gap-2"
      >
        <Check className="h-4 w-4" /> POTVRDI UPLATU
      </button>
    </PhoneShell>
  );
};

export default Payment;
