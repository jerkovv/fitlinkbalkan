import { Link } from "react-router-dom";
import { Briefcase, Dumbbell, ArrowRight, Sparkles } from "lucide-react";

const Index = () => {
  return (
    <div className="phone-shell flex flex-col px-6 py-8 min-h-screen relative overflow-hidden">
      {/* Decorative gradient blobs */}
      <div className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-gradient-brand opacity-20 blur-3xl" />
      <div className="pointer-events-none absolute top-40 -left-32 h-72 w-72 rounded-full bg-gradient-brand opacity-15 blur-3xl" />

      <div className="relative flex-1 flex flex-col">
        {/* Brand mark */}
        <div className="pt-8 mb-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-hairline shadow-xs">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold tracking-tight text-foreground">
              FitLink · Premium
            </span>
          </div>
        </div>

        {/* Hero */}
        <div className="mt-10 mb-12 animate-fade-in">
          <h1 className="font-display text-[44px] leading-[1.02] font-bold tracking-tightest">
            Trening, <br />
            <span className="text-gradient-brand">povezan.</span>
          </h1>
          <p className="mt-4 text-[15px] leading-[1.45] text-muted-foreground max-w-[300px]">
            Mesto gde treneri vode, a vežbači rastu. Programi, termini i članarine na jednom mestu.
          </p>
        </div>

        {/* Role picker */}
        <div className="space-y-3 pb-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-1">
            Izaberi ulogu
          </p>

          <Link
            to="/trener/onboarding"
            className="group block card-premium-hover p-5"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-trainer-soft text-trainer-soft-foreground flex items-center justify-center">
                <Briefcase className="h-5 w-5" strokeWidth={2.25} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-[17px] font-semibold tracking-tighter">
                  Ja sam Trener
                </div>
                <div className="text-[13px] text-muted-foreground mt-0.5">
                  Vodim svoje vežbače i programe
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition" />
            </div>
          </Link>

          <Link
            to="/vezbac/onboarding"
            className="group block card-premium-hover p-5"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-athlete-soft text-athlete-soft-foreground flex items-center justify-center">
                <Dumbbell className="h-5 w-5" strokeWidth={2.25} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-[17px] font-semibold tracking-tighter">
                  Ja sam Vežbač
                </div>
                <div className="text-[13px] text-muted-foreground mt-0.5">
                  Pratim trening i napredak
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition" />
            </div>
          </Link>

          <p className="pt-4 text-[11px] text-center text-muted-foreground/70">
            v0.2 · UI demo
          </p>
        </div>
      </div>
    </div>
  );
};

export default Index;
