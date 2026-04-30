import { useMemo } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { WearableProviderCard, type ProviderStatus } from "@/components/wearables/WearableProviderCard";
import { useWearableConnections } from "@/hooks/useWearableConnections";
import {
  detectPlatform,
  getAvailableProviders,
  type Provider,
} from "@/lib/wearable/providers";
import { ShieldCheck } from "lucide-react";

const Integracije = () => {
  const platform = useMemo(() => detectPlatform(), []);
  const list = useMemo(() => getAvailableProviders(platform), [platform]);

  const { connections, connect, disconnect, syncNow, connecting } =
    useWearableConnections();

  const connectionMap = new Map(connections.map((c) => [c.provider, c]));

  const resolveStatus = (id: Provider, comingSoon: boolean): ProviderStatus => {
    if (comingSoon) return "coming_soon";
    if (connecting === id) return "loading";
    const c = connectionMap.get(id);
    if (!c) return "disconnected";
    if (c.status === "error") return "error";
    if (c.status === "revoked") return "disconnected";
    return "connected";
  };

  const available = list.filter((p) => !p.comingSoon);
  const upcoming = list.filter((p) => p.comingSoon);

  return (
    <>
      <PhoneShell
        hasBottomNav
        back="/vezbac/profil"
        eyebrow="INTEGRACIJE"
        title="Povezani uređaji"
      >
        <p className="text-[13px] text-muted-foreground -mt-2">
          Poveži svoj sat ili narukvicu i podeli napredak sa trenerom.
        </p>

        {available.length > 0 && (
          <section className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Dostupno za tvoj uređaj
            </div>
            <div className="space-y-2.5">
              {available.map(({ meta, comingSoon }) => {
                const c = connectionMap.get(meta.id);
                return (
                  <WearableProviderCard
                    key={meta.id}
                    meta={meta}
                    status={resolveStatus(meta.id, comingSoon)}
                    lastSyncAt={c?.last_sync_at ?? null}
                    errorMessage={c?.last_error ?? null}
                    onConnect={() => connect(meta.id)}
                    onDisconnect={() => disconnect(meta.id)}
                    onSync={() => syncNow(meta.id)}
                    onRetry={() => connect(meta.id)}
                  />
                );
              })}
            </div>
          </section>
        )}

        {upcoming.length > 0 && (
          <section className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Uskoro
            </div>
            <div className="space-y-2.5">
              {upcoming.map(({ meta, comingSoon }) => (
                <WearableProviderCard
                  key={meta.id}
                  meta={meta}
                  status={resolveStatus(meta.id, comingSoon)}
                />
              ))}
            </div>
          </section>
        )}

        <div className="mt-4 flex items-start gap-2 rounded-xl bg-surface-2 p-3">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-muted-foreground leading-snug">
            Tvoj trener vidi samo metrike koje su relevantne za trening, ne i
            privatne podatke.
          </p>
        </div>
      </PhoneShell>
      <BottomNav role="athlete" />
    </>
  );
};

export default Integracije;
