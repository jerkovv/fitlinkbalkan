// Raspored pocetne trenera, isti zapis kao na telefonu (RasporedPocetne u iOS-u):
// {"redosled": ["uplate", ...], "sakriveno": ["biblioteka", ...]} kroz
// trener_raspored_pocetne_get/set. Ovde su samo ciste funkcije, bez mreze i Reacta.
//
// Web NEMA svoje kljuceve: telefon pri svom cuvanju izbacuje svaki kljuc koji ne
// poznaje, pa bi web-kljuc nestao posle prve izmene na telefonu. Web zato koristi
// tacno devet kljuceva sa telefona, a kljuc koji sam ne zna (dodat u novijoj
// verziji aplikacije) cuva na istom mestu u nizu.

export const DELOVI_POCETNE = [
  "uplate",
  "uzivo",
  "danas",
  "programi",
  "ishranaPaketi",
  "termini",
  "objave",
  "biblioteka",
  "ambasadori",
] as const;

export type DeoPocetne = (typeof DELOVI_POCETNE)[number];

/** Biblioteka se otvara iz programa i Profila; na pocetnoj je samo ako je trener ukljuci. */
export const PODRAZUMEVANO_SKRIVENO: readonly DeoPocetne[] = ["biblioteka"];

export const OPIS_DELA: Record<DeoPocetne, { naziv: string; opis: string }> = {
  uplate: { naziv: "Uplate na čekanju", opis: "Vidi se samo kad neko čeka potvrdu" },
  uzivo: { naziv: "Ko trenira uživo", opis: "Puls i serije vežbača koji treniraju" },
  danas: { naziv: "Danas", opis: "Današnji termini" },
  programi: { naziv: "Programi", opis: "Najnoviji program i broj programa" },
  ishranaPaketi: { naziv: "Ishrana i paketi", opis: "Planovi ishrane i paketi članarina" },
  termini: { naziv: "Termini", opis: "Nedeljni raspored" },
  objave: { naziv: "Objave", opis: "Slike za Instagram" },
  biblioteka: { naziv: "Biblioteka vežbi", opis: "Sve vežbe sa snimkom" },
  ambasadori: { naziv: "Ambasadori", opis: "Vežbači koji su doveli nove" },
};

export type Raspored = {
  /** Svih devet delova, vidljivi pa sakriveni. */
  redosled: DeoPocetne[];
  sakriveno: DeoPocetne[];
  /** Poslednji zapis sa naloga: nosi kljuceve i polja koje ova verzija ne zna. */
  sirovo: Record<string, unknown> | null;
};

const jePoznat = (k: string): k is DeoPocetne => (DELOVI_POCETNE as readonly string[]).includes(k);

const tekstovi = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))] : [];

export const podrazumevaniRaspored = (sirovo: Raspored["sirovo"] = null): Raspored => ({
  redosled: [...DELOVI_POCETNE],
  sakriveno: [...PODRAZUMEVANO_SKRIVENO],
  sirovo,
});

/** Zapis sa naloga u raspored. Neispravan zapis vredi kao da trener nista nije menjao. */
export function procitajRaspored(json: unknown): Raspored {
  if (!json || typeof json !== "object" || Array.isArray(json)) return podrazumevaniRaspored();
  const sirovo = json as Record<string, unknown>;
  if (!Array.isArray(sirovo.redosled) || !Array.isArray(sirovo.sakriveno)) {
    return podrazumevaniRaspored(sirovo);
  }
  const r = tekstovi(sirovo.redosled).filter(jePoznat);
  return {
    redosled: [...r, ...DELOVI_POCETNE.filter((d) => !r.includes(d))],
    sakriveno: tekstovi(sirovo.sakriveno).filter(jePoznat),
    sirovo,
  };
}

/**
 * Zapis za trener_raspored_pocetne_set. Nepoznat kljuc ostaje na svom indeksu, a
 * poznati se redjaju po mestima koja su i ranije bila njihova.
 */
export function zapisZaSlanje(r: Raspored): Record<string, unknown> {
  const stari = tekstovi(r.sirovo?.redosled);
  let i = 0;
  const redosled: string[] = [];
  for (const k of stari) {
    if (!jePoznat(k)) redosled.push(k);
    else if (i < r.redosled.length) redosled.push(r.redosled[i++]);
  }
  redosled.push(...r.redosled.slice(i));

  const nepoznatoSkriveno = tekstovi(r.sirovo?.sakriveno).filter((k) => !jePoznat(k));
  const sakriveno = [...r.redosled.filter((d) => r.sakriveno.includes(d)), ...nepoznatoSkriveno];
  return { ...(r.sirovo ?? {}), redosled, sakriveno };
}

export const vidljivi = (r: Raspored) => r.redosled.filter((d) => !r.sakriveno.includes(d));
export const skriveni = (r: Raspored) => r.redosled.filter((d) => r.sakriveno.includes(d));

export const jeIzmenjen = (r: Raspored) =>
  r.redosled.some((d, i) => d !== DELOVI_POCETNE[i]) ||
  r.sakriveno.length !== PODRAZUMEVANO_SKRIVENO.length ||
  r.sakriveno.some((d) => !PODRAZUMEVANO_SKRIVENO.includes(d));

export function postaviRedosled(r: Raspored, noviVidljivi: DeoPocetne[]): Raspored {
  return { ...r, redosled: [...noviVidljivi, ...skriveni(r)] };
}

export function sakrij(r: Raspored, d: DeoPocetne): Raspored {
  if (r.sakriveno.includes(d)) return r;
  const n = { ...r, sakriveno: [...r.sakriveno, d] };
  return { ...n, redosled: [...vidljivi(n), ...skriveni(n)] };
}

/** Vraceni deo ide na kraj vidljivih, kao na telefonu. */
export function prikazi(r: Raspored, d: DeoPocetne): Raspored {
  const n = { ...r, sakriveno: r.sakriveno.filter((x) => x !== d) };
  return { ...n, redosled: [...vidljivi(n).filter((x) => x !== d), d, ...skriveni(n)] };
}

export const vrati = (r: Raspored): Raspored => podrazumevaniRaspored(r.sirovo);
