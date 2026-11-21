// Pismo, zvanicni natpis i slike za platno. Sve sto ulazi na platno mora biti sa iste
// adrese, inace ga pregledac "zaprlja" i slika vise ne moze da se izveze.

import natpisSvg from "@/assets/fitlink-wordmark.svg?raw";
import bold from "./fontovi/Poppins-Bold.ttf";
import boldItalic from "./fontovi/Poppins-BoldItalic.ttf";
import medium from "./fontovi/Poppins-Medium.ttf";
import mediumItalic from "./fontovi/Poppins-MediumItalic.ttf";
import regular from "./fontovi/Poppins-Regular.ttf";
import semiBold from "./fontovi/Poppins-SemiBold.ttf";
import semiBoldItalic from "./fontovi/Poppins-SemiBoldItalic.ttf";
import heroUrl from "./hero-back-uspravna.jpg";
import type { SlikaKartice } from "./model";
import { PORODICA } from "./platno";

export { heroUrl };

const LICA: { url: string; weight: string; style: string }[] = [
  { url: regular, weight: "400", style: "normal" },
  { url: medium, weight: "500", style: "normal" },
  { url: semiBold, weight: "600", style: "normal" },
  { url: bold, weight: "700", style: "normal" },
  { url: mediumItalic, weight: "500", style: "italic" },
  { url: semiBoldItalic, weight: "600", style: "italic" },
  { url: boldItalic, weight: "700", style: "italic" },
];

let fontovi: Promise<void> | null = null;

/** Isti Poppins fajlovi kao u iOS aplikaciji, pod svojim imenom. Ceka se pre svakog crtanja. */
export const ucitajFontove = () => {
  if (!fontovi) {
    fontovi = (async () => {
      const lica = await Promise.all(
        LICA.map((l) => new FontFace(PORODICA, `url(${l.url})`, { weight: l.weight, style: l.style }).load()),
      );
      lica.forEach((l) => document.fonts.add(l));
      await document.fonts.ready;
    })().catch(() => {
      fontovi = null;
      throw new Error("Pismo za karticu nije učitano. Proveri internet pa pokušaj ponovo.");
    });
  }
  return fontovi;
};

let natpis: Path2D[] | null = null;

/** Zvanicni FITLINK natpis iz vektora u repou; nikad se ne kuca fontom. */
export const natpisPutanje = () => {
  if (!natpis) {
    natpis = [...natpisSvg.matchAll(/\sd="([^"]+)"/g)].map((m) => new Path2D(m[1]));
  }
  return natpis;
};

const NIJE_SLIKA = "Ova slika ne može da se upotrebi. Izaberi JPG ili PNG fotografiju.";

/** Blob u platno, smanjeno na najvise `maks` piksela; orijentaciju cita pregledac. */
export const slikaIzBloba = async (blob: Blob, maks: number): Promise<SlikaKartice> => {
  const adresa = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = adresa;
    try {
      await img.decode();
    } catch {
      throw new Error(NIJE_SLIKA);
    }
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    if (!w0 || !h0) throw new Error(NIJE_SLIKA);
    const k = Math.min(1, maks / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * k));
    const h = Math.max(1, Math.round(h0 * k));
    const platno = document.createElement("canvas");
    platno.width = w;
    platno.height = h;
    const c = platno.getContext("2d");
    if (!c) throw new Error(NIJE_SLIKA);
    c.imageSmoothingQuality = "high";
    c.drawImage(img, 0, 0, w, h);
    return { izvor: platno, w, h };
  } finally {
    URL.revokeObjectURL(adresa);
  }
};

/**
 * Slika sa druge adrese (potpisan URL fotografije, profilna). Skida se kao blob preko CORS-a
 * i tek onda crta, pa platno ostaje cisto. `no-store` jer bi ranije kesiran odgovor bez
 * CORS zaglavlja oborio zahtev iako je adresa ispravna.
 */
export const slikaSaAdrese = async (adresa: string, maks: number, opis: string): Promise<SlikaKartice> => {
  let odgovor: Response;
  try {
    odgovor = await fetch(adresa, { mode: "cors", credentials: "omit", cache: "no-store" });
  } catch {
    throw new Error(`${opis} ne može da se preuzme za karticu. Proveri internet pa pokušaj ponovo.`);
  }
  if (!odgovor.ok) throw new Error(`${opis} nije dostupna. Pokušaj ponovo.`);
  const blob = await odgovor.blob();
  try {
    return await slikaIzBloba(blob, maks);
  } catch {
    throw new Error(`${opis} ne može da se upotrebi na kartici.`);
  }
};

let hero: Promise<SlikaKartice> | null = null;

/** Podrazumevana fotografija za temu Foto, ista kao na telefonu. */
export const ucitajHero = () => {
  if (!hero) {
    hero = slikaSaAdrese(heroUrl, 2000, "Podrazumevana fotografija").catch((e) => {
      hero = null;
      throw e;
    });
  }
  return hero;
};
