import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Square } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/workout/hrZone";
import { useZaustaviTrening } from "@/hooks/useZaustaviTrening";

// Trening duzi od ovoga je skoro sigurno zaboravljen, a ne stvaran.
export const ZABORAVLJEN_POSLE_MS = 2 * 60 * 60 * 1000;

export const jeZaboravljen = (startedAt: string | null | undefined, now: number) =>
  !!startedAt && now - new Date(startedAt).getTime() >= ZABORAVLJEN_POSLE_MS;

type DugmeProps = {
  sessionId: string;
  athleteName?: string | null;
  onStopped?: () => void;
  size?: "sm" | "md";
  label?: string;
  className?: string;
};

/** Crveno "Zaustavi" dugme. Stoji van Link-a, ali klik ionako ne propusta dalje. */
export const ZaustaviTreningDugme = ({
  sessionId,
  athleteName,
  onStopped,
  size = "sm",
  label = "Zaustavi",
  className,
}: DugmeProps) => {
  const { zaustavi, zaustavlja } = useZaustaviTrening();
  const radi = zaustavlja === sessionId;
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (await zaustavi(sessionId, athleteName)) onStopped?.();
      }}
      disabled={radi}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-destructive/30 bg-surface font-semibold text-destructive transition hover:bg-destructive-soft active:scale-95 disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-[12.5px]" : "h-10 px-4 text-sm",
        className,
      )}
    >
      {radi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3 w-3 fill-current" />}
      {label}
    </button>
  );
};

type TrakaProps = {
  sessionId: string;
  athleteName?: string | null;
  startedAt: string | null | undefined;
  now: number;
  onStopped?: () => void;
};

/**
 * Telefonske liste: traka na dnu kartice samo kad trening traje sumnjivo dugo.
 * Kartica mora biti `relative` i imati mesta na dnu (vidi jeZaboravljen).
 */
export const ZaboravljenTreningTraka = ({ sessionId, athleteName, startedAt, now, onStopped }: TrakaProps) => {
  if (!jeZaboravljen(startedAt, now)) return null;
  return (
    <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-xl bg-destructive-soft/60 py-1.5 pl-3 pr-1.5">
      <span className="min-w-0 truncate text-[12px] font-medium text-destructive">Trening možda nije ugašen</span>
      <ZaustaviTreningDugme sessionId={sessionId} athleteName={athleteName} onStopped={onStopped} />
    </div>
  );
};

/**
 * Profil vezbaca: kad vezbac ima aktivan trening, traka sa "Uzivo" i "Zaustavi".
 * Sama cita sesiju, pa se ubacuje bez diranja ostatka profila.
 */
export const AktivanTreningBaner = ({ athleteId, athleteName }: { athleteId: string; athleteName?: string | null }) => {
  const [sesija, setSesija] = useState<{ id: string; started_at: string } | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    const ucitaj = async () => {
      const { data } = await supabase
        .from("workout_session_logs")
        .select("id, started_at")
        .eq("athlete_id", athleteId)
        .eq("is_active", true)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      setSesija((data as { id: string; started_at: string } | null) ?? null);
      setNow(Date.now());
    };
    ucitaj();
    const t = setInterval(ucitaj, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [athleteId]);

  if (!sesija) return null;
  const traje = now - new Date(sesija.started_at).getTime();
  const zaboravljen = traje >= ZABORAVLJEN_POSLE_MS;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3",
        zaboravljen ? "border-destructive/25 bg-destructive-soft/40" : "border-hairline bg-surface",
      )}
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inset-0 rounded-full bg-success opacity-60 animate-ping" />
        <span className="relative h-2.5 w-2.5 rounded-full bg-success" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold tracking-tight">Trenira sada</div>
        <div className={cn("text-[12.5px] tnum", zaboravljen ? "text-destructive" : "text-muted-foreground")}>
          Trening traje {formatDuration(traje)}
          {zaboravljen && " - možda nije ugašen"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link
          to={`/trener/vezbac/${athleteId}/live`}
          className="inline-flex h-8 items-center rounded-full border border-hairline bg-surface px-3 text-[12.5px] font-semibold transition hover:bg-surface-2"
        >
          Uživo
        </Link>
        <ZaustaviTreningDugme sessionId={sesija.id} athleteName={athleteName} onStopped={() => setSesija(null)} />
      </div>
    </div>
  );
};
