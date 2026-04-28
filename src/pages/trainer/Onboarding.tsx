import { useNavigate } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { User, Building, MapPin, Phone, Plus } from "lucide-react";

const Onboarding = () => {
  const nav = useNavigate();
  return (
    <PhoneShell title="⚡ FITLINK — Trener" back="/" variant="trainer">
      <p className="text-center text-xs text-muted-foreground mb-5">Kreiraj trener profil</p>

      <div className="space-y-2.5">
        {[
          { icon: User, ph: "Ime i prezime" },
          { icon: Building, ph: "Naziv teretane / studia" },
          { icon: MapPin, ph: "Lokacija (grad)" },
          { icon: Phone, ph: "Broj telefona" },
        ].map(({ icon: Icon, ph }) => (
          <div key={ph} className="flex items-center gap-3 rounded-xl bg-surface-3 px-3.5 py-3">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <input
              placeholder={ph}
              className="bg-transparent flex-1 text-sm placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Paketi koje nudim</div>
        <div className="flex gap-2">
          <div className="flex-1 rounded-lg bg-primary-soft text-primary-soft-foreground text-center py-2 text-xs font-semibold">
            Mesečna
          </div>
          <button className="flex-1 rounded-lg border border-dashed border-border text-muted-foreground text-center py-2 text-xs flex items-center justify-center gap-1">
            <Plus className="h-3 w-3" /> Dodaj
          </button>
        </div>
      </div>

      <button
        onClick={() => nav("/trener")}
        className="mt-6 w-full rounded-xl bg-gradient-trainer text-white font-bold py-3.5 shadow-trainer hover:opacity-95 transition"
      >
        NASTAVI →
      </button>
    </PhoneShell>
  );
};

export default Onboarding;
