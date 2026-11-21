// Redosled vezbi uzivo, ista pravila kao u nativnoj aplikaciji
// (TrenerUzivoDetaljModel.blokovi i novRedosled).

export type VezbaURedu = { id: string; exercise_id: string; superset_group: number | null };

export type Mesto = "prvo" | "sledeca" | "gore" | "dole";

/** Vezbe u blokovima: clanovi superseta idu zajedno, ostale su same. */
export function blokovi<T extends VezbaURedu>(niz: T[]): T[][] {
  const b: T[][] = [];
  const grupe = new Map<number, number>();
  for (const v of niz) {
    const g = v.superset_group;
    if (g != null && grupe.has(g)) {
      b[grupe.get(g)!].push(v);
    } else {
      if (g != null) grupe.set(g, b.length);
      b.push([v]);
    }
  }
  return b;
}

/** Novi redosled posle poteza, ili null kad se nista ne bi promenilo. */
export function novRedosled<T extends VezbaURedu>(
  vezbe: T[],
  ids: string[],
  mesto: Mesto,
  tekuca: number,
): T[] | null {
  const skup = new Set(ids);
  const sve = blokovi(vezbe);
  const sadrzi = (b: T[]) => b.some((v) => skup.has(v.id));
  const prvi = sve.findIndex(sadrzi);
  if (prvi < 0) return null;
  const izabrani = sve.filter(sadrzi);
  const ostali = sve.filter((b) => !sadrzi(b));

  let gde: number;
  if (mesto === "prvo") gde = 0;
  else if (mesto === "gore") gde = Math.max(0, prvi - 1);
  else if (mesto === "dole") gde = Math.min(ostali.length, prvi + 1);
  else {
    if (tekuca < 0 || tekuca >= vezbe.length || skup.has(vezbe[tekuca].id)) return null;
    const i = ostali.findIndex((b) => b.some((v) => v.id === vezbe[tekuca].id));
    if (i < 0) return null;
    gde = i + 1;
  }

  ostali.splice(gde, 0, ...izabrani);
  const nov = ostali.flat();
  return nov.every((v, i) => v.id === vezbe[i]?.id) ? null : nov;
}

/**
 * Prva izmena trenera pravi kopiju plana za danas i svaka vezba dobija nov id.
 * Vraca stari id -> novi id, da otvorena kartica i otkucani brojevi ostanu na
 * istoj vezbi. Ista vezba dvaput u planu se uparuje po redu pojavljivanja.
 */
export function mapaNovihId(stare: VezbaURedu[], nove: VezbaURedu[]): Record<string, string> {
  const noviIds = new Set(nove.map((v) => v.id));
  const mapa: Record<string, string> = {};
  if (stare.every((v) => noviIds.has(v.id))) return mapa;

  const poVezbi = new Map<string, string[]>();
  for (const v of nove) poVezbi.set(v.exercise_id, [...(poVezbi.get(v.exercise_id) ?? []), v.id]);

  const videno = new Map<string, number>();
  for (const v of stare) {
    const k = videno.get(v.exercise_id) ?? 0;
    videno.set(v.exercise_id, k + 1);
    const novi = poVezbi.get(v.exercise_id)?.[k];
    if (novi && !noviIds.has(v.id)) mapa[v.id] = novi;
  }
  return mapa;
}
