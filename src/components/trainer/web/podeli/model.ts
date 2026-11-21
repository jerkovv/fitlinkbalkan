// Modeli kartica za Instagram, 1:1 sa iOS (Features/Deljenje/KarticaPodaci.swift).
// Kartica se crta samo iz ovoga, pa pregled i izvezena slika izgledaju isto.

export const SIRINA = 360;
/** Kartica se crta na sirini 360 i izvozi tri puta veca: 1080 px kao na telefonu. */
export const UVECANJE = 3;

export type Format = "story" | "objava" | "kvadrat";
export type Tema = "ponoc" | "svetla" | "ugalj" | "foto";
export type Raspored = "levo" | "sredina";
export type PrikazImena = "ime" | "inicijal" | "sakrij";

export const VISINA: Record<Format, number> = { story: 640, objava: 450, kvadrat: 360 };
export const FORMATI: { v: Format; natpis: string }[] = [
  { v: "story", natpis: "Story" },
  { v: "objava", natpis: "Objava" },
  { v: "kvadrat", natpis: "Kvadrat" },
];
export const TEME: { v: Tema; natpis: string }[] = [
  { v: "ponoc", natpis: "Ponoć" },
  { v: "svetla", natpis: "Svetla" },
  { v: "ugalj", natpis: "Ugalj" },
  { v: "foto", natpis: "Foto" },
];
export const RASPOREDI: { v: Raspored; natpis: string }[] = [
  { v: "levo", natpis: "Levo" },
  { v: "sredina", natpis: "Sredina" },
];
export const IMENA: { v: PrikazImena; natpis: string }[] = [
  { v: "ime", natpis: "Ime" },
  { v: "inicijal", natpis: "Slovo" },
  { v: "sakrij", natpis: "Sakrij" },
];

export type BojaAkcenta = { a: string; b: string; c: string; svetla: string };
export const BOJE: BojaAkcenta[] = [
  { a: "#8B3DEB", b: "#5B4BEF", c: "#E24CA6", svetla: "#C4A2FF" },
  { a: "#E24CA6", b: "#C83E9A", c: "#FF7CC6", svetla: "#FF9BD3" },
  { a: "#FF8A3D", b: "#FF6A4D", c: "#FF4D6D", svetla: "#FFB37A" },
  { a: "#D7F64A", b: "#BDEB3C", c: "#A8E030", svetla: "#D7F64A" },
  { a: "#22D3EE", b: "#2FA8F0", c: "#3B82F6", svetla: "#7DE3F4" },
  { a: "#FFFFFF", b: "#E4DFEE", c: "#C9C4D6", svetla: "#FFFFFF" },
];
const TAMNE_NA_SVETLOM = ["#6D28D9", "#C02680", "#D9541A", "#5C7A00", "#0E7490", "#17131F"];

export type StilKartice = {
  format: Format;
  tema: Tema;
  boja: number;
  raspored: Raspored;
  ime: PrikazImena;
  linija: boolean;
  datum: boolean;
  /** Spisak vezbi na treningu, rekordi meseca na trenerovom mesecu. */
  vezbe: boolean;
  puls: boolean;
  poruka: string;
};

export const pocetniStil = (): StilKartice => ({
  format: "story",
  tema: "ponoc",
  boja: 0,
  raspored: "levo",
  ime: "ime",
  linija: true,
  datum: true,
  vezbe: true,
  puls: true,
  poruka: "",
});

export type PotpisKartice = { ime: string; instagram: string; studio: string };
export const prazanPotpis = (): PotpisKartice => ({ ime: "", instagram: "", studio: "" });

/** "@marko.pt" bez obzira kako je upisano. */
export const nalogIz = (p: PotpisKartice) => {
  const s = p.instagram.trim().replace(/@/g, "");
  return s ? `@${s}` : "";
};
export const potpisPrazan = (p: PotpisKartice) => !p.ime.trim() && !nalogIz(p);

/** Slika spremna za platno: izvor je uvek sa iste adrese, pa platno ostaje cisto. */
export type SlikaKartice = { izvor: CanvasImageSource; w: number; h: number };

export type RekordZaDeljenje = {
  vezba: string;
  kg: number;
  pon: number;
  razlika?: number | null;
  napredak: number[];
  odKad?: string | null;
  datum: Date | null;
  klijent?: string | null;
};

export type VezbaTreninga = { naziv: string; serija: string; rekord: boolean };
export type TreningZaDeljenje = {
  naziv: string;
  datum: Date;
  minuta: number | null;
  volumen: number | null;
  serija: number | null;
  puls: number | null;
  kalorije: number | null;
  pulsNiz: number[];
  vezbe: VezbaTreninga[];
  klijent?: string | null;
};

export type DanTermina = { naziv: string; datum: string; vremena: string[] };
export type TerminiZaDeljenje = { naslov: string; opseg: string; dani: DanTermina[] };

export type RekordMeseca = { ime: string; vezba: string; vrednost: string };
export type MesecTreneraZaDeljenje = {
  mesec: string;
  naslov: string;
  treninga: number;
  klijenata: number | null;
  rekorda: number | null;
  dolaznost: number | null;
  rekordi: RekordMeseca[];
};

