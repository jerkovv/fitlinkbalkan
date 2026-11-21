// Zapis vremena i teksta za podsetnike, isto kao IzborVremena i PodsetniciKlijenata na iOS-u.
// Vremena se ne preracunavaju: baza cuva "time" bez zone, a server ga cita po Beogradu.

/** 90 -> "1 h 30 min", 420 -> "7 h", 45 -> "45 min" */
export function trajanje(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h} h` : `${h} h ${m % 60} min`;
}

/** 1170 -> "19:30", 480 -> "8:00" (kao FMHH24:MI na serveru) */
export function sat(minut: number): string {
  const m = ((minut % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** "19:30" -> 1170 */
export function minutDana(s: string): number {
  const [h = 0, m = 0] = s.split(":").map(Number);
  return h * 60 + m;
}

/** 480 -> "08:00" (oblik koji ekran drzi) */
export function zapis(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "08:00" -> "8:00" */
export const bezNule = (s: string) => (s.startsWith("0") ? s.slice(1) : s);

/** "07:30:00" iz baze -> "07:30" */
export const izBaze = (s: string | null | undefined) => (s ? s.slice(0, 5) : null);

/** "07:30" -> "07:30:00" za bazu, null ostaje null */
export const uBazu = (s: string | null) => (s ? `${s}:00` : null);

// Baza broji znakove sa char_length (kodne tacke), a JS .length broji UTF-16 jedinice, pa bi
// emodzi trosio dva mesta. Brojac i granica zato idu po kodnim tackama.
export const duzina = (s: string) => Array.from(s).length;
export const skrati = (s: string, n: number) => (duzina(s) > n ? Array.from(s).slice(0, n).join("") : s);

const IMENA_BOJA = new Set(["violet", "indigo", "emerald", "amber", "rose", "sky"]);

/** Boja vrste treninga; nepoznata ide na ljubicastu, kao BojaSesije na iOS-u. */
export function bojaVrste(boja: string | null | undefined): { fg: string; bg: string } {
  const b = boja && IMENA_BOJA.has(boja) ? boja : "violet";
  return { fg: `hsl(var(--session-${b}-fg))`, bg: `hsl(var(--session-${b}-bg))` };
}
