import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Loader2, Lock, LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

// Tvrdi gating trenerskog dela app-a: bez aktivne FitLink pretplate trener vidi LOCK
// ekran umesto trenerskog UI-a. Montiran je nad svim /trener/* rutama (parent <Outlet/>),
// pa se provera radi jednom na ulazak (ne na svaki tab), plus na povratak app-a u prvi plan
// i, dok je zakljucano, na svakih 5s (auto-otkljucavanje cim pretplata postane aktivna).
//
// Gating vazi SAMO za potvrdjene trenere (role === "trainer"). Za sve ostalo (ucitavanje,
// vezbac, nalog bez uloge) renderujemo <Outlet/> i puštamo ProtectedRoute po ruti da
// odradi auth/preusmerenje po ulozi - da atleta ne zaglavi na trenerskom lock ekranu.
//
// Apple-uskladjeno: lock ekran nema cenu, nema link/dugme ka kupovini, nema CTA ka placanju.

// Neutralna cinjenica na lock ekranu, izvedena iz statusa reda pretplate (bez cene/linka).
function factForStatus(status: string | null): string | null {
  if (status === "trialing") return "Probni period je istekao.";
  if (
    status === "active" ||
    status === "past_due" ||
    status === "canceled" ||
    status === "expired"
  ) {
    return "Pretplata je istekla.";
  }
  // incomplete ili nema reda -> samo generican tekst, bez dodatne cinjenice.
  return null;
}

const FullScreenLoader = () => (
  <div className="min-h-[100dvh] flex items-center justify-center bg-background">
    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  </div>
);

const TrainerLockScreen = ({
  fact,
  signingOut,
  onSignOut,
}: {
  fact: string | null;
  signingOut: boolean;
  onSignOut: () => void;
}) => (
  <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-6 text-center">
    <div className="w-full max-w-sm">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft">
        <Lock className="h-7 w-7 text-primary" strokeWidth={2.2} />
      </div>
      <h1 className="font-display text-[26px] leading-[1.1] font-bold tracking-tight text-foreground">
        Nalog nema aktivnu pretplatu
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        Trenerske funkcije su trenutno nedostupne.
      </p>
      {fact && <p className="mt-2 text-[13.5px] text-muted-foreground/80">{fact}</p>}
      <Button
        variant="outline"
        size="lg"
        className="mt-8 w-full"
        onClick={onSignOut}
        disabled={signingOut}
      >
        {signingOut ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <LogOut className="h-4 w-4 mr-2" />
        )}
        Odjava
      </Button>
    </div>
  </div>
);

export const TrainerLayout = () => {
  const { role, loading, signOut } = useAuth();
  const nav = useNavigate();

  // false posle unmount-a: async provera ne sme da menja stanje otkacenog layout-a.
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  // null = jos proveravamo (prikazi kratak loading, ne prazno). true/false = rezultat provere.
  const [access, setAccess] = useState<boolean | null>(null);
  const [lockFact, setLockFact] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // Prethodni pristup: toast "Pretplata aktivna" bukne SAMO na prelaz false -> true
  // (ne na prvi ulazak dok je pretplata vec aktivna).
  const prevAccessRef = useRef<boolean | null>(null);

  const checkAccess = useCallback(async () => {
    if (!aliveRef.current) return;
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id ?? null;
      if (!aliveRef.current) return;
      if (!uid) return; // bez sesije: ProtectedRoute preusmerava na /auth

      const { data: hasAccess, error } = await supabase.rpc(
        "trainer_has_active_fitlink_sub",
        { p_trainer_id: uid },
      );
      if (!aliveRef.current) return;
      // Na gresci (npr. mreza): NE zakljucavaj. Zadrzi postojece stanje; poll/foreground opet proba.
      if (error) return;
      const ok = hasAccess === true;

      if (!ok) {
        // Zakljucano: procitaj status reda za neutralnu cinjenicu (RLS: svoj red).
        const { data: row } = await supabase
          .from("trainer_subscriptions")
          .select("status")
          .eq("trainer_id", uid)
          .maybeSingle();
        if (!aliveRef.current) return;
        setLockFact(factForStatus((row as { status?: string } | null)?.status ?? null));
      }

      if (ok && prevAccessRef.current === false) {
        toast.success("Pretplata aktivna");
      }
      prevAccessRef.current = ok;
      setAccess(ok);
    } catch {
      // tiho: sledeci poll/foreground opet proba
    }
  }, []);

  // Prva provera cim znamo da je korisnik trener.
  useEffect(() => {
    if (role !== "trainer") return;
    checkAccess();
  }, [role, checkAccess]);

  // Povratak app-a u prvi plan -> ponovna provera (i za otkljucavanje i za istek).
  useEffect(() => {
    if (role !== "trainer") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") checkAccess();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [role, checkAccess]);

  // Poll na 5s dok pristup NIJE potvrdjen (jos proveravamo ili je zakljucano) -> auto-otkljucavanje
  // cim pretplata postane aktivna. Cim je pristup true, poll se gasi. Preskace kad je app u pozadini.
  useEffect(() => {
    if (role !== "trainer") return;
    if (access === true) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") checkAccess();
    }, 5000);
    return () => clearInterval(id);
  }, [role, access, checkAccess]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      nav("/auth", { replace: true });
    } catch {
      if (aliveRef.current) setSigningOut(false);
    }
  };

  // Ne-treneri (ucitavanje, vezbac, nalog bez uloge): renderuj Outlet; ProtectedRoute
  // po ruti resava auth i preusmerenje po ulozi. Gating vazi SAMO za potvrdjene trenere.
  if (loading || role !== "trainer") {
    return <Outlet />;
  }

  if (access === null) {
    return <FullScreenLoader />;
  }

  if (!access) {
    return (
      <TrainerLockScreen
        fact={lockFact}
        signingOut={signingOut}
        onSignOut={handleSignOut}
      />
    );
  }

  return <Outlet />;
};

export default TrainerLayout;
