import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export type LastPerformanceSet = {
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
};

export type LastPerformance = {
  /** Vezba iz KATALOGA (exercises.id), ne red iz programa. */
  exercise_id: string;
  /** null = vezbac ovu vezbu jos nije radio. */
  performed_at: string | null;
  sets: LastPerformanceSet[];
  /** Najteze u toj poslednjoj sesiji. */
  top_weight_kg: number | null;
  /** Licni rekord ikad, za kontekst. */
  best_weight_kg: number | null;
};

/**
 * "Prosli put" za vise vezbi odjednom - sta je ovaj vezbac poslednji put
 * odradio. Sluzi treneru dok pravi ili menja plan: pre nego sto upise cilj za
 * danas, vidi broj od proslog puta.
 *
 * Jedan poziv za CEO spisak vezbi (RPC prima niz), ne poziv po vezbi - plan
 * zna da ima 30+ vezbi po danima.
 *
 * athleteId je undefined u rezimu sablona (sablon nije ni za koga konkretno),
 * i tada se ne salje nista.
 */
export function useLastPerformance(
  athleteId: string | undefined,
  exerciseIds: string[],
) {
  const [byExercise, setByExercise] = useState<Record<string, LastPerformance>>({});
  const [loading, setLoading] = useState(false);

  // Niz dolazi kao nov objekat na svaki render; kljuc je stabilan potpis
  // sadrzaja, da effect ne juri u petlju.
  const kljuc = useMemo(
    () => Array.from(new Set(exerciseIds)).sort().join(","),
    [exerciseIds],
  );

  // Odgovor koji stigne posle unmount-a (ili posle promene vezbaca) ne sme da
  // upise stanje - inace se u builderu vidi istorija prethodnog vezbaca.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    if (!athleteId || !kljuc) {
      setByExercise({});
      return;
    }
    let otkazano = false;
    setLoading(true);

    (async () => {
      const { data, error } = await supabase.rpc("get_last_exercise_performance" as any, {
        p_athlete_id: athleteId,
        p_exercise_ids: kljuc.split(","),
      });
      if (otkazano || !aliveRef.current) return;
      setLoading(false);
      // Tiho na gresci: istorija je dodatak, ne sme da obori ekran za pravljenje
      // plana ako RPC padne (mreza, prava).
      if (error || !Array.isArray(data)) return;

      const mapa: Record<string, LastPerformance> = {};
      for (const red of data as LastPerformance[]) {
        mapa[red.exercise_id] = {
          ...red,
          sets: Array.isArray(red.sets) ? red.sets : [],
        };
      }
      setByExercise(mapa);
    })();

    return () => { otkazano = true; };
  }, [athleteId, kljuc]);

  return { byExercise, loading };
}
