import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/hooks/useConfirm";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { OBLASTI } from "@/components/pretplata/oblastiZakljucanja";
import { porukaGreske } from "@/lib/errorMessage";
import { cn } from "@/lib/utils";
import {
  CLANARINA_POLJA,
  type ClanarinaRed,
  danMeseca,
  jePlacena,
  mesecClanarine,
  nazivMeseca,
  postaviPlaceno,
  rsd,
} from "@/lib/clanarinePlaceno";

// Stranica vezbaca: sve njegove clanarine kod ovog trenera, od najnovije, svaka
// sa kvadraticem "placeno". Isto stanje kao u Uplatama (Placanja po mesecima).

const PRVIH = 6;

const period = (c: ClanarinaRed) =>
  c.starts_on && c.ends_on
    ? `${danMeseca(c.starts_on)} - ${danMeseca(c.ends_on)}`
    : c.starts_on
      ? `od ${danMeseca(c.starts_on)}`
      : c.ends_on
        ? `do ${danMeseca(c.ends_on)}`
        : null;

export const ClanarinePoMesecima = ({
  athleteId,
  imeVezbaca,
  osvezi,
  onPromena,
  className,
}: {
  athleteId: string;
  imeVezbaca?: string | null;
  onPromena?: () => void;
  // Menja se kad stranica ponovo ucita clanarinu (npr. posle "Izmeni").
  osvezi?: unknown;
  className?: string;
}) => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const { locked, openLock } = usePretplataLock();
  const [redovi, setRedovi] = useState<ClanarinaRed[] | null>(null);
  const [sve, setSve] = useState(false);
  const [radi, setRadi] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let ziv = true;
    (async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select(CLANARINA_POLJA)
        .eq("trainer_id", user.id)
        .eq("athlete_id", athleteId);
      if (!ziv) return;
      if (error) {
        toast.error(porukaGreske(error));
        setRedovi([]);
        return;
      }
      const lista = ((data as unknown as ClanarinaRed[]) ?? []).slice().sort((a, b) => {
        const ka = a.starts_on ?? a.created_at;
        const kb = b.starts_on ?? b.created_at;
        return ka < kb ? 1 : ka > kb ? -1 : 0;
      });
      setRedovi(lista);
    })();
    return () => { ziv = false; };
  }, [user, athleteId, osvezi]);

  const promeni = async (c: ClanarinaRed) => {
    if (locked) return openLock(OBLASTI.naplata);
    if (radi) return;
    const novo = !jePlacena(c);
    if (!novo) {
      const ok = await confirm({
        title: "Skinuti oznaku plaćeno?",
        description: `${imeVezbaca ? `${imeVezbaca} · ` : ""}${c.plan_name ?? "Članarina"} · ${nazivMeseca(mesecClanarine(c), false)}. Iznos više neće ulaziti u zaradu.`,
        confirmLabel: "Nije plaćeno",
        destructive: true,
      });
      if (!ok) return;
    }
    setRadi(c.id);
    const { error, red } = await postaviPlaceno(c, novo);
    setRadi(null);
    if (error) return toast.error(porukaGreske(error));
    setRedovi((prev) => (prev ?? []).map((x) => (x.id === c.id ? red : x)));
    toast.success(novo ? "Označeno kao plaćeno" : "Označeno kao neplaćeno");
    onPromena?.();
  };

  if (redovi === null) {
    return (
      <div className={cn("flex justify-center py-6", className)}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (redovi.length === 0) return null;

  const neplacenih = redovi.filter((c) => !jePlacena(c));
  const duguje = neplacenih.reduce((s, c) => s + Number(c.price ?? 0), 0);
  const prikaz = sve ? redovi : redovi.slice(0, PRVIH);

  return (
    <div className={className}>
      <div className="mb-2 space-y-0.5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Plaćanja po mesecima
        </div>
        {neplacenih.length > 0 ? (
          <div className="text-[12.5px] font-semibold text-destructive-soft-foreground tnum">
            {neplacenih.length === 1 ? "1 neplaćena" : `${neplacenih.length} neplaćene`}
            {duguje > 0 ? ` · duguje ${rsd(duguje)}` : ""}
          </div>
        ) : (
          <div className="text-[12.5px] font-semibold text-success-soft-foreground">Sve plaćeno</div>
        )}
      </div>

      <div className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
        {prikaz.map((c) => {
          const ok = jePlacena(c);
          const p = period(c);
          return (
            <button
              key={c.id}
              type="button"
              role="checkbox"
              aria-checked={ok}
              onClick={() => promeni(c)}
              disabled={radi === c.id}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-surface-2"
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2",
                  ok
                    ? "border-success-soft-foreground bg-success-soft-foreground text-white"
                    : "border-destructive-soft-foreground/60 bg-surface",
                )}
              >
                {radi === c.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : ok ? (
                  <Check className="h-4 w-4" strokeWidth={3} />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold capitalize leading-tight tracking-tight">
                  {nazivMeseca(mesecClanarine(c), false)}
                </span>
                <span className="block text-[12px] leading-snug text-muted-foreground tnum">
                  {[c.plan_name, p].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 text-right">
                {c.price != null && (
                  <span className="block text-[13px] font-semibold tnum">{rsd(Number(c.price))}</span>
                )}
                <span
                  className={cn(
                    "block text-[11.5px] font-semibold",
                    ok ? "text-success-soft-foreground" : "text-destructive-soft-foreground",
                  )}
                >
                  {ok ? "Plaćeno" : "Nije plaćeno"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {redovi.length > PRVIH && (
        <button
          type="button"
          onClick={() => setSve((v) => !v)}
          className="mt-2 w-full rounded-full py-2 text-[12.5px] font-semibold text-primary transition hover:bg-surface-2"
        >
          {sve ? "Prikaži manje" : `Prikaži sve (${redovi.length})`}
        </button>
      )}
    </div>
  );
};
