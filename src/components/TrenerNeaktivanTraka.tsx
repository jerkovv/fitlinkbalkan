import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

// Traka koja se javi vezbacu kad njegov trener nema aktivnu FitLink pretplatu.
// Trener tada ne moze da mu dodeli program, objavi plan ni potvrdi uplatu, pa je
// postenije reci mu nego da app tiho zamre.
//
// Namerno NE pominje pretplatu ni novac - to je odnos trenera i FitLink-a, ne
// vezbaca. Vezbac dobija samo posledicu i sta da uradi.
// Ekrani gde traka NE sme da se pojavi: tokom aktivnog treninga prekriva listu
// serija, a vezbac usred seta ionako ne moze nista da uradi povodom nje.
const SAKRIJ_NA = ["/vezbac/trening/aktivan/", "/vezbac/slobodan-trening/"];

export const TrenerNeaktivanTraka = () => {
  const { user, role } = useAuth();
  const { pathname } = useLocation();
  const [neaktivan, setNeaktivan] = useState(false);
  // Zatvaranje vazi do sledeceg pokretanja app-a: poruka se procita jednom i ne
  // stoji preko sadrzaja, ali se sledeci put opet javi dok se stanje ne promeni.
  const [zatvoreno, setZatvoreno] = useState(false);

  useEffect(() => {
    if (!user || role !== "athlete") return;
    let otkazano = false;

    const proveri = async () => {
      const { data, error } = await supabase.rpc("my_trainer_is_active" as never);
      if (otkazano || error) return;      // na gresci ne plasi korisnika bez potrebe
      setNeaktivan(data === false);
    };

    proveri();

    // Osvezi na povratak app-a u prvi plan I periodicno. Bez intervala traka bi
    // ostala da visi (ili izostala) sve dok vezbac ne izadje iz app-a i vrati se -
    // a status trenera se menja bez njegovog ucesca.
    const naVidljivost = () => {
      if (document.visibilityState === "visible") proveri();
    };
    document.addEventListener("visibilitychange", naVidljivost);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") proveri();
    }, 60000);

    return () => {
      otkazano = true;
      document.removeEventListener("visibilitychange", naVidljivost);
      clearInterval(id);
    };
  }, [user, role]);

  if (!neaktivan || zatvoreno) return null;
  if (SAKRIJ_NA.some((p) => pathname.startsWith(p))) return null;

  return (
    <div
      className="fixed left-1/2 z-40 w-[calc(100%-32px)] max-w-[400px] -translate-x-1/2
                 flex items-start gap-2.5 rounded-2xl border border-warning/25
                 bg-warning-soft/95 px-3.5 py-2.5 shadow-large backdrop-blur-xl"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 100px)" }}
      role="status"
    >
      <AlertTriangle className="h-4 w-4 mt-px flex-none text-warning-soft-foreground" strokeWidth={2.5} />
      <span className="min-w-0 flex-1 text-left text-[12.5px] font-semibold leading-snug text-warning-soft-foreground">
        Trener nije aktivan
        <span className="block font-medium opacity-80">
          Ne može da ti dodeljuje planove ni potvrđuje uplate. Javi mu se.
        </span>
      </span>
      <button
        type="button"
        onClick={() => setZatvoreno(true)}
        aria-label="Zatvori"
        className="-mr-1 -mt-1 flex h-7 w-7 flex-none items-center justify-center rounded-full
                   text-warning-soft-foreground/70 active:opacity-60 transition"
      >
        <X className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </div>
  );
};

export default TrenerNeaktivanTraka;
