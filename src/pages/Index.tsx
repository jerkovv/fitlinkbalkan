import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Briefcase, Dumbbell, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { roleHome } from "@/lib/roles";

const Index = () => {
  const { user, role, initializing, roleLoading } = useAuth();
  const navigate = useNavigate();
  // Cekamo i initializing i roleLoading, ne samo initializing - inace bi se
  // ovde na trenutak ubacio "izaberi ulogu" ekran dok se role tek ucitava
  // posle validne sesije, pre nego sto se ovaj efekat ponovo pokrene.
  const home = user && role ? roleHome(role) : null;

  useEffect(() => {
    if (initializing || roleLoading) return;
    if (home) navigate(home, { replace: true });
  }, [home, initializing, roleLoading, navigate]);

  // Ulogovan korisnik sa poznatom ulogom ide pravo na dashboard - ne prikazuj
  // "izaberi ulogu" ekran ni na trenutak dok redirect (useEffect gore) ne odigra.
  if (initializing || roleLoading || home) {
    return null;
  }

  return (
    <div
      className="phone-shell flex flex-col px-6 pb-8 relative overflow-x-hidden"
      style={{ paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 12px)" }}
    >
      {/* Decorative gradient blobs */}
      <div className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-gradient-brand opacity-20 blur-3xl" />
      <div className="pointer-events-none absolute top-40 -left-32 h-72 w-72 rounded-full bg-gradient-brand opacity-15 blur-3xl" />

      <div className="relative flex-1 flex flex-col">
        {/* Brand mark */}
        <div className="pt-8 mb-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-hairline shadow-xs">
            <svg viewBox="0 0 828.12 517.2" className="h-3 w-auto text-foreground" fill="currentColor" aria-hidden="true">
              <path d="M662.2.44l-142.2,81.41v76.48l117.57-67.31,99.98,174.63-255.11,146.05c-10.34,5.92-19.44,1.93-22.88-.06-3.43-1.99-11.42-7.91-11.42-19.82v-36.17s198.53-113.66,198.53-113.66l-32.97-57.6-165.59,94.8-.02-79.69.05-.03v-76.48l-.09.05c-.61-31.48-17.15-59.58-44.49-75.43-27.86-16.15-61.18-16.24-89.13-.24L0,227.37l165.92,289.83,150.04-85.9v-76.48l-125.42,71.8-99.98-174.63L347.39,104.97c10.34-5.92,19.44-1.93,22.87.06,3.43,1.99,11.42,7.91,11.42,19.82v36.17s-189.19,108.31-189.19,108.31l32.97,57.6,156.25-89.45.02,79.69-.23.13v76.48l.27-.15c.61,31.48,17.15,59.58,44.49,75.43,27.86,16.15,61.18,16.24,89.13.24l312.71-179.02L662.2.44Z" />
            </svg>
            <span className="text-[11px] font-semibold tracking-tight text-foreground">
              FitLink
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
            to="/auth"
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
            to="/poziv"
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
                  Potreban ti je poziv od trenera
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition" />
            </div>
          </Link>

          <Link to="/auth" className="block text-[12px] text-center text-primary hover:underline pt-2">
            Već imaš nalog? Uloguj se
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Index;
