import { Link } from "react-router-dom";
import { Briefcase, Dumbbell, Zap } from "lucide-react";

const Index = () => {
  return (
    <div className="phone-shell flex flex-col items-center justify-center px-6 py-12 min-h-screen">
      <div className="flex-1 flex flex-col items-center justify-center w-full text-center animate-fade-in">
        <div className="flex items-center gap-3 mb-3">
          <Zap className="h-10 w-10 text-accent-bright fill-accent-bright/30" strokeWidth={2.5} />
          <h1 className="font-display text-5xl font-black tracking-tight text-gradient-brand">FITLINK</h1>
        </div>
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-16">
          Trener × Vežbač Platform
        </p>

        <div className="w-full space-y-4">
          <p className="text-sm text-muted-foreground mb-6">Izaberi svoju ulogu</p>

          <Link
            to="/trener/onboarding"
            className="group block rounded-2xl bg-gradient-card-trainer border border-primary/30 p-5 text-left shadow-card hover:shadow-trainer hover:border-primary transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-primary/20 p-3">
                <Briefcase className="h-6 w-6 text-primary-soft-foreground" />
              </div>
              <div className="flex-1">
                <div className="text-base font-bold text-primary-soft-foreground">Ja sam Trener</div>
                <div className="text-xs text-primary-soft-foreground/70">Vodim svoje vežbače i programe</div>
              </div>
              <span className="text-primary-soft-foreground/60 group-hover:translate-x-1 transition">→</span>
            </div>
          </Link>

          <Link
            to="/vezbac/onboarding"
            className="group block rounded-2xl bg-gradient-card-athlete border border-accent/30 p-5 text-left shadow-card hover:shadow-athlete hover:border-accent transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-accent/20 p-3">
                <Dumbbell className="h-6 w-6 text-accent-soft-foreground" />
              </div>
              <div className="flex-1">
                <div className="text-base font-bold text-accent-soft-foreground">Ja sam Vežbač</div>
                <div className="text-xs text-accent-soft-foreground/70">Pratim trening i napredak</div>
              </div>
              <span className="text-accent-soft-foreground/60 group-hover:translate-x-1 transition">→</span>
            </div>
          </Link>
        </div>

        <p className="mt-12 text-[10px] uppercase tracking-widest text-muted-foreground/50">
          v0.1 · UI demo
        </p>
      </div>
    </div>
  );
};

export default Index;
