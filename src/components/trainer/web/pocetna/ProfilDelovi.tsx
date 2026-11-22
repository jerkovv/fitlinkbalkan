import { useZakljucanaZona } from "@/components/pretplata/useZakljucanaZona";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bell,
  BookOpen,
  Camera,
  ChevronRight,
  ClipboardList,
  Clock,
  ImagePlus,
  MapPin,
  UsersRound,
  AlarmClock,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card } from "@/components/ui-bits";
import { useAuth } from "@/hooks/useAuth";
import { redirectToAuth } from "@/hooks/useDesktopWeb";
import { porukaGreske } from "@/lib/errorMessage";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { reci } from "./useStudioPregled";

// Delovi profila trenera na racunaru koji postoje u iOS aplikaciji (TrenerProfilView
// i UrediProfilTreneraView). Telefonski prikaz ih ne koristi.

const MESECI = [
  "Januar", "Februar", "Mart", "April", "Maj", "Jun",
  "Jul", "Avgust", "Septembar", "Oktobar", "Novembar", "Decembar",
];

/** Kvadrat 600 x 600 iz sredine slike, JPEG 0.82, kao SlikaProfila u iOS-u. */
export async function pripremiSlikuProfila(fajl: File): Promise<Blob> {
  const adresa = URL.createObjectURL(fajl);
  try {
    const slika = await new Promise<HTMLImageElement>((ok, ne) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ne(new Error("Slika nije mogla da se otvori. Izaberi drugu."));
      i.src = adresa;
    });
    const strana = Math.min(slika.naturalWidth, slika.naturalHeight);
    if (!strana) throw new Error("Slika nije mogla da se otvori. Izaberi drugu.");
    const platno = document.createElement("canvas");
    platno.width = 600;
    platno.height = 600;
    const c = platno.getContext("2d");
    if (!c) throw new Error("Slika nije mogla da se pripremi.");
    c.drawImage(
      slika,
      (slika.naturalWidth - strana) / 2,
      (slika.naturalHeight - strana) / 2,
      strana,
      strana,
      0,
      0,
      600,
      600,
    );
    return await new Promise<Blob>((ok, ne) =>
      platno.toBlob((b) => (b ? ok(b) : ne(new Error("Slika nije mogla da se pripremi."))), "image/jpeg", 0.82),
    );
  } finally {
    URL.revokeObjectURL(adresa);
  }
}

/** Vrh profila: slika koja ceka na cuvanje, ime, studio i specijalnosti. */
export function ProfilVrh({
  ime,
  studio,
  grad,
  specijalnosti,
  slika,
  nova,
  onNova,
}: {
  ime: string;
  studio: string;
  grad: string;
  specijalnosti: string[];
  slika: string | null;
  nova: File | null;
  onNova: (f: File) => void;
}) {
  const zona = useZakljucanaZona();
  const unos = useRef<HTMLInputElement>(null);
  const [pregled, setPregled] = useState<string | null>(null);

  useEffect(() => {
    if (!nova) {
      setPregled(null);
      return;
    }
    const a = URL.createObjectURL(nova);
    setPregled(a);
    return () => URL.revokeObjectURL(a);
  }, [nova]);

  const izabrana = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Izaberi sliku.");
      return;
    }
    onNova(f);
  };

  const prikaz = pregled ?? slika;
  const mesto = [studio.trim(), grad.trim()].filter(Boolean).join(" · ");

  return (
    <Card {...zona} className="flex items-center gap-5 p-5">
      <input ref={unos} type="file" accept="image/*" className="hidden" onChange={izabrana} />
      <button
        type="button"
        onClick={() => unos.current?.click()}
        aria-label={prikaz ? "Promeni sliku profila" : "Dodaj sliku profila"}
        className="group relative h-[104px] w-[104px] shrink-0 rounded-full bg-gradient-brand p-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-background">
          {prikaz ? (
            <img src={prikaz} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-primary-soft-foreground">
              <ImagePlus className="h-6 w-6" />
              <span className="text-[11px] font-semibold">Dodaj sliku</span>
            </span>
          )}
        </span>
        <span className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full border-[3px] border-background bg-gradient-brand text-white transition group-hover:brightness-110">
          <Camera className="h-3.5 w-3.5" />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Profil trenera</div>
        <div className="mt-1 break-words font-display text-[26px] font-bold leading-tight tracking-[-0.02em]">{ime || "Bez imena"}</div>
        {mesto && (
          <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {mesto}
          </div>
        )}
        {specijalnosti.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {specijalnosti.slice(0, 3).map((s) => (
              <span key={s} className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11.5px] font-semibold">
                {s}
              </span>
            ))}
          </div>
        )}
        {nova && <div className="mt-2 text-[11.5px] font-medium text-warning">Nova slika se čuva dugmetom Sačuvaj izmene.</div>}
      </div>
    </Card>
  );
}

