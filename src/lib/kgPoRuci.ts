// Vezba sa dve tegle (npr. bucice): kilaza se upisuje i cuva PO RUCI, tacno kako
// je uneta, a prikazuje se kao "2× 15 kg". Volumen je broji dvaput, licni rekord
// ostaje po ruci.
//
// Polje stize sa servera kao kg_po_ruci. Dok migracija nije primenjena ono ne
// postoji, pa se sve sto nije bas true cita kao false.

export type SaKgPoRuci = { kg_po_ruci?: boolean | null };

/** Da li red (vezba ili serija) nosi kilazu po ruci. */
export const jePoRuci = (x: SaKgPoRuci | null | undefined): boolean => x?.kg_po_ruci === true;

/** Serija nosi svoj snimak; kad ga nema (stari red, pre migracije), vazi oznaka vezbe. */
export const poRuciSerije = (
  serija: SaKgPoRuci | null | undefined,
  vezba: SaKgPoRuci | null | undefined,
): boolean => (serija?.kg_po_ruci != null ? serija.kg_po_ruci === true : jePoRuci(vezba));

/** Mnozilac za volumen: dve tegle se broje dvaput. */
export const faktorRuku = (poRuci: boolean | null | undefined): number => (poRuci ? 2 : 1);

/** Prefiks ispred kilaze: "2× " ili prazno. */
export const prefiksRuku = (poRuci: boolean | null | undefined): string => (poRuci ? "2× " : "");

/**
 * Kolona kg_po_ruci jos ne postoji u bazi (42703 = undefined_column). Sluzi za
 * citanje tabele: upit sa kolonom, pa bez nje dok migracija ne stigne.
 */
export const nemaKoloneKgPoRuci = (
  e: { code?: string | number; message?: string } | null | undefined,
): boolean => !!e && (String(e.code) === "42703" || /kg_po_ruci/.test(e.message ?? ""));
