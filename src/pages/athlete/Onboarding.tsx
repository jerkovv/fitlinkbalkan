import { useNavigate } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { useState } from "react";
import { Camera } from "lucide-react";

const Onboarding = () => {
  const nav = useNavigate();
  const [code, setCode] = useState(["M", "", "", "", ""]);

  const setChar = (i: number, v: string) => {
    const next = [...code];
    next[i] = v.slice(-1).toUpperCase();
    setCode(next);
  };

  return (
    <PhoneShell title="⚡ FITLINK — Vežbač" back="/" variant="athlete">
      <p className="text-center text-xs text-muted-foreground mb-6">Poveži se sa trenerom</p>

      <div className="text-[10px] uppercase tracking-widest text-muted-foreground text-center mb-3">
        Unesi invite kod
      </div>
      <div className="flex justify-center gap-2 mb-6">
        {code.map((c, i) => (
          <input
            key={i}
            value={c}
            onChange={(e) => setChar(i, e.target.value)}
            maxLength={1}
            className="w-12 h-14 rounded-xl bg-surface-3 border-2 border-border focus:border-accent focus:outline-none text-center text-2xl font-black text-accent-bright placeholder:text-muted-foreground/40"
            placeholder="–"
          />
        ))}
      </div>

      <div className="text-center text-xs text-muted-foreground mb-3">— ili —</div>

      <button className="w-full rounded-xl bg-surface-3 hover:bg-surface-2 transition py-6 flex items-center justify-center gap-3 mb-6">
        <Camera className="h-7 w-7 text-accent-bright" />
        <span className="text-sm text-muted-foreground">Skeniraj QR trenera</span>
      </button>

      <button
        onClick={() => nav("/vezbac")}
        className="w-full rounded-xl bg-gradient-athlete text-white font-bold py-3.5 shadow-athlete hover:opacity-95 transition"
      >
        POVEŽI SE →
      </button>
    </PhoneShell>
  );
};

export default Onboarding;