export type IkonaMere = "ruler" | "drop" | "dumbbell";
export type MeraPromene = { opis: string; vrednost: string; ikona: IkonaMere };
export type PreIPosleZaDeljenje = {
  klijent?: string | null;
  pre: SlikaKartice | null;
  posle: SlikaKartice | null;
  preDatum: string;
  posleDatum: string;
  promenaKg: number | null;
  trajanje: string | null;
  mere: MeraPromene[];
};

export type NapredakVezbe = { vezba: string; pre: number; posle: number; jedinica: string };
export type MesecKlijentaZaDeljenje = {
  klijent: string;
  mesec: string;
  mesecMalo: string;
  treninga: number;
  zakazano: number | null;
  dani: number[];
  rekordDani: number[];
  brojDana: number;
  pomak: number;
  napredak: NapredakVezbe[];
  kg: number;
  minuta: number;
  kcal: number | null;
  rekorda: number;
};

export type SadrzajKartice =
  | { vrsta: "rekord"; r: RekordZaDeljenje }
  | { vrsta: "trening"; t: TreningZaDeljenje }
  | { vrsta: "termini"; t: TerminiZaDeljenje }
  | { vrsta: "mesecTrenera"; m: MesecTreneraZaDeljenje }
  | { vrsta: "preIPosle"; x: PreIPosleZaDeljenje }
  | { vrsta: "mesecKlijenta"; m: MesecKlijentaZaDeljenje };

export const naslovLista = (s: SadrzajKartice) => {
  switch (s.vrsta) {
    case "rekord": return "Podeli rekord";
    case "trening": return "Podeli trening";
    case "termini": return "Podeli termine";
    case "preIPosle": return "Podeli pre i posle";
    default: return "Podeli mesec";
  }
};

export const klijentKartice = (s: SadrzajKartice): string | null => {
  switch (s.vrsta) {
    case "rekord": return s.r.klijent ?? null;
    case "trening": return s.t.klijent ?? null;
    case "preIPosle": return s.x.klijent ?? null;
    case "mesecKlijenta": return s.m.klijent ?? null;
    default: return null;
  }
};

/** Koje slike karusel ima: naslovna, dolasci, napredak (samo kad ima podataka), zbir, poziv. */
export const straneMeseca = (m: MesecKlijentaZaDeljenje) => [0, 1, ...(m.napredak.length ? [2] : []), 3, 4];
export const brojStrana = (s: SadrzajKartice) => (s.vrsta === "mesecKlijenta" ? straneMeseca(s.m).length : 1);

/** Naslov koji se moze promeniti; prazan znaci da ta kartica nema takav naslov. */
export const izvorniNaslov = (s: SadrzajKartice) => {
  switch (s.vrsta) {
    case "rekord": return s.r.vezba;
    case "trening": return s.t.naziv;
    case "termini": return s.t.naslov;
    case "mesecTrenera": return s.m.naslov;
    default: return "";
  }
};

/** Sadrzaj sa naslovom koji je korisnik upisao. */
export const saNaslovom = (s: SadrzajKartice, naslov: string): SadrzajKartice => {
  const t = naslov.trim();
  if (!t || t === izvorniNaslov(s)) return s;
  switch (s.vrsta) {
    case "rekord": return { ...s, r: { ...s.r, vezba: t } };
    case "trening": return { ...s, t: { ...s.t, naziv: t } };
    case "termini": return { ...s, t: { ...s.t, naslov: t } };
    case "mesecTrenera": return { ...s, m: { ...s.m, naslov: t } };
    default: return s;
  }
};

/** Kako se klijent pise na kartici. */
export const prikazKlijenta = (stil: StilKartice, klijent?: string | null): string | null => {
  const prvo = klijent?.trim().split(/\s+/)[0];
  if (!prvo) return null;
  if (stil.ime === "ime") return prvo;
  if (stil.ime === "inicijal") return `${[...prvo][0]}.`;
  return null;
};

// Brojke i reci

/** 62,5 ili 100: zarez, bez nula na kraju. */
export const kgTekst = (v: number | null | undefined) => {
  if (v == null) return "";
  if (v === Math.round(v)) return String(v);
  return v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
};

/** Tacka za hiljade: 2.140 */
export const iznos = (v: number) =>
  String(Math.round(Math.abs(v))).replace(/\B(?=(\d{3})+$)/g, ".").replace(/^/, v < 0 ? "-" : "");

const jednaDecimala = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return r === Math.round(r) ? String(r) : r.toFixed(1).replace(".", ",");
};

/** "+1,2", "-3,6" ili "0". */
export const razlikaMere = (d: number) => {
  const r = Math.round(d * 10) / 10;
  if (r === 0) return "0";
  return (r > 0 ? "+" : "-") + jednaDecimala(Math.abs(r));
};

