import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { porukaGreske } from "@/lib/errorMessage";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";

type Upis<T> = (vrednost: T) => PromiseLike<{ error: unknown }>;

// Podesavanja iz trainer_notification_prefs: vrednost je null dok server ne odgovori, pa pre
// toga nema ni prikaza ni upisa (izmena bi pregazila sacuvano podrazumevanim).
//
// Upisi idu jedan po jedan i uvek sa najnovijim stanjem. Dva brza klika bi inace bila dva
// paralelna zahteva, a onaj koji stigne poslednji (ne mora biti noviji) ostao bi u bazi.
// Kad upis ne uspe, ekran se vraca na poslednje stanje koje je server potvrdio.
export function useCuvanjePrefs<T>(upisi: Upis<T>, opcije?: { naUspeh?: () => void }) {
  const { locked, openLock } = usePretplataLock();
  const [vrednost, setVrednost] = useState<T | null>(null);
  const [cuva, setCuva] = useState(false);

  const tekuca = useRef<T | null>(null);
  const potvrdjena = useRef<T | null>(null);
  const naCekanju = useRef<{ v: T } | null>(null);
  const radi = useRef(false);
  const upisiRef = useRef(upisi);
  upisiRef.current = upisi;
  const naUspehRef = useRef(opcije?.naUspeh);
  naUspehRef.current = opcije?.naUspeh;

  /** Stanje procitano sa servera. */
  const primeni = useCallback((v: T) => {
    tekuca.current = v;
    potvrdjena.current = v;
    setVrednost(v);
  }, []);

  const isprazni = useCallback(async () => {
    if (radi.current) return;
    radi.current = true;
    setCuva(true);
    let greska: unknown = null;
    while (naCekanju.current) {
      const sada = naCekanju.current.v;
      naCekanju.current = null;
      try {
        const r = await upisiRef.current(sada);
        greska = r.error ?? null;
      } catch (e) {
        greska = e ?? new Error("Izmena nije sačuvana.");
      }
      if (!greska) potvrdjena.current = sada;
    }
    radi.current = false;
    setCuva(false);
    if (greska) {
      tekuca.current = potvrdjena.current;
      setVrednost(potvrdjena.current);
      toast.error(porukaGreske(greska));
    } else {
      naUspehRef.current?.();
    }
  }, []);

  const izmeni = useCallback(
    (f: (s: T) => T) => {
      // RLS trazi aktivnu pretplatu; bez nje trener odmah vidi razlog umesto greske.
      if (locked) {
        openLock();
        return;
      }
      const pre = tekuca.current;
      if (pre === null) return;
      const novo = f(pre);
      if (JSON.stringify(novo) === JSON.stringify(pre)) return;
      tekuca.current = novo;
      setVrednost(novo);
      naCekanju.current = { v: novo };
      void isprazni();
    },
    [locked, openLock, isprazni],
  );

  return { vrednost, cuva, primeni, izmeni };
}
