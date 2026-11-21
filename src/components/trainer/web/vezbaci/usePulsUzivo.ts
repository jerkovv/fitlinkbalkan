import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { WATCH_GRACE_MS } from "@/lib/liveWorkout";

/** Trenutni puls vezbaca dok trenira; null kad broj nije svez (40 s, kao na telefonu). */
export function usePulsUzivo(athleteId: string, aktivan: boolean): number | null {
  const [puls, setPuls] = useState<number | null>(null);

  useEffect(() => {
    if (!aktivan) {
      setPuls(null);
      return;
    }
    let vazi = true;
    const ucitaj = async () => {
      const { data, error } = await supabase.rpc("get_active_athletes_for_trainer");
      // Prolazna greska ne brise broj; sledece osvezavanje ga ispravlja.
      if (!vazi || error) return;
      const red = ((data ?? []) as any[]).find((a) => a.athlete_id === athleteId);
      const poslednji = Math.max(
        red?.hr_last_at ? new Date(red.hr_last_at).getTime() : 0,
        red?.watch_last_hr_at ? new Date(red.watch_last_hr_at).getTime() : 0,
      );
      setPuls(red?.current_hr != null && Date.now() - poslednji <= WATCH_GRACE_MS ? red.current_hr : null);
    };
    void ucitaj();
    const t = setInterval(ucitaj, 10000);
    return () => {
      vazi = false;
      clearInterval(t);
    };
  }, [athleteId, aktivan]);

  return puls;
}
