import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { type Provider } from "@/lib/wearable/providers";
import {
  isHealthKitAvailable,
  requestHealthKitPermissions,
  syncHealthKitData,
} from "@/lib/wearable/healthkit";
import { toast } from "sonner";

export interface WearableConnection {
  id: string;
  user_id: string;
  provider: Provider;
  status: "connected" | "revoked" | "error";
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export const useWearableConnections = (userId?: string) => {
  const { user } = useAuth();
  const targetUserId = userId ?? user?.id ?? null;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["wearable_connections", targetUserId],
    enabled: !!targetUserId,
    queryFn: async (): Promise<WearableConnection[]> => {
      const { data, error } = await supabase
        .from("wearable_connections" as any)
        .select("*")
        .eq("user_id", targetUserId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as WearableConnection[];
    },
  });

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["wearable_connections", targetUserId] });

  const connect = useMutation({
    mutationFn: async (provider: Provider) => {
      if (!user) throw new Error("Niste prijavljeni");

      if (provider === "apple_health") {
        if (!isHealthKitAvailable()) {
          throw new Error("Apple Health dostupan u mobilnoj aplikaciji");
        }
        const perm = await requestHealthKitPermissions();
        if (!perm.success) {
          throw new Error("Dozvole za Apple Health odbijene");
        }
        let sync;
        try {
          sync = await syncHealthKitData(user.id);
        } catch (err: any) {
          const msg = String(err?.message ?? err ?? "");
          if (/not determined|authorization/i.test(msg)) {
            const retry = await requestHealthKitPermissions();
            if (!retry.success) {
              throw new Error("Dozvole za Apple Health odbijene");
            }
            sync = await syncHealthKitData(user.id);
          } else {
            throw err;
          }
        }
        const wk = (sync as any).workouts ?? 0;
        toast.success(
          wk > 0
            ? `Povezano. Sinhronizovano ${wk} treninga.`
            : sync.synced > 0
              ? `Povezano. Sinhronizovano ${sync.synced} zapisa.`
              : "Povezano. Nema novih podataka za sinhronizaciju.",
        );
        return;
      }

      if (provider === "health_connect") {
        throw new Error("Health Connect stiže uskoro");
      }

      // TODO (OAuth faza): pozvati edge function `${provider}-authorize`
      throw new Error("Uskoro dostupno");
    },
    onError: (e: any) => toast.error(e?.message ?? "Greška pri povezivanju"),
    onSuccess: () => refresh(),
  });

  const disconnect = useMutation({
    mutationFn: async (provider: Provider) => {
      if (!user) throw new Error("Niste prijavljeni");
      const { error } = await supabase
        .from("wearable_connections" as any)
        .delete()
        .eq("user_id", user.id)
        .eq("provider", provider);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pristup otkazan");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Greška"),
  });

  const syncNow = useMutation({
    mutationFn: async (provider: Provider) => {
      if (!user) throw new Error("Niste prijavljeni");
      if (provider === "apple_health") {
        if (!isHealthKitAvailable()) {
          throw new Error("Apple Health dostupan u mobilnoj aplikaciji");
        }
        let res;
        try {
          res = await syncHealthKitData(user.id);
        } catch (err: any) {
          const msg = String(err?.message ?? err ?? "");
          if (/not determined|authorization/i.test(msg)) {
            const perm = await requestHealthKitPermissions();
            if (!perm.success) {
              throw new Error("Dozvole za Apple Health odbijene");
            }
            res = await syncHealthKitData(user.id);
          } else {
            throw err;
          }
        }
        const wk = (res as any).workouts ?? 0;
        toast.success(
          wk > 0
            ? `Sinhronizovano ${wk} treninga`
            : res.synced > 0
              ? `Sinhronizovano ${res.synced} zapisa`
              : "Nema novih podataka",
        );
        return;
      }
      throw new Error("Sinhronizacija stiže uskoro");
    },
    onError: (e: any) => toast.error(e?.message ?? "Greška pri sinhronizaciji"),
    onSuccess: () => refresh(),
  });

  return {
    connections: query.data ?? [],
    isLoading: query.isLoading,
    refresh,
    connect: (p: Provider) => connect.mutate(p),
    disconnect: (p: Provider) => disconnect.mutate(p),
    syncNow: (p: Provider) => syncNow.mutate(p),
    connecting: connect.isPending ? (connect.variables as Provider) : null,
  };
};
