import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { porukaGreske } from "@/lib/errorMessage";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { brojTekst, prosliMesec } from "./aktivnost";

/** Poslednjih 10 zavrsenih treninga, od starijeg ka novijem. null dok se ne zna. */
export function useVolumeniTreninga(athleteId: string | undefined, kljuc: number) {
  const [volumeni, setVolumeni] = useState<number[] | null>(null);

  useEffect(() => {
    if (!athleteId) return;
    let vazi = true;
    (async () => {
      const { data, error } = await supabase
        .from("workout_session_logs")
        .select("id, total_volume_kg")
        .eq("athlete_id", athleteId)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(10);
      if (!vazi) return;
      if (error) {
        toast.error(porukaGreske(error));
        return;
      }
      setVolumeni(((data ?? []) as { total_volume_kg: number | null }[]).map((r) => Number(r.total_volume_kg ?? 0)).reverse());
    })();
    return () => {
      vazi = false;
    };
  }, [athleteId, kljuc]);

  return volumeni;
}

const Polje = ({ broj, opis }: { broj: string; opis: string }) => (
  <div className="rounded-2xl bg-surface-2/60 px-3 py-2.5">
    <div className="fig whitespace-nowrap text-[19px] leading-none">{broj}</div>
    <div className="mt-1.5 text-[11px] leading-tight text-muted-foreground">{opis}</div>
  </div>
);

/** Volumen po treningu i brojke sa telefona kojih nema u redu plocica na vrhu. */
export const TreninziNapredak = ({ volumeni, stats }: { volumeni: number[] | null; stats: any | null }) => {
  const imaStat = stats && stats.success !== false;
  if (volumeni == null && !imaStat) return null;
  const najvise = Math.max(...(volumeni ?? []), 1);

  return (
    <div className={cn("grid gap-4", imaStat && "lg:grid-cols-[minmax(0,1fr)_280px]")}>
      {volumeni != null && (
        <div className="card-premium p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
              Poslednjih {Math.max(volumeni.length, 1)} treninga
            </span>
            <span className="text-[11.5px] text-muted-foreground">volumen</span>
          </div>
          {volumeni.length === 0 ? (
            <p className="flex h-[92px] items-center text-[13px] text-muted-foreground">Još nema završenih treninga.</p>
          ) : (
            <div className="mt-3 flex h-[92px] items-end gap-1.5" role="img" aria-label="Volumen poslednjih treninga">
              {volumeni.map((v, i) => (
                <div
                  key={i}
                  title={`${brojTekst(v)} kg`}
                  className={cn(
                    "min-w-0 flex-1 rounded-md",
                    i === volumeni.length - 1 ? "bg-gradient-brand shadow-brand" : "bg-primary-soft",
                  )}
                  style={{ height: Math.max(8, (84 * v) / najvise) }}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {imaStat && (
        <div className="grid grid-cols-2 gap-2">
          <Polje
            broj={stats.best_e1rm_kg != null ? brojTekst(Math.round(Number(stats.best_e1rm_kg))) : "-"}
            opis="najjači 1RM kg"
          />
          <Polje
            broj={stats.avg_duration_min != null ? String(Math.trunc(Number(stats.avg_duration_min))) : "-"}
            opis="min prosek"
          />
          <Polje
            broj={stats.avg_kcal != null ? String(Math.trunc(Number(stats.avg_kcal))) : "-"}
            opis="kcal po treningu"
          />
          <Polje
            broj={Number(stats.total_kcal ?? 0) > 0 ? Math.round(Number(stats.total_kcal)).toLocaleString("sr-Latn-RS") : "-"}
            opis="kcal sa sata"
          />
        </div>
      )}
    </div>
  );
};

/** "Oktobar u brojkama": stoji samo kad vezbac ima zavrsenih treninga, kao na telefonu. */
export const PodeliMesec = ({ athleteId }: { athleteId: string }) => (
  <div className="card-premium flex items-center gap-3 p-4">
    <div className="min-w-0 flex-1">
      <div className="text-[14px] font-semibold">{prosliMesec()} u brojkama</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">Slike spremne za Instagram</div>
    </div>
    <Link
      to={`/trener/objave?kartica=mesec&vezbac=${athleteId}`}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-gradient-brand px-3.5 text-[12.5px] font-semibold text-white shadow-brand"
    >
      <Share2 className="h-3.5 w-3.5" />
      Podeli mesec
    </Link>
  </div>
);
