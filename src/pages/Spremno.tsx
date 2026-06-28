import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

const COPY: Record<string, { title: string; subtitle: string }> = {
  registracija: {
    title: "Nalog je napravljen!",
    subtitle: "Otvori FitLink aplikaciju i prijavi se da nastaviš.",
  },
  reset: {
    title: "Lozinka je promenjena!",
    subtitle: "Otvori FitLink aplikaciju i prijavi se sa novom lozinkom.",
  },
  potvrda: {
    title: "Email je potvrđen!",
    subtitle: "Otvori FitLink aplikaciju i prijavi se da nastaviš.",
  },
};

const DEFAULT_COPY = {
  title: "Spremno!",
  subtitle: "Otvori FitLink aplikaciju i prijavi se.",
};

export default function Spremno() {
  const [params] = useSearchParams();
  const tip = params.get("tip") ?? "";
  const copy = COPY[tip] ?? DEFAULT_COPY;

  useEffect(() => {
    // odjavi eventualnu web sesiju da korisnik ne ostane ulogovan u pregledacu
    supabase.auth.signOut().catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f7fb] px-5">
      <div className="w-full max-w-md rounded-3xl bg-white border border-[#ececf2] shadow-sm px-7 py-10 text-center">
        <div className="text-[22px] font-extrabold tracking-tight text-[#16161f] mb-8">
          Fit<span className="text-[#8935E9]">Link</span>
        </div>

        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 rounded-2xl bg-[#f1e9fd] flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-[#8935E9]" strokeWidth={2.2} />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-[#16161f] mb-2">{copy.title}</h1>
        <p className="text-[15px] leading-relaxed text-[#5b5b66] mb-8">{copy.subtitle}</p>

        <div className="rounded-2xl bg-[#faf7ff] border border-[#eee7fb] px-5 py-4">
          <p className="text-[13px] font-medium text-[#8935E9] mb-1">FitLink aplikacija</p>
          <p className="text-[13px] text-[#8c8c99]">Uskoro na App Store i Google Play</p>
        </div>
      </div>
    </div>
  );
}
