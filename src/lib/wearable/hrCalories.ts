/**
 * Potrosnja iz pulsa - za treninge bez sata.
 *
 * Sat kalorije MERI (HealthKit ih racuna iz senzora i kretanja); traka daje samo
 * puls, pa se potrosnja PROCENJUJE. Keytel (2005) je standardna formula za to:
 * kcal/min iz pulsa, tezine, godina i pola. Bez tezine ili godine nema racuna -
 * tada se ne prikazuje nista, jer izmisljen broj u rezimeu treninga je gori od
 * praznog polja.
 */

export type CaloriesProfile = {
  birthYear: number | null;
  gender: string | null;
  weightKg: number | null;
};

/** Vrednosti iz athletes.gender ("male" | "female" | "other"). */
const ZENSKO = new Set(["female", "zensko", "žensko", "z", "ž", "f"]);

export const kcalPerMinute = (
  bpm: number,
  profile: CaloriesProfile,
  now: Date = new Date(),
): number | null => {
  const tezina = profile.weightKg;
  if (!tezina || tezina <= 0) return null;
  if (!profile.birthYear) return null;
  const godine = now.getFullYear() - profile.birthYear;
  if (godine <= 0 || godine > 120) return null;
  if (!Number.isFinite(bpm) || bpm <= 0) return null;

  const zensko = ZENSKO.has((profile.gender ?? "").trim().toLowerCase());
  // Keytel: rezultat je u kJ/min, /4.184 daje kcal/min.
  const kcal = zensko
    ? (-20.4022 + 0.4472 * bpm - 0.1263 * tezina + 0.074 * godine) / 4.184
    : (-55.0969 + 0.6309 * bpm + 0.1988 * tezina + 0.2017 * godine) / 4.184;

  // Nizak puls daje negativnu vrednost (formula je pravljena za opterecenje),
  // a potrosnja ne moze biti negativna.
  return kcal > 0 ? kcal : 0;
};

/**
 * Sabira potrosnju kroz trening. Svaki otkucaj nosi vreme proteklo od prethodnog,
 * pa gustina uzoraka (traka salje na ~1s) ne menja rezultat.
 */
export const createCalorieMeter = (profile: CaloriesProfile) => {
  let ukupno = 0;
  let poslednji: number | null = null;

  return {
    /** Ukupno kcal do sada, ili null kad profil nema tezinu/godine za racun. */
    add(bpm: number, atMs: number = Date.now()): number | null {
      const rate = kcalPerMinute(bpm, profile);
      if (rate == null) return null;
      if (poslednji != null) {
        // Rupa (pauza, zakljucan ekran, prekid veze) se ne racuna celom duzinom -
        // inace povratak posle deset minuta ubaci lazan skok u potrosnji.
        const sekundi = Math.min((atMs - poslednji) / 1000, 30);
        if (sekundi > 0) ukupno += (rate * sekundi) / 60;
      }
      poslednji = atMs;
      return ukupno;
    },
    get total(): number {
      return ukupno;
    },
  };
};
