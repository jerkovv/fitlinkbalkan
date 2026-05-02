import { useEffect, useRef, useState } from "react";
import { Plus, SkipForward } from "lucide-react";

interface RestTimerProps {
  /** Target rest in seconds. */
  targetSeconds: number;
  /** Called when timer reaches 0 OR user presses Preskoci. */
  onDone: () => void;
  /** Optional title above timer (e.g. "Sledeca serija 2 od 4"). */
  subtitle?: string;
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

const triggerHaptic = async () => {
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(120);
    }
  }
};

const playDing = () => {
  try {
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    o.type = "sine";
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.55);
  } catch {
    /* noop */
  }
};

export const RestTimer = ({ targetSeconds, onDone, subtitle }: RestTimerProps) => {
  const [target, setTarget] = useState(targetSeconds);
  const [remaining, setRemaining] = useState(targetSeconds);
  const firedRef = useRef(false);

  useEffect(() => {
    setTarget(targetSeconds);
    setRemaining(targetSeconds);
    firedRef.current = false;
  }, [targetSeconds]);

  useEffect(() => {
    if (remaining <= 0) {
      if (!firedRef.current) {
        firedRef.current = true;
        triggerHaptic();
        playDing();
        const t = setTimeout(() => onDone(), 500);
        return () => clearTimeout(t);
      }
      return;
    }
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [remaining, onDone]);

  const radius = 110;
  const circ = 2 * Math.PI * radius;
  const pct = target > 0 ? remaining / target : 0;
  const offset = circ * (1 - pct);
  const elapsed = Math.max(0, target - remaining);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col items-center justify-center px-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1">
        Odmor
      </div>
      {subtitle && (
        <div className="text-[14px] text-foreground/80 mb-6">{subtitle}</div>
      )}

      <div className="relative">
        <svg width="260" height="260" viewBox="0 0 260 260" className="-rotate-90">
          <circle
            cx="130"
            cy="130"
            r={radius}
            fill="none"
            stroke="hsl(var(--hairline))"
            strokeWidth="10"
          />
          <circle
            cx="130"
            cy="130"
            r={radius}
            fill="none"
            stroke="url(#restGrad)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-linear"
          />
          <defs>
            <linearGradient id="restGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="hsl(322 82% 56%)" />
              <stop offset="100%" stopColor="hsl(252 82% 60%)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[64px] leading-none font-bold tracking-tightest tnum text-foreground">
            {fmt(remaining)}
          </span>
          <span className="text-[12px] text-muted-foreground mt-2 tnum">
            {fmt(elapsed)} / {fmt(target)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-10 w-full max-w-[360px]">
        <button
          onClick={() => {
            setTarget((t) => t + 30);
            setRemaining((r) => r + 30);
          }}
          className="flex-1 h-12 rounded-2xl bg-surface border border-hairline text-[14px] font-semibold inline-flex items-center justify-center gap-1.5 active:scale-95 transition"
        >
          <Plus className="h-4 w-4" /> 30s
        </button>
        <button
          onClick={() => {
            setTarget((t) => t + 60);
            setRemaining((r) => r + 60);
          }}
          className="flex-1 h-12 rounded-2xl bg-surface border border-hairline text-[14px] font-semibold inline-flex items-center justify-center gap-1.5 active:scale-95 transition"
        >
          <Plus className="h-4 w-4" /> 60s
        </button>
        <button
          onClick={() => onDone()}
          className="flex-1 h-12 rounded-2xl bg-gradient-brand text-white text-[14px] font-bold inline-flex items-center justify-center gap-1.5 active:scale-95 transition shadow-brand"
        >
          <SkipForward className="h-4 w-4" /> Preskoci
        </button>
      </div>
    </div>
  );
};

export default RestTimer;
