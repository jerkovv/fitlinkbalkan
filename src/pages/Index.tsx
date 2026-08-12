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
          <svg viewBox="0 0 1012.12 152.08" className="h-5 w-auto" aria-hidden="true">
            <defs>
              <linearGradient id="fitlinkBrandGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#8935E9" />
                <stop offset="55%" stopColor="#603EEA" />
                <stop offset="100%" stopColor="#E949AE" />
              </linearGradient>
            </defs>
            <g fill="url(#fitlinkBrandGradient)">
              <path d="M985.49,19.31h-4.73v-2.78h12.87v2.78h-4.73v11.98h-3.42v-11.98Z" />
              <path d="M1008.92,31.3l-.02-8.86-4.35,7.3h-1.54l-4.32-7.11v8.67h-3.21v-14.77h2.83l5.53,9.18,5.44-9.18h2.81l.04,14.77h-3.21Z" />
              <path d="M281.18,119.51V16.17h64.96v17.72h-45.47v24.95h41.93v17.72h-41.93v42.96h-19.49Z" />
              <path d="M389.55,119.51V16.17h19.49v103.34h-19.49Z" />
              <path d="M481.96,119.51V33.89h-30.12v-17.72h79.72v17.72h-30.12v85.63h-19.49Z" />
              <path d="M574.38,119.51V16.17h19.49v85.63h47.24v17.72h-66.73Z" />
              <path d="M683.92,119.51V16.17h19.49v103.34h-19.49Z" />
              <path d="M752.42,119.51V16.17h37.06l20.52,90.05h2.66V16.17h19.19v103.34h-37.06l-20.52-90.05h-2.66v90.05h-19.19Z" />
              <path d="M880.86,119.51V16.17h19.49v41.04h2.66l33.51-41.04h24.95l-43.11,50.93,44.58,52.41h-25.69l-34.25-41.93h-2.66v41.93h-19.49Z" />
              <path d="M194.88,0l-41.85,23.96v22.51l34.6-19.81,29.42,51.39-75.08,42.98c-3.04,1.74-5.72.57-6.73-.02-1.01-.59-3.36-2.33-3.36-5.83v-10.64s58.43-33.45,58.43-33.45l-9.7-16.95-48.73,27.9v-23.45s0,0,0,0v-22.51l-.03.02c-.18-9.26-5.05-17.54-13.09-22.2-8.2-4.75-18.01-4.78-26.23-.07L0,66.78l48.83,85.3,44.16-25.28v-22.51l-36.91,21.13-29.42-51.39L102.24,30.76c3.04-1.74,5.72-.57,6.73.02s3.36,2.33,3.36,5.83v10.64s-55.68,31.88-55.68,31.88l9.7,16.95,45.98-26.32v23.45s-.06.04-.06.04v22.51l.08-.04c.18,9.26,5.05,17.54,13.09,22.2,8.2,4.75,18.01,4.78,26.23.07l92.03-52.68L194.88,0Z" />
            </g>
          </svg>
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
