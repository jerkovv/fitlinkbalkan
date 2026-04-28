import { useNavigate } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { Button } from "@/components/ui-bits";
import { useState, useRef, useEffect } from "react";
import { Camera } from "lucide-react";

const Onboarding = () => {
  const nav = useNavigate();
  const [code, setCode] = useState(["", "", "", "", ""]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { refs.current[0]?.focus(); }, []);

  const setChar = (i: number, v: string) => {
    const ch = v.slice(-1).toUpperCase();
    const next = [...code];
    next[i] = ch;
    setCode(next);
    if (ch && i < 4) refs.current[i + 1]?.focus();
  };

  return (
    <PhoneShell back="/" title="Poveži se sa trenerom" eyebrow="Onboarding">
      <p className="text-[14px] text-muted-foreground -mt-2">
        Unesi 5-cifren kod ili skeniraj QR koji ti je dao trener.
      </p>

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
          Invite kod
        </div>
        <div className="flex justify-between gap-2">
          {code.map((c, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              value={c}
              onChange={(e) => setChar(i, e.target.value)}
              maxLength={1}
              inputMode="text"
              className="w-14 h-16 card-premium text-center font-display text-[28px] font-bold text-foreground tracking-tightest focus:outline-none focus:ring-2 focus:ring-primary/40 transition placeholder:text-muted-foreground/30"
              placeholder="–"
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
        <span className="flex-1 h-px bg-hairline" />
        ili
        <span className="flex-1 h-px bg-hairline" />
      </div>

      <button className="w-full card-premium-hover py-6 flex items-center justify-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-primary-soft text-primary-soft-foreground flex items-center justify-center">
          <Camera className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="text-left">
          <div className="text-[14px] font-semibold tracking-tight">Skeniraj QR kod</div>
          <div className="text-[12px] text-muted-foreground">Trener ti pokaže QR</div>
        </div>
      </button>

      <Button variant="brand" size="lg" fullWidth onClick={() => nav("/vezbac")}>
        Poveži se →
      </Button>
    </PhoneShell>
  );
};

export default Onboarding;
