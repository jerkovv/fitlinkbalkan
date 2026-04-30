import { Loader2, Check, AlertTriangle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import type { ProviderMeta } from "@/lib/wearable/providers";

export type ProviderStatus = "connected" | "disconnected" | "loading" | "error" | "coming_soon";

interface Props {
  meta: ProviderMeta;
  status: ProviderStatus;
  lastSyncAt?: string | null;
  errorMessage?: string | null;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onSync?: () => void;
  onRetry?: () => void;
}

const formatRelative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "upravo sada";
  if (m < 60) return `pre ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `pre ${h} h`;
  const d = Math.floor(h / 24);
  return `pre ${d} d`;
};

export const WearableProviderCard = ({
  meta,
  status,
  lastSyncAt,
  errorMessage,
  onConnect,
  onDisconnect,
  onSync,
  onRetry,
}: Props) => {
  const Icon = meta.icon;
  const isConnected = status === "connected";
  const isComingSoon = status === "coming_soon";

  return (
    <Card
      className={cn(
        "p-4 relative overflow-hidden transition",
        isConnected && "ring-1 ring-primary/30",
        isComingSoon && "opacity-60",
      )}
    >
      {isConnected && (
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-brand" />
      )}

      <div className="flex items-start gap-3">
        <div
          className={cn(
            "h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 text-primary-foreground",
            isComingSoon ? "bg-muted text-muted-foreground" : "bg-gradient-brand shadow-brand",
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={2.25} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-display text-[15px] font-bold tracking-tight">
              {meta.name}
            </div>

            {isConnected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success-soft-foreground">
                <Check className="h-3 w-3" /> Povezano
              </span>
            )}
            {status === "error" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                <AlertTriangle className="h-3 w-3" /> Greška
              </span>
            )}
            {isComingSoon && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Uskoro
              </span>
            )}
          </div>

          <div className="text-[12px] text-muted-foreground mt-0.5 leading-snug">
            {meta.description}
          </div>

          {isConnected && lastSyncAt && (
            <div className="text-[11px] text-muted-foreground mt-1.5">
              Sinhronizovano {formatRelative(lastSyncAt)}
            </div>
          )}
          {isConnected && !lastSyncAt && (
            <div className="text-[11px] text-muted-foreground mt-1.5">
              Još nije sinhronizovano
            </div>
          )}
          {status === "error" && errorMessage && (
            <div className="text-[11px] text-destructive mt-1.5 leading-snug">
              {errorMessage}
            </div>
          )}
        </div>
      </div>

      {/* Akcije */}
      {!isComingSoon && (
        <div className="mt-3 flex gap-2">
          {status === "disconnected" && (
            <Button
              size="sm"
              className="flex-1 bg-gradient-brand text-primary-foreground hover:opacity-95"
              onClick={onConnect}
            >
              Poveži
            </Button>
          )}

          {status === "loading" && (
            <Button size="sm" className="flex-1" disabled>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Povezivanje...
            </Button>
          )}

          {status === "connected" && (
            <>
              <Button size="sm" variant="outline" className="flex-1" onClick={onSync}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Sinhronizuj
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={onDisconnect}
                aria-label="Otkaži pristup"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}

          {status === "error" && (
            <Button size="sm" variant="outline" className="flex-1" onClick={onRetry}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Pokušaj ponovo
            </Button>
          )}
        </div>
      )}
    </Card>
  );
};
