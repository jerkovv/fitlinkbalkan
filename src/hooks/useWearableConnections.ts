import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { isNativeProvider, type Provider } from "@/lib/wearable/providers";
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

      // TODO (Capacitor faza): za apple_health / health_connect pozvati nativni
      // SDK preko Capacitor plugin-a (npr. @perfood/capacitor-healthkit ili
      // capacitor-health-connect) i tražiti dozvole.
      if (isNativeProvider(provider)) {
        throw new Error(
          "Nativna integracija još nije omogućena. Bićeš obavešten kad bude spremna.",
        );
      }

      // TODO (OAuth faza): pozvati edge function `${provider}-authorize`
      // koja vraća authorize URL, pa ga otvoriti u novom tabu / in-app browseru.
      throw new Error("OAuth povezivanje stiže uskoro");
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
    mutationFn: async (_provider: Provider) => {
      // TODO: pozvati edge function `wearable-sync` sa provider parametrom
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