type StanjePretplate = {
  aktivna: boolean;
  status: string | null;
  plan: string | null;
  do: Date | null;
};

const datumDMY = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

function opisPretplate(s: StanjePretplate, dana: number) {
  if (!s.aktivna) return s.do ? `Istekla ${datumDMY(s.do)}` : "Nemaš aktivnu pretplatu";
  if (s.status === "trialing") return s.do ? `Probni period, još ${reci.dana(dana)}` : "Probni period";
  if (!s.do) return "Pretplata aktivna";
  if (s.plan === "yearly") return `Godišnja pretplata aktivna do ${datumDMY(s.do)}`;
  if (s.plan === "monthly") return `Mesečna pretplata aktivna do ${datumDMY(s.do)}`;
  return `Pretplata aktivna do ${datumDMY(s.do)}`;
}

/** Kartica FitLink pretplate sa krugom preostalih dana, i kad je pretplata istekla. */
export function ProfilPretplata() {
  const { user } = useAuth();
  const [s, setS] = useState<StanjePretplate | null>(null);
  const [pala, setPala] = useState(false);

  useEffect(() => {
    if (!user) return;
    let ziv = true;
    (async () => {
      const [pristup, red] = await Promise.all([
        supabase.rpc("trainer_has_active_fitlink_sub", { p_trainer_id: user.id }),
        supabase
          .from("trainer_subscriptions")
          .select("status, plan, access_until, current_period_end, trial_ends_at")
          .eq("trainer_id", user.id)
          .maybeSingle(),
      ]);
      if (!ziv) return;
      const greska = pristup.error ?? red.error;
      if (greska) {
        setPala(true);
        toast.error(porukaGreske(greska));
        return;
      }
      const r = red.data as {
        status: string | null;
        plan: string | null;
        access_until: string | null;
        current_period_end: string | null;
        trial_ends_at: string | null;
      } | null;
      const iso = r?.access_until ?? r?.current_period_end ?? r?.trial_ends_at ?? null;
      const d = iso ? new Date(iso) : null;
      setS({
        aktivna: pristup.data === true,
        status: r?.status ?? null,
        plan: r?.plan ?? null,
        do: d && !isNaN(d.getTime()) ? d : null,
      });
    })();
    return () => {
      ziv = false;
    };
  }, [user]);

  const dana = s?.do ? Math.max(0, Math.floor((s.do.getTime() - Date.now()) / 86_400_000)) : 0;
  const obim = 2 * Math.PI * 23;

  return (
    <Card className="flex items-center gap-3.5 p-4">
      <div className="relative h-14 w-14 shrink-0">
        <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90" aria-hidden>
          <circle cx="28" cy="28" r="23" fill="none" strokeWidth="5" className="stroke-white/10" />
          {s && (
            <circle
              cx="28"
              cy="28"
              r="23"
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={obim}
              strokeDashoffset={obim * (1 - Math.min(1, dana / 30))}
              className={s.aktivna ? "stroke-success" : "stroke-destructive"}
            />
          )}
        </svg>
        {s && (
          <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <span className="fig text-[14px]">{dana}</span>
            <span className="mt-0.5 text-[9px] text-muted-foreground">dana</span>
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">FitLink pretplata</div>
        <div className="mt-1 text-[13px] font-semibold leading-snug">
          {s ? opisPretplate(s, dana) : pala ? "Stanje nije učitano" : ""}
        </div>
      </div>
    </Card>
  );
}

/** Prosli mesec kao kartica za Instagram; pravi se u Objavama. */
export function ProfilMesec() {
  const sad = new Date();
  const m = new Date(sad.getFullYear(), sad.getMonth() - 1, 1);
  return (
    <Link
      to="/trener/objave?kartica=mesec"
      className="card-premium-hover flex items-center gap-3 rounded-[24px] px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-primary-soft-foreground">
        <BarChart3 className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold">Mesec u brojkama</span>
        <span className="block text-[11.5px] text-muted-foreground">
          {MESECI[m.getMonth()]} {m.getFullYear()}
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-gradient-brand px-3.5 py-2 text-[12px] font-semibold text-white">Podeli mesec</span>
    </Link>
  );
}

const Grupa = ({ naslov, children }: { naslov: string; children: ReactNode }) => (
  <div>
    <div className="mb-1 px-1 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{naslov}</div>
    <div className="divide-y divide-hairline">{children}</div>
  </div>
);

const Red = ({ to, Ikona, naslov, opis }: { to: string; Ikona: LucideIcon; naslov: string; opis: string }) => (
  <Link
    to={to}
    className="flex items-center gap-3 rounded-md px-1 py-2.5 transition hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
  >
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-primary-soft-foreground">
      <Ikona className="h-4 w-4" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[13.5px] font-medium">{naslov}</span>
      <span className="block text-[11.5px] text-muted-foreground">{opis}</span>
    </span>
    <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
  </Link>
);

/** Iste celine kao na profilu u aplikaciji. */
export function ProfilCeline() {
  return (
    <Card className="space-y-4 p-5">
      <Grupa naslov="Studio">
        <Red to="/trener/programi" Ikona={ClipboardList} naslov="Programi" opis="Planovi treninga i dodela" />
        <Red to="/trener/biblioteka" Ikona={BookOpen} naslov="Biblioteka vežbi" opis="Sve vežbe sa snimkom" />
        <Red to="/trener/ishrana" Ikona={Utensils} naslov="Planovi ishrane" opis="Obroci i makroi za vežbače" />
      </Grupa>
      <Grupa naslov="Termini">
        <Red to="/trener/termini" Ikona={Clock} naslov="Termini" opis="Vrste treninga i nedeljni raspored" />
      </Grupa>
      <Grupa naslov="Obaveštenja">
        <Red to="/trener/podsetnici" Ikona={AlarmClock} naslov="Podsetnici za termine" opis="Pre termina i pregled dana" />
        <Red to="/trener/podsetnici-klijenti" Ikona={UsersRound} naslov="Podsetnici za klijente" opis="Kada vežbačima stiže podsetnik" />
        <Red to="/trener/notifikacije" Ikona={Bell} naslov="Notifikacije" opis="Šta se dešava kod vežbača" />
      </Grupa>
    </Card>
  );
}

export function ProfilOdjava() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [otvoreno, setOtvoreno] = useState(false);
  const [radi, setRadi] = useState(false);

  const odjavi = async () => {
    setRadi(true);
    try {
      await signOut();
      toast.success("Odjavljen si");
      redirectToAuth(navigate);
    } catch (e) {
      toast.error(porukaGreske(e));
      setRadi(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOtvoreno(true)}
        className={cn(
          "h-[52px] w-full rounded-[20px] border border-destructive/30 bg-destructive/10 text-[14px] font-semibold text-destructive transition hover:bg-destructive/15",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive",
        )}
      >
        Odjavi se
      </button>
      <AlertDialog open={otvoreno} onOpenChange={setOtvoreno}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Odjava</AlertDialogTitle>
            <AlertDialogDescription>Posle odjave treba ponovo da uneseš lozinku.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={radi}>Odustani</AlertDialogCancel>
            <AlertDialogAction
              disabled={radi}
              onClick={(e) => {
                e.preventDefault();
                void odjavi();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Odjavi se
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
