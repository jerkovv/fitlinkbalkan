// Gotova PNG slika u tacnim dimenzijama (1080 x 1920, 1080 x 1350, 1080 x 1080).

import { crtajKarticu, type UlazKartice } from "./kartica";
import { SIRINA, UVECANJE, VISINA, brojStrana } from "./model";

export const dimenzije = (format: keyof typeof VISINA) => ({
  w: SIRINA * UVECANJE,
  h: VISINA[format] * UVECANJE,
});

const POKVARENO = "Slika nije napravljena. Jedna od fotografija ne može da se upotrebi, izaberi drugu pa pokušaj ponovo.";

const uPng = (u: UlazKartice) =>
  new Promise<Blob>((resolve, reject) => {
    const { w, h } = dimenzije(u.stil.format);
    const platno = document.createElement("canvas");
    platno.width = w;
    platno.height = h;
    const c = platno.getContext("2d", { alpha: false });
    if (!c) {
      reject(new Error(POKVARENO));
      return;
    }
    try {
      crtajKarticu(c, u);
      // toBlob baca SecurityError kad je platno zaprljano slikom bez CORS-a.
      platno.toBlob((b) => (b ? resolve(b) : reject(new Error(POKVARENO))), "image/png");
    } catch {
      reject(new Error(POKVARENO));
    }
  });

const IME_VRSTE = {
  rekord: "rekord",
  trening: "trening",
  termini: "termini",
  mesecTrenera: "mesec",
  preIPosle: "pre-i-posle",
  mesecKlijenta: "mesec-klijenta",
} as const;

export type GotovaSlika = { ime: string; blob: Blob };

/** Sve slike ove objave: jedna, ili cela serija kad je karusel. */
export const napraviSlike = async (u: UlazKartice): Promise<GotovaSlika[]> => {
  const n = brojStrana(u.sadrzaj);
  const osnova = `fitlink-${IME_VRSTE[u.sadrzaj.vrsta]}-${u.stil.format}`;
  const slike: GotovaSlika[] = [];
  for (let i = 0; i < n; i++) {
    const blob = await uPng({ ...u, strana: n > 1 ? i : u.strana });
    slike.push({ ime: n > 1 ? `${osnova}-${i + 1}.png` : `${osnova}.png`, blob });
  }
  return slike;
};

export const preuzmi = async (slike: GotovaSlika[]) => {
  for (let i = 0; i < slike.length; i++) {
    const adresa = URL.createObjectURL(slike[i].blob);
    const a = document.createElement("a");
    a.href = adresa;
    a.download = slike[i].ime;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(adresa), 30000);
    // Pregledac odbija vise preuzimanja u istom trenutku.
    if (i < slike.length - 1) await new Promise((r) => window.setTimeout(r, 350));
  }
};

export type IshodDeljenja = "podeljeno" | "otkazano" | "preuzeto";

/** Web Share sa fajlovima kad postoji, inace preuzimanje. */
export const podeliSlike = async (slike: GotovaSlika[]): Promise<IshodDeljenja> => {
  const fajlovi = slike.map((s) => new File([s.blob], s.ime, { type: "image/png" }));
  if (typeof navigator.share === "function" && navigator.canShare?.({ files: fajlovi })) {
    try {
      await navigator.share({ files: fajlovi });
      return "podeljeno";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "otkazano";
      // Pregledac je odbio deljenje (npr. isteklo odobrenje klika): slika ide u preuzimanja.
    }
  }
  await preuzmi(slike);
  return "preuzeto";
};