/** Srpska mnozina: 1 nedelja, 2 nedelje, 5 nedelja. */
export const oblik = (n: number, jedan: string, malo: string, mnogo: string) => {
  const p = n % 10;
  const p2 = n % 100;
  if (p === 1 && p2 !== 11) return jedan;
  if (p >= 2 && p <= 4 && !(p2 >= 12 && p2 <= 14)) return malo;
  return mnogo;
};

export const ponavljanjaRec = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "ponavljanje" : "ponavljanja");
export const serijaRec = (n: number) => {
  const p = n % 10;
  const p2 = n % 100;
  return p >= 2 && p <= 4 && !(p2 >= 12 && p2 <= 14) ? "serije" : "serija";
};

const MESECI_KRATKO = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "avg", "sep", "okt", "nov", "dec"];
const delovi = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Belgrade",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/** "19. nov 2026" po Beogradu. */
export const datumTekst = (d: Date) => {
  const p = Object.fromEntries(delovi.formatToParts(d).map((x) => [x.type, x.value]));
  return `${Number(p.day)}. ${MESECI_KRATKO[Number(p.month) - 1]} ${p.year}`;
};

// Boje

export const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export const INK = "#0B0A10";

export type Paleta = {
  podloga: string;
  tx: string;
  tx2: string;
  tx3: string;
  linija: string;
  akcent: string;
  sjaj: string;
  sjaj2: string;
  naPrelivu: string;
  svetla: boolean;
  preliv: [string, string, string];
  /** Krupna brojka: odakle i dokle ide preliv (udeo visine). */
  brojka: { od: string; do: string; start: number };
};

export const paleta = (s: StilKartice): Paleta => {
  const i = Math.min(Math.max(s.boja, 0), BOJE.length - 1);
  const b = BOJE[i];
  const svetla = s.tema === "svetla";
  const zajednicko = {
    sjaj: b.a,
    sjaj2: b.c,
    naPrelivu: i === 3 || i === 5 ? INK : "#FFFFFF",
    svetla,
    preliv: [b.a, b.b, b.c] as [string, string, string],
  };
  if (svetla) {
    const tamna = TAMNE_NA_SVETLOM[i];
    return {
      ...zajednicko,
      podloga: "#F3EFE8",
      tx: "#17131F",
      tx2: "#5E566B",
      tx3: "#8E879B",
      linija: rgba("#17131F", 0.13),
      akcent: tamna,
      brojka: { od: "#17131F", do: tamna, start: 0 },
    };
  }
  return {
    ...zajednicko,
    podloga: s.tema === "ugalj" ? "#0A0A0A" : INK,
    tx: "#F6F3FB",
    tx2: "#B4ACC4",
    tx3: "#7D768E",
    linija: rgba("#ECE4FF", 0.12),
    akcent: b.svetla,
    brojka: { od: "#FFFFFF", do: s.tema === "ugalj" ? "#FFFFFF" : b.svetla, start: 0.3 },
  };
};

// Moj stil: pamti se po nalogu, u ovom pregledacu

const kljucStila = (uid: string | null | undefined) => `stilKartice.${uid ?? "gost"}`;

const izListe = <T extends string>(v: unknown, lista: { v: T }[], rezerva: T): T =>
  lista.some((x) => x.v === v) ? (v as T) : rezerva;
const daNe = (v: unknown, rezerva: boolean) => (typeof v === "boolean" ? v : rezerva);
const tekstIz = (v: unknown) => (typeof v === "string" ? v.slice(0, 80) : "");

/** Zapamcen stil; ostecen ili nedostupan zapis znaci da stila nema. */
export const ucitajMojStil = (uid: string | null | undefined): { stil: StilKartice; potpis: PotpisKartice } | null => {
  try {
    const sirovo = window.localStorage.getItem(kljucStila(uid));
    if (!sirovo) return null;
    const d = JSON.parse(sirovo);
    const o = pocetniStil();
    const s = d?.stil ?? {};
    return {
      stil: {
        ...o,
        tema: izListe(s.tema, TEME, o.tema),
        boja: Number.isInteger(s.boja) && s.boja >= 0 && s.boja < BOJE.length ? s.boja : 0,
        raspored: izListe(s.raspored, RASPOREDI, o.raspored),
        ime: izListe(s.ime, IMENA, o.ime),
        linija: daNe(s.linija, true),
        datum: daNe(s.datum, true),
        vezbe: daNe(s.vezbe, true),
        puls: daNe(s.puls, true),
      },
      potpis: {
        ime: tekstIz(d?.potpis?.ime),
        instagram: tekstIz(d?.potpis?.instagram),
        studio: tekstIz(d?.potpis?.studio),
      },
    };
  } catch {
    return null;
  }
};

/** Poruka i format vaze za jednu karticu, ne za sve sledece. Vraca false kad upis ne uspe. */
export const sacuvajMojStil = (stil: StilKartice, potpis: PotpisKartice, uid: string | null | undefined) => {
  try {
    window.localStorage.setItem(
      kljucStila(uid),
      JSON.stringify({ stil: { ...stil, poruka: "", format: "story" }, potpis }),
    );
    return true;
  } catch {
    return false;
  }
};
