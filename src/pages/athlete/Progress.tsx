import { useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card, ProgressBar, SectionTitle } from "@/components/ui-bits";
import { athletes } from "@/data/mock";
import { cn } from "@/lib/utils";
import { TrendingUp } from "lucide-react";

const tabs = ["Snaga", "Volumen", "Telo"] as const;

const Progress = () => {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Snaga");
  const me = athletes[0];

  return (
    <>
      <PhoneShell hasBottomNav title="Tvoj napredak" eyebrow="Statistike">
        {/* Segmented control */}
        <div className="inline-flex p-1 rounded-full bg-surface-2 border border-hairline">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-5 py-2 rounded-full text-[13px] font-semibold transition",
                tab === t
                  ? "bg-surface text-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Chart */}
        <Card className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Poslednja 4 meseca
              </div>
              <div className="font-display text-[28px] font-bold tracking-tightest mt-1">
                145 <span className="text-[14px] text-muted-foreground font-semibold">kg PR</span>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-success-soft text-success-soft-foreground text-[12px] font-semibold">
              <TrendingUp className="h-3 w-3" /> +24%
            </span>
          </div>

          <svg viewBox="0 0 280 90" className="w-full h-28" preserveAspectRatio="none">
            <defs>
              <linearGradient id="brandGradFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(322 82% 56%)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="hsl(322 82% 56%)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="brandGradLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="hsl(322 82% 56%)" />
                <stop offset="100%" stopColor="hsl(252 82% 60%)" />
              </linearGradient>
            </defs>
            <polygon points="0,90 0,75 40,68 80,60 120,52 160,42 200,32 240,22 280,12 280,90" fill="url(#brandGradFill)" />
            <polyline
              points="0,75 40,68 80,60 120,52 160,42 200,32 240,22 280,12"
              fill="none"
              stroke="url(#brandGradLine)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* End dot */}
            <circle cx="280" cy="12" r="4" fill="hsl(252 82% 60%)" />
            <circle cx="280" cy="12" r="8" fill="hsl(252 82% 60%)" fillOpacity="0.2" />
          </svg>
          <div className="flex justify-between mt-2 text-[10px] font-semibold text-muted-foreground">
            <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span>
          </div>
        </Card>

        <section>
          <SectionTitle>Personal Records</SectionTitle>
          <Card className="p-5 space-y-4">
            {me.prs.map((pr) => (
              <ProgressBar key={pr.lift} label={pr.lift} trailing={<>🔥 {pr.weight} kg</>} value={pr.progress} tone="brand" />
            ))}
          </Card>
        </section>
      </PhoneShell>
      <BottomNav role="athlete" />
    </>
  );
};

export default Progress;
