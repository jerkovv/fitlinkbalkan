import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Razlika dve kilaze, zaokruzena na 0.1 kg.
 *
 * Oduzimanje decimalnih brojeva u JS-u daje repove: 36.8 - 35 ispadne
 * 1.7999999999999972, sto je i izlazilo na ekranu detalja treninga. Zaokruzuje
 * se i na nulu, da razlika od 0.0000001 ne nacrta strelicu "napredovao si".
 *
 * Vraca null kad razlike nema (nedostaje podatak ili je ispod 0.05 kg).
 */
export function razlikaKg(
  odradjeno: number | string | null | undefined,
  planirano: number | string | null | undefined,
): number | null {
  const a = odradjeno == null ? NaN : Number(odradjeno);
  const b = planirano == null ? NaN : Number(planirano);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const d = Math.round((a - b) * 10) / 10;
  return d === 0 ? null : d;
}
