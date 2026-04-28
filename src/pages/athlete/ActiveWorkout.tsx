import { useEffect, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Button, Card, Chip } from "@/components/ui-bits";
import { Check, Circle, RotateCcw } from "lucide-react";
import { athleteWorkout } from "@/data/mock";
import { cn } from "@/lib/utils";

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

const ActiveWorkout = () => {
  const [rest, setRest] = useState(athleteWorkout.restSeconds);

  useEffect(() => {
    if (rest <= 0) return;
    const t = setInterval(() => setRest((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [rest]);

  const pct = (rest / athleteWorkout.restSeconds) * 100;

  return (
    <>
      <PhoneShell back="/vezbac" hasBottomNav title={athleteWorkout.title} eyebrow="Aktivni trening">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-[20px] font-bold tracking-tighter">{athleteWorkout.current}</div>
            <div className="text-[12.5px] text-muted-foreground">3 setova · 8–10 reps</div>
          </div>
          <Chip tone="info" size="md">{athleteWorkout.exerciseProgress}</Chip>
        </div>

        {/* Set rows */}
        <Card className="p-4">
          {/* header */}
          <div className="grid grid-cols-[24px_1fr_1fr_1fr_24px] gap-2 px-1 pb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80 font-semibold border-b border-hairline">
            <span>Set</span>
            <span className="text-center">KG</span>
            <span className="text-center">Reps</span>
            <span className="text-center">RPE</span>
            <span></span>
          </div>
          {athleteWorkout.sets.map((s, i) => (
            <div key={i} className="grid grid-cols-[24px_1fr_1fr_1fr_24px] gap-2 items-center py-2.5 border-b border-hairline last:border-b-0">
              <span className="text-[12px] text-muted-foreground font-semibold tnum">{i + 1}</span>
              <div className={cn(
                "rounded-xl py-2 text-center text-[15px] font-bold tnum",
                s.done ? "bg-surface-2 text-foreground" : "bg-primary-soft text-primary-soft-foreground"
              )}>
                {s.kg ?? "–"}
              </div>
              <div className={cn(
                "rounded-xl py-2 text-center text-[15px] font-bold tnum",
                s.done ? "bg-surface-2 text-foreground" : "bg-primary-soft text-primary-soft-foreground"
              )}>
                {s.reps ?? "–"}
              </div>
              <div className={cn(
                "rounded-xl py-2 text-center text-[15px] font-bold tnum",
                s.done ? "bg-surface-2 text-foreground" : "bg-primary-soft text-primary-soft-foreground"
              )}>
                {s.rpe ?? "–"}
              </div>
              {s.done ? (
                <div className="h-6 w-6 rounded-full bg-success text-white flex items-center justify-center">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </div>
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground/40" />
              )}
            </div>
          ))}
        </Card>

        {/* Rest timer with circular progress */}
        <Card className="p-6 bg-gradient-brand-soft border-0 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-2">
            Odmor
          </div>
          <div className="relative inline-flex items-center justify-center">
            <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--hairline))" strokeWidth="8" />
              <circle
                cx="60" cy="60" r="52" fill="none"
                stroke="url(#brandGrad)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 52}
                strokeDashoffset={2 * Math.PI * 52 * (1 - pct / 100)}
                className="transition-all duration-1000"
              />
              <defs>
                <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="hsl(322 82% 56%)" />
                  <stop offset="100%" stopColor="hsl(252 82% 60%)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-display text-[40px] font-bold tracking-tightest tnum">
                {formatTime(rest)}
              </span>
            </div>
          </div>
          <button
            onClick={() => setRest(athleteWorkout.restSeconds)}
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Resetuj
          </button>
        </Card>

        <Button variant="brand" size="lg" fullWidth>Završi set ✓</Button>
      </PhoneShell>
      <BottomNav role="athlete" />
    </>
  );
};

export default ActiveWorkout;
