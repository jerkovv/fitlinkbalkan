import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export type MembershipState = "active" | "expired" | "none" | "paused" | "cancelled";

export interface MembershipAccess {
  loading: boolean;
  hasAccess: boolean;
  state: MembershipState;
  endsOn: string | null;
  trainerId: string | null;
  trainerName: string | null;
  refetch: () => void;
}

type AccessData = Omit<MembershipAccess, "refetch">;

// Trener se NIKAD ne zakljucava.
const TRAINER_ACCESS: AccessData = {
  loading: false,
  hasAccess: true,
  state: "active",
  endsOn: null,
  trainerId: null,
  trainerName: null,
};

const INITIAL: AccessData = {
  loading: true,
  hasAccess: false,
  state: "none",
  endsOn: null,
  trainerId: null,
  trainerName: null,
};

// Pristup clanarini za trenutnog korisnika. Trener -> odmah pun pristup, bez RPC-a.
// Vezbac -> RPC get_my_membership_access(), sa refetch na mount i na app resume
// (visibilitychange, isti "resume" signal koji vec koristi useAuth), da se gate
// skine cim trener aktivira clanarinu a vezbac vrati app iz pozadine.
export function useMembershipAccess(): MembershipAccess {
  const { role } = useAuth();
  const [data, setData] = useState<AccessData>(INITIAL);

  const refetch = useCallback(async () => {
    if (role === "trainer") {
      setData(TRAINER_ACCESS);
      return;
    }
    if (role !== "athlete") return; // rola jos nije poznata -> sacekaj
    try {
      const { data: rows, error } = await (supabase.rpc as any)("get_my_membership_access");
      if (error) throw error;
      const row = Array.isArray(rows) ? rows[0] : rows;
      setData({
        loading: false,
        hasAccess: !!row?.has_access,
        state: (row?.state ?? "none") as MembershipState,
        endsOn: row?.ends_on ?? null,
        trainerId: row?.trainer_id ?? null,
        trainerName: row?.trainer_name ?? null,
      });
    } catch (e) {
      // Fail-open: na gresci (npr. mrezni prekid) NE zakljucavaj - prava brana je
      // RLS u bazi. Bolje nego da aktivnom clanu pukne pristup na blip.
      console.warn("[membership] get_my_membership_access failed:", e);
      setData((d) => ({ ...d, loading: false, hasAccess: true }));
    }
  }, [role]);

  useEffect(() => {
    if (role === "trainer") {
      setData(TRAINER_ACCESS);
      return;
    }
    if (role !== "athlete") {
      setData((d) => ({ ...d, loading: true }));
      return;
    }
    setData((d) => ({ ...d, loading: true }));
    refetch();

    // Resume signal (isti pattern kao useAuth): kad app postane vidljiv, osvezi.
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [role, refetch]);

  return { ...data, refetch };
}
