import { useEffect, useState } from "react";
import {
  Activity, Battery, Flame, Footprints, Heart, HeartPulse, Loader2, Moon, Timer, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { porukaGreske } from "@/lib/errorMessage";
import { supabase } from "@/lib/supabase";
import { brojTekst } from "./aktivnost";

type Mera = { data_type: string; value: number | null };

// Isti redosled i natpisi kao na telefonu (MeraZdravlja.redosled).
const REDOSLED: { tip: string; naziv: string; Ikona: LucideIcon }[] = [
  { tip: "heart_rate_resting", naziv: "Puls u mirovanju", Ikona: Heart },
  { tip: "heart_rate_avg", naziv: "Prosečan puls", Ikona: Activity },
  { tip: "heart_rate_max", naziv: "Max puls", Ikona: HeartPulse },
  { tip: "steps", naziv: "Koraci", Ikona: Footprints },
  { tip: "sleep_minutes", naziv: "San", Ikona: Moon },
  { tip: "calories_active", naziv: "Kalorije", Ikona: Flame },
  { tip: "workout_duration", naziv: "Trening", Ikona: Timer },
  { tip: "recovery_score", naziv: "Oporavak", Ikona: Battery },
];

const prikaz = (tip: string, v: number): { vrednost: string; jedinica: string } => {
  switch (tip) {
    case "heart_rate_avg":
    case "heart_rate_max":
    case "heart_rate_resting":
      return { vrednost: String(Math.round(v)), jedinica: "bpm" };
    case "workout_duration":
      return { vrednost: String(Math.round(v)), jedinica: "min" };
    case "calories_active":
      return { vrednost: String(Math.round(v)), jedinica: "kcal" };
    case "sleep_minutes":
      return { vrednost: (v / 60).toFixed(1).replace(".", ","), jedinica: "h" };
    case "steps":
      return { vrednost: Math.round(v).toLocaleString("sr-Latn-RS"), jedinica: "" };
    case "recovery_score":
      return { vrednost: String(Math.round(v)), jedinica: "%" };
    default:
      return { vrednost: brojTekst(v), jedinica: "" };
  }
};

export const ZdravljeVezbaca = ({ athleteId, povezan }: { athleteId: string; povezan: boolean }) => {
  const [mere, setMere] = useState<Mera[] | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [pokusaj, setPokusaj] = useState(0);

  useEffect(() => {
    let vazi = true;
    setGreska(null);
    (async () => {
      const { data, error } = await supabase.rpc("get_latest_wearable_metrics", { p_user_id: athleteId });
      if (!vazi) return;
      if (error) {
        const poruka = porukaGreske(error);
        setGreska(poruka);
        toast.error(poruka);
        return;
      }
      setMere((data ?? []) as Mera[]);
    })();
    return () => {
      vazi = false;
    };
  }, [athleteId, pokusaj]);

  if (greska && mere == null) {
    return (
      <div className="card-premium p-5 text-center">
        <p className="text-[13px] text-muted-foreground">{greska}</p>
        <Button variant="outline" onClick={() => setPokusaj((n) => n + 1)} className="mt-3 h-9 rounded-full px-4 text-[13px]">
          Pokušaj ponovo
        </Button>
      </div>
    );
  }
  if (mere == null) {
    return (
      <div className="card-premium flex justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Učitavanje" />
      </div>
    );
  }

  const stavke = REDOSLED.flatMap((r) => {
    const m = mere.find((x) => x.data_type === r.tip);
    return m?.value != null ? [{ ...r, ...prikaz(r.tip, Number(m.value)) }] : [];
  });

  if (stavke.length === 0) {
    return (
      <div className="card-premium p-6 text-center text-[13px] text-muted-foreground">
        {povezan ? "Još nema podataka sa uređaja" : "Vežbač još nije povezao uređaj"}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {stavke.map(({ tip, naziv, Ikona, vrednost, jedinica }) => (
        <div key={tip} className="card-premium flex items-center gap-3 p-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
            <Ikona className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="fig text-[20px] leading-none">{vrednost}</span>
              {jedinica && <span className="text-[11px] text-muted-foreground">{jedinica}</span>}
            </div>
            <div className="mt-1 text-[11.5px] leading-tight text-muted-foreground">{naziv}</div>
          </div>
        </div>
      ))}
    </div>
  );
};
