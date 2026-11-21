import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { porukaGreske } from "@/lib/errorMessage";
import { useAuth } from "@/hooks/useAuth";
import {
  podrazumevaniRaspored,
  procitajRaspored,
  zapisZaSlanje,
  type Raspored,
} from "./raspored";

// Raspored pocetne na nalogu, isti kao na telefonu. U pregledacu stoji poslednji
// potvrdjen zapis po nalogu, da se pocetna odmah slozi kako treba; bez njega delovi
// cekaju odgovor servera, pa nikad ne skoce sa podrazumevanog na sacuvani redosled.

const kljucKesa = (uid: string) => `fitlink.pocetna.raspored.${uid}`;
const KLJUC_SAVETA = "fitlink.pocetna.savet";
const PAUZA_SLANJA_MS = 800;

function izKesa(uid: string | null): Raspored | null {
  if (!uid) return null;
  try {
    const s = localStorage.getItem(kljucKesa(uid));
    return s ? procitajRaspored(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

function uKes(uid: string, zapis: unknown) {
  try {
    if (zapis == null) localStorage.removeItem(kljucKesa(uid));
    else localStorage.setItem(kljucKesa(uid), JSON.stringify(zapis));
  } catch {
    // Pregledac ne da da se pise: raspored i dalje stoji na nalogu.
  }
}

function savetVidjenIzSkladista() {
  try {
    return localStorage.getItem(KLJUC_SAVETA) === "1";
  } catch {
    return false;
  }
}

export function useRasporedPocetne() {
  const { user } = useAuth();
  const uid = user?.id ?? null;

  const [raspored, setRaspored] = useState<Raspored | null>(() => izKesa(uid));
  const [savetVidjen, setSavetVidjen] = useState(savetVidjenIzSkladista);
  const tekuci = useRef(raspored);
  // Raste sa svakom izmenom: odgovor koji je krenuo pre izmene se odbacuje.
  const brojIzmena = useRef(0);
  const tajmer = useRef<number | null>(null);
  const salje = useRef(false);
  const josJednom = useRef(false);
  const uredjuje = useRef(false);

  const postavi = useCallback((r: Raspored) => {
    tekuci.current = r;
    setRaspored(r);
  }, []);

  const ucitaj = useCallback(
    async (tiho: boolean): Promise<boolean> => {
      if (!uid) return false;
      const pre = brojIzmena.current;
      const { data, error } = await supabase.rpc("trener_raspored_pocetne_get");
      if (error) {
        const poruka = porukaGreske(error);
        if (!tiho) toast.error(poruka);
        // Bez ijednog poznatog zapisa pocetna ipak mora da se vidi.
        if (!tekuci.current) postavi(podrazumevaniRaspored());
        return false;
      }
      if (pre !== brojIzmena.current || tajmer.current !== null || salje.current) return true;
      uKes(uid, data);
      postavi(procitajRaspored(data));
      return true;
    },
    [uid, postavi],
  );

  const posalji = useCallback(async () => {
    if (tajmer.current !== null) {
      window.clearTimeout(tajmer.current);
      tajmer.current = null;
    }
    if (!uid || !tekuci.current) return;
    if (salje.current) {
      josJednom.current = true;
      return;
    }
    salje.current = true;
    try {
      // Upis ide na prijavljen nalog, pa se proverava da je to i dalje isti nalog.
      const { data: s } = await supabase.auth.getSession();
      if (s.session?.user.id !== uid) return;
      const zapis = zapisZaSlanje(tekuci.current);
      const { error } = await supabase.rpc("trener_raspored_pocetne_set", { p_raspored: zapis });
      if (error) {
        toast.error(porukaGreske(error), {
          action: { label: "Pokušaj ponovo", onClick: () => void posalji() },
        });
        return;
      }
      uKes(uid, zapis);
      if (tekuci.current) postavi({ ...tekuci.current, sirovo: zapis });
    } catch (e) {
      toast.error(porukaGreske(e), {
        action: { label: "Pokušaj ponovo", onClick: () => void posalji() },
      });
    } finally {
      salje.current = false;
      if (josJednom.current) {
        josJednom.current = false;
        void posalji();
      }
    }
  }, [uid, postavi]);

  /** Izmena odmah na ekranu; niz prevlacenja ide na nalog kao jedan upis. */
  const izmeni = useCallback(
    (f: (r: Raspored) => Raspored) => {
      if (!tekuci.current) return;
      brojIzmena.current += 1;
      postavi(f(tekuci.current));
      if (tajmer.current !== null) window.clearTimeout(tajmer.current);
      tajmer.current = window.setTimeout(() => {
        tajmer.current = null;
        void posalji();
      }, PAUZA_SLANJA_MS);
    },
    [postavi, posalji],
  );

  /** Uredjivanje krece od svezeg zapisa, da se ne pregazi izmena sa telefona. */
  const pripremiUredjivanje = useCallback(async () => {
    if (tajmer.current !== null || salje.current) return true;
    return ucitaj(false);
  }, [ucitaj]);

  const postaviUredjuje = useCallback((da: boolean) => {
    uredjuje.current = da;
  }, []);

  /** Gotovo: izmena koja jos ceka pauzu odmah ide na nalog. */
  const zavrsiIzmene = useCallback(() => {
    if (tajmer.current !== null) void posalji();
  }, [posalji]);

  const zatvoriSavet = useCallback(() => {
    setSavetVidjen(true);
    try {
      localStorage.setItem(KLJUC_SAVETA, "1");
    } catch {
      // Bez skladista savet se vidi i sledeci put.
    }
  }, []);

  // Prvo citanje za nalog i ponovo kad se trener vrati na karticu (izmena sa telefona).
  useEffect(() => {
    if (!uid) return;
    const izSkladista = izKesa(uid);
    tekuci.current = izSkladista;
    setRaspored(izSkladista);
    void ucitaj(false);
    const povratak = () => {
      if (document.visibilityState === "visible" && !uredjuje.current) void ucitaj(true);
    };
    document.addEventListener("visibilitychange", povratak);
    return () => document.removeEventListener("visibilitychange", povratak);
  }, [uid, ucitaj]);

  // Zatvaranje kartice ili odlazak sa pocetne ne sme da izgubi poslednju izmenu.
  useEffect(() => {
    const posaljiOdmah = () => {
      if (tajmer.current !== null) void posalji();
    };
    const sakrivena = () => {
      if (document.visibilityState === "hidden") posaljiOdmah();
    };
    window.addEventListener("pagehide", posaljiOdmah);
    document.addEventListener("visibilitychange", sakrivena);
    return () => {
      window.removeEventListener("pagehide", posaljiOdmah);
      document.removeEventListener("visibilitychange", sakrivena);
      posaljiOdmah();
    };
  }, [posalji]);

  return {
    raspored,
    izmeni,
    zavrsiIzmene,
    pripremiUredjivanje,
    postaviUredjuje,
    savetVidjen,
    zatvoriSavet,
  };
}
