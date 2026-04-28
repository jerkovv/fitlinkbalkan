import { useNavigate } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { Button } from "@/components/ui-bits";
import { User, Building2, MapPin, Phone, Plus, Check } from "lucide-react";

const fields = [
  { icon: User, ph: "Ime i prezime", autoFocus: true },
  { icon: Building2, ph: "Naziv teretane / studia" },
  { icon: MapPin, ph: "Lokacija (grad)" },
  { icon: Phone, ph: "Broj telefona" },
];

const Onboarding = () => {
  const nav = useNavigate();
  return (
    <PhoneShell title="Kreiraj trener profil" eyebrow="Korak 1 od 2" back="/">
      <div className="space-y-2.5">
        {fields.map(({ icon: Icon, ph, autoFocus }) => (
          <div
            key={ph}
            className="flex items-center gap-3 card-premium px-4 py-3.5 focus-within:ring-2 focus-within:ring-primary/40 transition"
          >
            <Icon className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={2} />
            <input
              autoFocus={autoFocus}
              placeholder={ph}
              className="bg-transparent flex-1 text-[15px] placeholder:text-muted-foreground/70 focus:outline-none"
            />
          </div>
        ))}
      </div>

      <div className="pt-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2.5">
          Paketi koje nudim
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="pill bg-primary-soft text-primary-soft-foreground px-4 py-2 text-[13px]">
            <Check className="h-3.5 w-3.5 mr-1.5" /> Mesečna · 5.000 RSD
          </button>
          <button className="pill bg-surface border border-dashed border-hairline text-muted-foreground hover:text-foreground hover:border-foreground/30 px-4 py-2 text-[13px]">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Dodaj paket
          </button>
        </div>
      </div>

      <div className="pt-4">
        <Button variant="brand" size="lg" fullWidth onClick={() => nav("/trener")}>
          Završi i nastavi
        </Button>
      </div>
    </PhoneShell>
  );
};

export default Onboarding;
