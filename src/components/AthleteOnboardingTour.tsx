import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Dumbbell, CalendarDays, IdCard, Sparkles, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "fitlink:athlete_tour_seen_v1";

const STEPS = [
  {
    icon: Dumbbell,
    eyebrow: "Korak 1",
    title: "Tvoj plan treninga",
    body: "Trener ti je dodelio program. Svaki dan rotira automatski — samo tapni „Počni trening“ kada si spreman.",
  },
  {
    icon: CalendarDays,
    eyebrow: "Korak 2",
    title: "Rezerviši termin",
    body: "U Booking sekciji vidiš kada je trener slobodan i biraš termin koji ti odgovara. Otkazivanje je takođe jednim klikom.",
  },
  {
    icon: IdCard,
    eyebrow: "Korak 3",
    title: "Članarina i napredak",
    body: "Prati istek članarine i preostale termine, a u „Napredak“ vidi lične rekorde, težinu i progress fotke.",
  },
];

interface Props {
  /** Force-show iz UI (npr. dugme „Pregled aplikacije“). */
  forceOpen?: boolean;
  onClose?: () => void;
}

export const AthleteOnboardingTour = ({ forceOpen, onClose }: Props) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (forceOpen) {
      setStep(0);
      setOpen(true);
      return;
    }
    if (typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        const t = setTimeout(() => setOpen(true), 600);
        return () => clearTimeout(t);
      }
    } catch { /* ignore */ }
  }, [forceOpen]);

  const dismiss = () => {
    try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
    onClose?.();
  };

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden border-0">
        <div className="bg-gradient-brand text-white px-6 pt-8 pb-6 relative">
          <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
          <div className="absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
              <Icon className="h-6 w-6" strokeWidth={2} />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/85">
                {current.eyebrow}
              </div>
              <div className="font-display text-[20px] font-bold tracking-tight leading-tight mt-0.5">
                {current.title}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 pt-5 pb-6 space-y-5">
          <p className="text-[14px] leading-relaxed text-foreground/85">{current.body}</p>

          <div className="flex items-center justify-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step ? "w-6 bg-primary" : "w-1.5 bg-muted"
                )}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1 text-muted-foreground" onClick={dismiss}>
              Preskoči
            </Button>
            <Button
              className="flex-1 shadow-brand"
              onClick={() => {
                if (isLast) dismiss();
                else setStep((s) => s + 1);
              }}
            >
              {isLast ? (
                <>Razumem <Sparkles className="h-4 w-4 ml-1.5" /></>
              ) : (
                <>Dalje <ChevronRight className="h-4 w-4 ml-1" /></>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
