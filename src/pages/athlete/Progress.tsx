import { useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { ProgressBar } from "@/components/ui-bits";
import { athletes } from "@/data/mock";
import { cn } from "@/lib/utils";

const tabs = ["Snaga", "Volumen", "Telo"] as const;

const Progress = () => {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Snaga");
  const me = athletes[0]; // Nikola

  return (
    <>
      <PhoneShell title="📈 Statistike" variant="athlete">
        <div className="flex gap-2 mb-4">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide transition",
                tab === t
                  ? "bg-accent text-accent-foreground"
                  : "bg-surface-3 text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="rounded-xl bg-surface border border-border/60 p-3 mb-5">
          <svg viewBox="0 0 260 80" className="w-full h-24" preserveAspectRatio="none">
            <defs>
              <linearGradient id="og" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(25 95% 53%)" stopOpacity="0.5" />
                <stop offset="100%" stopColor="hsl(25 95% 53%)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points="0,80 0,68 35,62 70,55 105,46 140,38 175,28 210,20 260,10 260,80" fill="url(#og)" />
            <polyline
              points="0,68 35,62 70,55 105,46 140,38 175,28 210,20 260,10"
              fill="none"
              stroke="hsl(25 95% 53%)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span>
          </div>
        </div>

        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Personal Records
        </div>
        <div className="space-y-3 rounded-xl bg-surface border border-border/60 p-4">
          {me.prs.map((pr) => (
            <ProgressBar key={pr.lift} label={pr.lift} trailing={<>🔥 {pr.weight}kg</>} value={pr.progress} tone="athlete" />
          ))}
        </div>
      </PhoneShell>
      <BottomNav role="athlete" />
    </>
  );
};

export default Progress;
