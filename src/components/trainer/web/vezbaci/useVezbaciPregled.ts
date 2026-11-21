import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { porukaGreske } from "@/lib/errorMessage";
import type { Vezbac } from "./aktivnost";

type RedClanarine = {
  athlete_id: string;
  ends_on: string | null;
  status: string | null;
  plan_name: string | null;
};

// Spisak se menja samo kad je stiglo sve od cega se pravi. Bez imena bi pisalo
// "Vežbač", bez clanarina "Bez članarine", bez pregleda "Još nije trenirao":
// sve to izgleda kao podatak a nije.
export function useVezbaciPregled(ukljuceno = true) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [vezbaci, setVezbaci] = useState<Vezbac[]>([]);
  const [ucitano, setUcitano] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const zahtev = useRef(0);

  const ucitaj = useCallback(async () => {
    if (!uid) return;
    const ovaj = ++zahtev.current;
    setGreska(null);
    try {
      const [aRes, oRes] = await Promise.all([
        supabase
          .from("athletes")
          .select("id, goal, joined_at")
          .eq("trainer_id", uid)
          .order("joined_at", { ascending: false, nullsFirst: false }),
        supabase.rpc("get_athletes_overview"),
      ]);
      if (aRes.error) throw aRes.error;
      if (oRes.error) throw oRes.error;
      const pregled = oRes.data as any;
      if (pregled?.success === false) throw new Error(pregled.error ?? "overview_failed");

      const redovi = (aRes.data ?? []) as { id: string; goal: string | null }[];
      const ids = redovi.map((a) => a.id);
      let profili: { id: string; full_name: string | null; avatar_url: string | null }[] = [];
      let clanarine: RedClanarine[] = [];
      if (ids.length > 0) {
        const [pRes, cRes] = await Promise.all([
          supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids),
          // Bez roka ide na dno, isto kao na profilu vezbaca.
          supabase
            .from("memberships")
            .select("athlete_id, ends_on, status, plan_name")
            .in("athlete_id", ids)
            .eq("trainer_id", uid)
            .order("ends_on", { ascending: false, nullsFirst: false }),
        ]);
        if (pRes.error) throw pRes.error;
        if (cRes.error) throw cRes.error;
        profili = (pRes.data ?? []) as typeof profili;
        clanarine = (cRes.data ?? []) as RedClanarine[];
      }
      if (ovaj !== zahtev.current) return;

      const profilPo = new Map(profili.map((p) => [p.id, p]));
      const treningPo = new Map<string, any>(
        (Array.isArray(pregled?.athletes) ? pregled.athletes : []).map((a: any) => [a.athlete_id, a]),
      );
      // Aktivna clanarina ima prednost; bez nje poslednja koja je postojala.
      const clanPo = new Map<string, RedClanarine>();
      clanarine.forEach((c) => {
        if (c.status === "active" && !clanPo.has(c.athlete_id)) clanPo.set(c.athlete_id, c);
      });
      clanarine.forEach((c) => {
        if (!clanPo.has(c.athlete_id)) clanPo.set(c.athlete_id, c);
      });

      setVezbaci(
        redovi.map((a) => {
          const p = profilPo.get(a.id);
          const c = clanPo.get(a.id);
          const t = treningPo.get(a.id);
          return {
            id: a.id,
            ime: p?.full_name?.trim() || "Vežbač",
            avatarUrl: p?.avatar_url ?? null,
            cilj: a.goal,
            paket: c?.plan_name ?? null,
            clanarinaDo: c?.ends_on ?? null,
            imaClanarinu: !!c,
            aktivna: c?.status === "active",
            poslednjiTrening: t?.last_workout_at ?? null,
            danaOdTreninga: t?.days_since_last ?? null,
          };
        }),
      );
      setUcitano(true);
    } catch (e) {
      if (ovaj !== zahtev.current) return;
      const poruka = porukaGreske(e);
      setGreska(poruka);
      toast.error(poruka);
    }
  }, [uid]);

  useEffect(() => {
    if (ukljuceno) void ucitaj();
  }, [ukljuceno, ucitaj]);

  return { vezbaci, ucitano, greska, ucitaj };
}
