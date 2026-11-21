// Kartica za Instagram na platnu, red po red kao KarticaView.swift i KarticeTrenera.swift.
// Crta se na sirini 360 (story 360 x 640) i uvecava tri puta, pa je pregled isto sto i slika.

import { crtajZnak, type NazivZnaka } from "./ikone";
import {
  INK,
  SIRINA,
  UVECANJE,
  VISINA,
  datumTekst,
  iznos,
  kgTekst,
  nalogIz,
  paleta,
  ponavljanjaRec,
  potpisPrazan,
  prikazKlijenta,
  rgba,
  serijaRec,
  straneMeseca,
  type MesecKlijentaZaDeljenje,
  type MesecTreneraZaDeljenje,
  type NapredakVezbe,
  type Paleta,
  type PotpisKartice,
  type PreIPosleZaDeljenje,
  type RekordZaDeljenje,
  type SadrzajKartice,
  type SlikaKartice,
  type StilKartice,
  type DanTermina,
  type TerminiZaDeljenje,
  type TreningZaDeljenje,
  type VezbaTreninga,
} from "./model";
import {
  PrviKojiStane,
  bogatTekst,
  crtez,
  kolona,
  odmak,
  okvir,
  razmak,
  red,
  skuplja,
  tekst,
  uSirini,
  zaobljeno,
  type Bojenje,
  type Ctx,
  type Cvor,
} from "./platno";

export type UlazKartice = {
  sadrzaj: SadrzajKartice;
  /** Slika karusela; ostale kartice imaju samo nultu. */
  strana: number;
  stil: StilKartice;
  potpis: PotpisKartice;
  /** Vezbac deli svoj rezultat: natpisi su u prvom licu. */
  svoj?: boolean;
  foto?: SlikaKartice | null;
  lice?: SlikaKartice | null;
  /** Zvanicni FitLink natpis kao vektor; nikad se ne kuca fontom. */
  natpis: Path2D[];
};

const NATPIS_W = 1012.12;
const NATPIS_H = 152.08;
const PLOCICA_R = 16;

const ZONE = ["#FF453A", "#FF9F0A", "#FFD60A", "#30D158", "#0A84FF"];

const pokrij = (c: Ctx, s: SlikaKartice, x: number, y: number, w: number, h: number) => {
  const k = Math.max(w / s.w, h / s.h);
  const sw = w / k;
  const sh = h / k;
  c.drawImage(s.izvor, (s.w - sw) / 2, (s.h - sh) / 2, sw, sh, x, y, w, h);
};

const vertikalni = (c: Ctx, y: number, h: number, stope: [number, string][]) => {
  const g = c.createLinearGradient(0, y, 0, y + h);
  stope.forEach(([o, b]) => g.addColorStop(o, b));
  return g;
};

class Graditelj {
  readonly p: Paleta;
  readonly story: boolean;
  readonly kvadrat: boolean;
  readonly sredina: boolean;
  readonly poruka: string;
  constructor(readonly u: UlazKartice) {
    this.p = paleta(u.stil);
    this.story = u.stil.format === "story";
    this.kvadrat = u.stil.format === "kvadrat";
    this.sredina = u.stil.raspored === "sredina";
    this.poruka = u.stil.poruka.trim();
  }

  private get brojka(): Bojenje {
    const b = this.p.brojka;
    return (c, _x, y, _w, h) => vertikalni(c, y + h * b.start, h * (1 - b.start), [[0, b.od], [1, b.do]]);
  }

  private get senkaBrojke() {
    return { boja: rgba(this.p.sjaj, this.p.svetla ? 0.25 : 0.6), r: 16, y: 8 };
  }

  private znak(naziv: NazivZnaka, vel: number, boja: string): Cvor {
    // SF Symbol popunjava svoj okvir, a ovi znakovi imaju vazduh u polju 24 x 24.
    const veci = vel * 1.28;
    const pomak = (veci - vel) / 2;
    return crtez(vel, (c, x, y) => crtajZnak(c, naziv, x - pomak, y - pomak, veci, boja, this.p.podloga), vel);
  }

  private crta(): Cvor {
    return crtez(1, (c, x, y, w) => {
      c.fillStyle = this.p.linija;
      c.fillRect(x, y, w, 1);
    });
  }

  // Zajednicko

  private vrh(desno?: string | null): Cvor {
    const visina = (66 * NATPIS_H) / NATPIS_W;
    const logo = crtez(visina, (c, x, y) => {
      c.save();
      c.translate(x, y);
      c.scale(66 / NATPIS_W, 66 / NATPIS_W);
      c.fillStyle = rgba(this.p.tx, 0.92);
      this.u.natpis.forEach((d) => c.fill(d));
      c.restore();
    }, 66);
    return red([
      logo,
      razmak(),
      desno ? tekst(desno, { vel: 11, tez: 500, boja: this.p.tx2 }, { fiksno: true }) : null,
    ]);
  }

  private vrhDatum(d: Date | null) {
    return this.vrh(this.u.stil.datum && d ? datumTekst(d) : null);
  }

  private nadnaslov(znak: NazivZnaka, t: string): Cvor {
    return red([
      this.znak(znak, 12, this.p.akcent),
      skuplja(tekst(t, { vel: 10.5, tez: 600, razmak: 1.4, velika: true, boja: this.p.akcent }, { redova: 2, sredina: this.sredina })),
    ], { razmak: 6 });
  }

  private naslov(t: string, vel: number, razmakSlova: number, minSkala: number): Cvor {
    return tekst(t, { vel, tez: 700, razmak: razmakSlova, boja: this.p.tx }, { redova: 2, minSkala, sredina: this.sredina });
  }

  private krupno(broj: string, jedinica: string | null, opis: string): Cvor[] {
    return [
      odmak(this.brojkaRed(broj, jedinica), { g: this.kvadrat ? -6 : -4, d: -12 }),
      tekst(opis, { vel: 14, tez: 500, boja: this.p.tx2 }, { sredina: this.sredina }),
    ];
  }

  private brojkaRed(broj: string, jedinica: string | null): Cvor {
    return red([
      skuplja(odmak(
        tekst(broj, { vel: this.kvadrat ? 58 : 64, tez: 700, kurziv: true, razmak: -2.6, boja: this.brojka },
          { redova: 1, minSkala: 0.6, senka: this.senkaBrojke }),
        { r: 8 },
      )),
      jedinica ? tekst(jedinica, { vel: 24, tez: 600, kurziv: true, boja: this.p.tx }, { fiksno: true }) : null,
    ], { razmak: 6, osnova: true });
  }

  private plocica(z: NazivZnaka, broj: string, jedinica: string | null, opis: string): Cvor {
    const p = this.p;
    const unutra = kolona([
      this.znak(z, 12, p.akcent),
      odmak(red([
        skuplja(odmak(tekst(broj, { vel: 23, tez: 700, kurziv: true, razmak: -0.5, boja: p.tx }, { redova: 1, minSkala: 0.7 }), { r: 2 })),
        jedinica ? tekst(jedinica, { vel: 11, tez: 500, boja: p.tx2 }, { fiksno: true }) : null,
      ], { razmak: 3, osnova: true }), { g: -3, d: -3 }),
      tekst(opis, { vel: 10.5, boja: p.tx3 }, { redova: 1, minSkala: 0.8 }),
    ], { razmak: 3, puni: true });
    return okvir(unutra, { pH: 11, pG: 8, pD: 8, r: PLOCICA_R, pozadina: rgba(p.tx, 0.06), linija: p.linija, puni: true });
  }

  private krugLica(k = 1): Cvor {
    const vel = 40 * k;
    const { p, u } = this;
    return crtez(vel, (c, x, y) => {
      const r = vel / 2;
      const cx = x + r;
      const cy = y + r;
      if (u.lice) {
        c.save();
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.clip();
        pokrij(c, u.lice, x, y, vel, vel);
        c.restore();
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.strokeStyle = rgba(p.akcent, 0.6);
        c.lineWidth = 1.5 * k;
        c.stroke();
        return;
      }
      const g = c.createLinearGradient(x, y, x + vel, y + vel);
      g.addColorStop(0, p.preliv[0]);
      g.addColorStop(0.5, p.preliv[1]);
      g.addColorStop(1, p.preliv[2]);
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.fillStyle = g;
      c.fill();
      c.beginPath();
      c.arc(cx, cy, r + 3 * k, 0, Math.PI * 2);
      c.strokeStyle = rgba(p.akcent, 0.55);
      c.lineWidth = k;
      c.stroke();
      const slova = u.potpis.ime.trim().split(/\s+/).slice(0, 2).map((s) => [...s][0] ?? "").join("").toLocaleUpperCase("sr-Latn");
      if (slova) {
        const t = tekst(slova, { vel: 14 * k, tez: 700, boja: p.naPrelivu }, { fiksno: true });
        const m = t.meri(c, vel);
        t.crtaj(c, cx - m.w / 2, cy - m.h / 2, m.w);
      }
    }, vel);
  }

  private potpisRed(): Cvor {
    const { p, u } = this;
    const nalog = nalogIz(u.potpis);
    const drugi = [nalog, u.potpis.studio.trim()].filter(Boolean).join(" · ");
    const ima = !potpisPrazan(u.potpis);
    return kolona([
      this.crta(),
      red([
        ima ? this.krugLica() : null,
        ima ? skuplja(kolona([
          tekst(u.svoj ? "Moj trener" : "Trener", { vel: 9, tez: 600, razmak: 1.3, velika: true, boja: p.tx3 }, { redova: 1 }),
          u.potpis.ime.trim() ? tekst(u.potpis.ime.trim(), { vel: 14, tez: 600, boja: p.tx }, { redova: 1, minSkala: 0.8 }) : null,
          drugi ? tekst(drugi, { vel: 12, tez: 500, boja: p.akcent }, { redova: 1, minSkala: 0.75 }) : null,
        ])) : null,
        razmak(),
        tekst("fitlink.rs", { vel: 10.5, tez: 500, boja: p.tx3 }, { fiksno: true }),
      ], { razmak: 11 }),
    ], { razmak: 10, puni: true });
  }

  // Rekord

  private rekord(r: RekordZaDeljenje): (Cvor | null)[] {
    const { p, u, kvadrat, story, sredina, poruka } = this;
    const ime = u.svoj ? null : prikazKlijenta(u.stil, r.klijent);
    const recenica = this.recenicaRekorda(r, ime);
    return [
      this.vrhDatum(r.datum),
      odmak(this.nadnaslov("trophy", u.svoj ? "Moj novi lični rekord" : ime ? `${ime} · novi lični rekord` : "Novi lični rekord"), { g: story ? 18 : 12 }),
      razmak(),
      tekst(r.vezba, { vel: kvadrat ? 20 : 24, tez: 700, razmak: -0.6, boja: p.tx }, { redova: 2, minSkala: 0.75, sredina }),
      odmak(red([
        skuplja(odmak(
          tekst(kgTekst(r.kg), { vel: kvadrat ? 84 : 104, tez: 700, kurziv: true, razmak: -4, boja: this.brojka },
            { redova: 1, minSkala: 0.55, senka: this.senkaBrojke }),
          { r: 10 },
        )),
        tekst("kg", { vel: 28, tez: 600, kurziv: true, boja: p.tx }, { fiksno: true }),
      ], { razmak: 6, osnova: true }), { g: kvadrat ? -14 : -18, d: kvadrat ? -14 : -18 }),
      tekst(`${r.pon} ${ponavljanjaRec(r.pon)} u jednoj seriji`, { vel: 14, tez: 500, boja: p.tx2 }, { sredina }),
      recenica ? odmak(red([this.znak("arrowUp", 11, p.akcent), skuplja(recenica)], { razmak: 7 }), { g: 10 }) : null,
      poruka ? odmak(tekst(`“${poruka}”`, { vel: 14, tez: 500, kurziv: true, boja: p.tx2 }, { sredina }), { g: 8 }) : null,
      u.stil.linija && r.napredak.length >= 3 && !kvadrat ? odmak(this.linijaNapretka(r.napredak), { g: 14 }) : null,
      odmak(this.potpisRed(), { g: 16 }),
    ];
  }

  /** "Luka diže 20 kg više nego u avgustu"; istaknut je samo broj. */
  private recenicaRekorda(r: RekordZaDeljenje, ime: string | null): Cvor | null {
    const { p, sredina } = this;
    let raz: number;
    let odKad: string;
    const prva = r.napredak[0];
    if (r.napredak.length >= 3 && r.odKad && r.kg - prva > 0) {
      raz = r.kg - prva;
      odKad = `nego ${r.odKad}`;
    } else if (r.razlika != null && r.razlika > 0) {
      raz = r.razlika;
      odKad = "nego prošli put";
    } else {
      return null;
    }
    const obican = { vel: 14.5, tez: 500 as const, boja: p.tx };
    return bogatTekst([
      ...(ime ? [{ tekst: `${ime} diže `, stil: obican }] : []),
      { tekst: `${kgTekst(raz)} kg više`, stil: { vel: 14.5, tez: 700 as const, boja: p.akcent } },
      { tekst: ` ${odKad}`, stil: obican },
    ], { sredina });
  }

  private linijaNapretka(tacke: number[]): Cvor {
    const { p } = this;
    const graf = crtez(60, (c, x, y, w, h) => {
      const min = Math.min(...tacke);
      const max = Math.max(...tacke);
      const raspon = Math.max(max - min, 0.001);
      const t = tacke.map((v, i) => ({
        x: x + 6 + ((w - 14) * i) / (tacke.length - 1),
        y: y + 8 + (h - 14) * (1 - (v - min) / raspon),
      }));
      c.beginPath();
      c.moveTo(t[0].x, y + h);
      t.forEach((a) => c.lineTo(a.x, a.y));
      c.lineTo(t[t.length - 1].x, y + h);
      c.closePath();
      c.fillStyle = vertikalni(c, y, h, [[0, rgba(p.sjaj, 0.42)], [1, rgba(p.sjaj, 0)]]);
      c.fill();
      c.beginPath();
      t.forEach((a, i) => (i ? c.lineTo(a.x, a.y) : c.moveTo(a.x, a.y)));
      const g = c.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, p.sjaj);
      g.addColorStop(1, p.sjaj2);
      c.strokeStyle = g;
      c.lineWidth = 3;
      c.lineCap = "round";
      c.lineJoin = "round";
      c.stroke();
      t.slice(0, -1).forEach((a) => {
        c.beginPath();
        c.arc(a.x, a.y, 3.5, 0, Math.PI * 2);
        c.fillStyle = p.podloga;
        c.fill();
        c.strokeStyle = p.akcent;
        c.lineWidth = 2;
        c.stroke();
      });
      const z = t[t.length - 1];
      c.beginPath();
      c.arc(z.x, z.y, 6, 0, Math.PI * 2);
      c.fillStyle = "#FFFFFF";
      c.fill();
      c.strokeStyle = p.sjaj2;
      c.lineWidth = 3;
      c.stroke();
    });
    return kolona([
      graf,
      red([
        tekst(`${kgTekst(tacke[0])} kg`, { vel: 10.5, boja: p.tx3 }, { fiksno: true }),
        razmak(),
        tekst(`${kgTekst(tacke[tacke.length - 1])} kg`, { vel: 10.5, tez: 600, boja: p.tx2 }, { fiksno: true }),
      ]),
    ], { razmak: 6, puni: true });
  }

  // Trening

  private trening(t: TreningZaDeljenje): (Cvor | null)[] {
    const { p, u, kvadrat, sredina } = this;
    const ime = u.svoj ? null : prikazKlijenta(u.stil, t.klijent);
    let glavna: { broj: string; jedinica: string; opis: string; vrsta: number } | null = null;
    if (t.volumen != null && t.volumen > 0) glavna = { broj: iznos(t.volumen), jedinica: "kg", opis: "ukupno podignuto", vrsta: 0 };
    else if (t.minuta != null) glavna = { broj: String(t.minuta), jedinica: "min", opis: "trajanje treninga", vrsta: 1 };
    else if (t.kalorije != null) glavna = { broj: String(t.kalorije), jedinica: "kcal", opis: "potrošeno", vrsta: 2 };

    const st: Cvor[] = [];
    if (t.minuta != null && glavna?.vrsta !== 1) st.push(this.plocica("clock", String(t.minuta), "min", "trajanje"));
    if (t.kalorije != null && glavna?.vrsta !== 2) st.push(this.plocica("flame", String(t.kalorije), "kcal", "potrošeno"));
    if (t.puls != null) st.push(this.plocica("heart", String(t.puls), null, "prosečan puls"));
    if (t.serija != null && t.serija > 0) st.push(this.plocica("layers", String(t.serija), null, serijaRec(t.serija)));

    return [
      this.vrhDatum(t.datum),
      odmak(this.nadnaslov("check", ime ? `${ime} · trening završen` : "Trening završen"), { g: 10 }),
      odmak(tekst(t.naziv, { vel: kvadrat ? 24 : 30, tez: 700, razmak: -0.9, boja: p.tx }, { redova: 2, minSkala: 0.7, sredina }), { g: 4 }),
      glavna ? odmak(this.brojkaRed(glavna.broj, glavna.jedinica), { g: -6, d: kvadrat ? -12 : -16 }) : null,
      glavna ? tekst(glavna.opis, { vel: 14, tez: 500, boja: p.tx2 }, { sredina }) : null,
      st.length ? odmak(red(st.slice(0, 3), { razmak: 8 }), { g: 10 }) : null,
      kvadrat ? razmak() : odmak(this.dodaci(t), { g: 8 }),
      this.potpisRed(),
    ];
  }

  /** Ispod brojki ide ono sto stane: puls, rekord kao istaknuta stavka, pa vezbe. */
  private dodaci(t: TreningZaDeljenje): Cvor {
    const rekord = t.vezbe.find((v) => v.rekord) ?? null;
    const ostale = this.u.stil.vezbe ? t.vezbe.filter((v) => !v.rekord) : [];
    const puls = this.u.stil.puls && t.pulsNiz.length > 3;
    const izbor: Cvor[] = [];
    for (const n of [3, 2, 1, 0]) izbor.push(this.blok(t, puls, rekord, ostale.slice(0, n)));
    for (const n of [3, 2, 1, 0]) izbor.push(this.blok(t, false, rekord, ostale.slice(0, n)));
    izbor.push(crtez(0, () => undefined));
    return new PrviKojiStane(izbor);
  }

  private blok(t: TreningZaDeljenje, puls: boolean, rekord: VezbaTreninga | null, vezbe: VezbaTreninga[]): Cvor {
    const { p } = this;
    return kolona([
      puls ? this.pulsKartica(t) : null,
      rekord ? this.rekordIstaknut(rekord) : null,
      vezbe.length ? kolona(vezbe.flatMap((v, i) => [
        i > 0 ? this.crta() : null,
        odmak(red([
          skuplja(tekst(v.naziv, { vel: 13, tez: 500, boja: p.tx }, { redova: 2 })),
          razmak(),
          tekst(v.serija, { vel: 13, tez: 600, boja: p.tx2 }, { fiksno: true }),
        ], { razmak: 8 }), { g: 7, d: 7 }),
      ]), { puni: true }) : null,
    ], { razmak: 8, puni: true });
  }

  private pulsKartica(t: TreningZaDeljenje): Cvor {
    const { p } = this;
    const niz = t.pulsNiz;
    const kriva = crtez(32, (c, x, y, w, h) => {
      const uzorak = niz.length > 72
        ? Array.from({ length: 72 }, (_, i) => niz[Math.min(niz.length - 1, Math.floor((i * niz.length) / 72))])
        : niz;
      const dno = Math.min(...uzorak) - 6;
      const gore = Math.max(...uzorak) + 4;
      const raspon = Math.max(gore - dno, 1);
      const a = uzorak.map((v, i) => ({
        x: x + (w * i) / Math.max(uzorak.length - 1, 1),
        y: y + (h - 6) * (1 - (v - dno) / raspon) + 2,
      }));
      c.beginPath();
      c.moveTo(x, y + h);
      a.forEach((q) => c.lineTo(q.x, q.y));
      c.lineTo(x + w, y + h);
      c.closePath();
      c.fillStyle = vertikalni(c, y, h, [[0, rgba(p.sjaj, 0.4)], [1, rgba(p.sjaj, 0)]]);
      c.fill();
      c.save();
      c.beginPath();
      a.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
      c.strokeStyle = vertikalni(c, y, h, [[0, ZONE[0]], [0.3, ZONE[1]], [0.52, ZONE[2]], [0.76, ZONE[3]], [1, ZONE[4]]]);
      c.lineWidth = 2.6;
      c.lineCap = "round";
      c.lineJoin = "round";
      c.shadowColor = rgba(ZONE[1], 0.45);
      c.shadowBlur = 10 * UVECANJE;
      c.stroke();
      c.restore();
    });
    const unutra = kolona([
      red([
        red([
          this.znak("activity", 10, p.tx2),
          tekst("Puls tokom treninga", { vel: 9.5, tez: 600, razmak: 1.2, velika: true, boja: p.tx2 }, { fiksno: true }),
        ], { razmak: 5 }),
        razmak(),
        niz.length ? tekst(`najviše ${Math.max(...niz)}`, { vel: 10.5, tez: 500, boja: p.tx3 }, { fiksno: true }) : null,
      ]),
      kriva,
    ], { razmak: 6, puni: true });
    return okvir(unutra, { pH: 12, pG: 8, pD: 5, r: PLOCICA_R, pozadina: rgba(p.tx, 0.06), linija: p.linija, puni: true });
  }

  private rekordIstaknut(v: VezbaTreninga): Cvor {
    const { p } = this;
    const znakBoja = p.svetla ? "#FFFFFF" : INK;
    const krug = crtez(30, (c, x, y) => {
      c.beginPath();
      c.arc(x + 15, y + 15, 15, 0, Math.PI * 2);
      c.fillStyle = p.akcent;
      c.fill();
      crtajZnak(c, "trophy", x + 6.5, y + 6.5, 17, znakBoja, p.akcent);
    }, 30);
    const unutra = red([
      krug,
      skuplja(kolona([
        tekst("Novi lični rekord", { vel: 9.5, tez: 600, razmak: 1.2, velika: true, boja: p.akcent }, { redova: 1 }),
        tekst(v.naziv, { vel: 13, tez: 600, boja: p.tx }, { redova: 2 }),
      ])),
      razmak(),
      tekst(v.serija, { vel: 15, tez: 700, kurziv: true, boja: p.tx }, { fiksno: true }),
    ], { razmak: 10 });
    return okvir(unutra, { pH: 12, pG: 7, pD: 7, r: PLOCICA_R, pozadina: rgba(p.akcent, 0.13), linija: rgba(p.akcent, 0.4), puni: true });
  }

  // Slobodni termini

  private termini(t: TerminiZaDeljenje): (Cvor | null)[] {
    const { p, story, kvadrat, poruka } = this;
    // Na kartici stane manje dana nego sto ih je ucitano, pa opseg prati ono sto se vidi.
    const prikazani = t.dani.slice(0, story ? 6 : kvadrat ? 2 : 5);
    let opseg = t.opseg;
    if (prikazani.length < t.dani.length && prikazani.length) {
      const prvi = prikazani[0];
      const zadnji = prikazani[prikazani.length - 1];
      opseg = prvi.datum === zadnji.datum ? prvi.datum : `${prvi.datum} do ${zadnji.datum}`;
    }
    const izbor = new PrviKojiStane([
      this.redoviTermina(prikazani),
      this.redoviTermina(prikazani.slice(0, Math.max(prikazani.length - 1, 0))),
      this.redoviTermina(prikazani.slice(0, Math.max(prikazani.length - 2, 0))),
      this.redoviTermina(prikazani.slice(0, 2)),
    ]);
    return [
      this.vrh(opseg),
      odmak(this.nadnaslov("calendar", "Slobodni termini"), { g: 10 }),
      odmak(this.naslov(t.naslov, kvadrat ? 22 : 26, -0.8, 0.8), { g: 4 }),
      odmak(izbor, { g: story ? 10 : 6 }),
      odmak(red([
        this.znak("send", 11, p.akcent),
        skuplja(tekst(poruka || "Piši mi u poruke i termin je tvoj", { vel: 13.5, tez: 500, boja: p.tx })),
      ], { razmak: 7 }), { d: story ? 12 : 8 }),
      this.potpisRed(),
    ];
  }

  private redoviTermina(dani: DanTermina[]): Cvor {
    return kolona(dani.flatMap((d, i) => [i > 0 ? this.crta() : null, this.redTermina(d)]), { puni: true });
  }

  private redTermina(d: DanTermina): Cvor {
    const { p, story } = this;
    const dan = uSirini(kolona([
      tekst(d.naziv, { vel: 14, tez: 600, boja: d.vremena.length ? p.tx : p.tx3 }, { fiksno: true }),
      tekst(d.datum, { vel: 10.5, boja: p.tx3 }, { fiksno: true }),
    ], { razmak: -1 }), 58);
    const vremena = d.vremena.slice(0, 4);
    // Cetiri termina ne staju u red sa punim razmakom, pa se samo tada zbiju.
    const zbijeno = vremena.length === 4;
    const dugme = (v: string) => okvir(
      tekst(v, { vel: 14, tez: 700, kurziv: true, boja: p.tx }, { fiksno: true }),
      { pH: zbijeno ? 6 : 10, visina: 28, r: 11, pozadina: rgba(p.akcent, 0.14), linija: rgba(p.akcent, 0.35) },
    );
    return odmak(red([
      red([dan, ...(vremena.length ? [] : [tekst("popunjeno", { vel: 12, boja: p.tx3 }, { fiksno: true })])], { razmak: 10 }),
      ...(vremena.length ? [red(vremena.map(dugme), { razmak: zbijeno ? 5 : 10 })] : []),
      razmak(),
    ], { razmak: zbijeno ? 6 : 10 }), { g: story ? 6 : 4, d: story ? 6 : 4 });
  }

  // Trenerov mesec

  private mesecTrenera(m: MesecTreneraZaDeljenje): (Cvor | null)[] {
    const { p, u, story, kvadrat } = this;
    const st: Cvor[] = [];
    if (m.klijenata != null) st.push(this.plocica("users", String(m.klijenata), null, m.klijenata % 10 === 1 && m.klijenata % 100 !== 11 ? "klijent" : "klijenata"));
    if (m.rekorda != null) st.push(this.plocica("trophy", String(m.rekorda), null, "novih rekorda"));
    if (m.dolaznost != null) st.push(this.plocica("badge", String(m.dolaznost), "%", "dolaznost"));
    const rekordi = story && u.stil.vezbe && m.rekordi.length > 0;
    return [
      this.vrh(m.mesec),
      odmak(this.nadnaslov("chart", "Mesec u brojkama"), { g: 10 }),
      odmak(this.naslov(m.naslov, kvadrat ? 24 : 30, -0.9, 0.7), { g: 4 }),
      ...this.krupno(String(m.treninga), null, m.treninga % 10 === 1 && m.treninga % 100 !== 11 ? "održan trening" : "održanih treninga"),
      st.length ? odmak(red(st, { razmak: 8 }), { g: 10 }) : null,
      rekordi ? odmak(red([
        this.znak("trophy", 10, p.tx2),
        tekst("Rekordi meseca", { vel: 9.5, tez: 600, razmak: 1.2, velika: true, boja: p.tx2 }, { fiksno: true }),
      ], { razmak: 6 }), { g: 16, d: 2 }) : null,
      rekordi ? kolona(m.rekordi.slice(0, 3).flatMap((r, i) => [
        i > 0 ? this.crta() : null,
        odmak(red([
          tekst(r.ime, { vel: 13.5, tez: 600, boja: p.tx }, { fiksno: true }),
          skuplja(tekst(r.vezba, { vel: 13, boja: p.tx2 }, { redova: 1, minSkala: 0.75 })),
          razmak(),
          tekst(r.vrednost, { vel: 14, tez: 700, kurziv: true, boja: p.akcent }, { fiksno: true }),
        ], { razmak: 8 }), { g: 8, d: 8 }),
      ]), { puni: true }) : null,
      razmak(),
      this.potpisRed(),
    ];
  }

  // Pre i posle

  fotografije(c: Ctx, x: PreIPosleZaDeljenje) {
    const { p, story, kvadrat, u } = this;
    const visina = story ? 320 : kvadrat ? 120 : 196;
    const h = VISINA[u.stil.format];
    c.fillStyle = p.podloga;
    c.fillRect(0, 0, SIRINA, h);
    const pola = (SIRINA - 3) / 2;
    const polovina = (s: SlikaKartice | null, natpis: string, datum: string, px: number) => {
      c.save();
      c.beginPath();
      c.rect(px, 0, pola, visina);
      c.clip();
      if (s) {
        pokrij(c, s, px, 0, pola, visina);
      } else {
        c.fillStyle = rgba(p.tx, 0.06);
        c.fillRect(px, 0, pola, visina);
      }
      c.restore();
      const t = tekst(`${natpis} · ${datum}`, { vel: 9.5, tez: 600, razmak: 1.1, velika: true, boja: "#FFFFFF" }, { fiksno: true });
      const m = t.meri(c, pola);
      const ly = story ? 126 : 52;
      zaobljeno(c, px + 10, ly, m.w + 18, 24, 8);
      c.fillStyle = rgba(INK, 0.72);
      c.fill();
      c.strokeStyle = "rgba(255,255,255,0.16)";
      c.lineWidth = 1;
      c.stroke();
      t.crtaj(c, px + 19, ly + (24 - m.h) / 2, m.w);
    };
    polovina(x.pre, "Pre", x.preDatum, 0);
    polovina(x.posle, "Posle", x.posleDatum, pola + 3);
    const gore = story ? 150 : 70;
    c.fillStyle = vertikalni(c, 0, gore, [[0, rgba(INK, 0.7)], [1, rgba(INK, 0)]]);
    c.fillRect(0, 0, SIRINA, gore);
    c.fillStyle = vertikalni(c, visina - 90, 90, [[0, rgba(p.podloga, 0)], [1, p.podloga]]);
    c.fillRect(0, visina - 90, SIRINA, 90);
  }

  private preIPosle(x: PreIPosleZaDeljenje): (Cvor | null)[] {
    const { u } = this;
    const ime = u.svoj ? null : prikazKlijenta(u.stil, x.klijent);
    const ikone = { ruler: "ruler", drop: "drop", dumbbell: "dumbbell" } as const;
    const kg = x.promenaKg;
    return [
      this.vrh(x.trajanje),
      razmak(),
      this.nadnaslov("arrows", ime ? `${ime} · pre i posle` : "Pre i posle"),
      ...(kg != null && Math.abs(kg) >= 0.1
        ? this.krupno((kg > 0 ? "+" : "-") + kgTekst(Math.abs(kg)), "kg", kg > 0 ? "više na vagi" : "manje na vagi")
        : []),
      x.mere.length ? odmak(red(x.mere.slice(0, 3).map((m) => this.plocica(ikone[m.ikona], m.vrednost, null, m.opis)), { razmak: 8 }), { g: 10 }) : null,
      odmak(this.potpisRed(), { g: 14 }),
    ];
  }

  // Mesec klijenta (karusel)

  private mesecKlijenta(m: MesecKlijentaZaDeljenje, strana: number): (Cvor | null)[] {
    const { p, u, story, poruka } = this;
    const ime = (u.svoj ? null : prikazKlijenta(u.stil, m.klijent)) ?? "";
    const strane = straneMeseca(m);
    const vrsta = strane[strana] ?? 0;
    const brojac = `${strana + 1} / ${strane.length}`;
    const tona = (m.kg / 1000).toFixed(1).replace(".", ",");
    switch (vrsta) {
      case 1:
        return [
          this.vrh(brojac),
          odmak(this.nadnaslov("check", "Dolasci"), { g: 10 }),
          ...this.krupno(String(m.treninga), null, m.zakazano != null ? `od ${m.zakazano} zakazanih treninga` : "treninga u mesecu"),
          odmak(this.kalendar(m), { g: 12 }),
          razmak(),
          this.potpisRed(),
        ];
      case 2: {
        const redovi = m.napredak.slice(0, story ? 5 : 4);
        return [
          this.vrh(brojac),
          odmak(this.nadnaslov("arrowUp", "Napredak"), { g: 10 }),
          odmak(tekst("Šta je jače nego na početku", { vel: 24, tez: 700, razmak: -0.7, boja: p.tx }, { redova: 2, sredina: this.sredina }), { g: 4 }),
          odmak(kolona(redovi.map((n) => this.redNapretka(n)), { razmak: 13, puni: true }), { g: 14 }),
          razmak(),
          this.potpisRed(),
        ];
      }
      case 3:
        return [
          this.vrh(brojac),
          odmak(this.nadnaslov("sigma", "Ukupno u mesecu"), { g: 10 }),
          ...this.krupno(m.kg >= 10000 ? tona : iznos(m.kg), m.kg >= 10000 ? "t" : "kg", "ukupno podignuto"),
          odmak(red([
            this.plocica("clock", String(Math.floor(m.minuta / 60)), `h ${m.minuta % 60} min`, "u sali"),
            m.kcal != null ? this.plocica("flame", iznos(m.kcal), "kcal", "potrošeno") : null,
            this.plocica("trophy", String(m.rekorda), null, "novih rekorda"),
          ], { razmak: 8 }), { g: 10 }),
          razmak(),
          this.potpisRed(),
        ];
      case 4: {
        const nalog = nalogIz(u.potpis);
        const ispod = [u.potpis.ime.trim(), u.potpis.studio.trim()].filter(Boolean).join(" · ");
        return [
          this.vrh(brojac),
          razmak(),
          kolona([
            uSirini(odmak(this.krugLica(2.1), { g: 3, d: 3, l: 3, r: 3 }), 90),
            odmak(tekst("Treniraj sa mnom", { vel: 28, tez: 700, razmak: -0.8, boja: p.tx }, { sredina: true }), { g: 18 }),
            nalog ? odmak(tekst(nalog, { vel: 19, tez: 600, boja: p.akcent }, { sredina: true }), { g: 4 }) : null,
            ispod ? odmak(tekst(ispod, { vel: 13, boja: p.tx2 }, { sredina: true }), { g: 8 }) : null,
            odmak(tekst(poruka || "Piši mi u poruke za prvi termin", { vel: 13.5, tez: 500, boja: p.tx }, { sredina: true }), { g: 14 }),
          ], { sredina: true, puni: true }),
          razmak(),
          kolona([tekst("fitlink.rs", { vel: 10.5, tez: 500, boja: p.tx3 }, { fiksno: true })], { sredina: true, puni: true }),
        ];
      }
      default:
        return [
          this.vrh(brojac),
          odmak(this.nadnaslov("calendar", m.mesec), { g: 10 }),
          razmak(),
          ime ? tekst(ime, { vel: 40, tez: 700, razmak: -1.2, boja: p.tx }, { redova: 1, minSkala: 0.6, sredina: this.sredina }) : null,
          tekst(`${m.mesecMalo.charAt(0).toLocaleUpperCase("sr-Latn")}${m.mesecMalo.slice(1)} u brojkama`, { vel: 20, tez: 600, boja: p.akcent }, { sredina: this.sredina }),
          odmak(red([
            this.plocica("check", String(m.treninga), null, "treninga"),
            this.plocica("trophy", String(m.rekorda), null, "novih rekorda"),
            this.plocica("weight", tona, "t", "podignuto"),
          ], { razmak: 8 }), { g: 14 }),
          odmak(this.potpisRed(), { g: 14 }),
        ];
    }
  }

  private kalendar(m: MesecKlijentaZaDeljenje): Cvor {
    const { p } = this;
    const polja: (number | null)[] = [
      ...Array.from({ length: m.pomak }, () => null),
      ...Array.from({ length: Math.max(m.brojDana, 1) }, (_, i) => i + 1),
    ];
    const redova = Math.ceil(polja.length / 7);
    const zaglavlje = 13.3;
    const visina = zaglavlje + redova * 32;
    return crtez(visina, (c, x, y, w) => {
      const kol = w / 7;
      ["P", "U", "S", "Č", "P", "S", "N"].forEach((d, i) => {
        const t = tekst(d, { vel: 9.5, tez: 600, boja: p.tx3 }, { fiksno: true });
        const q = t.meri(c, kol);
        t.crtaj(c, x + kol * i + (kol - q.w) / 2, y, q.w);
      });
      polja.forEach((dan, i) => {
        if (dan == null) return;
        const cx = x + kol * (i % 7) + kol / 2;
        const cy = y + zaglavlje + 5 + Math.floor(i / 7) * 32 + 13.5;
        const bio = m.dani.includes(dan);
        if (bio) {
          const g = c.createLinearGradient(cx - 13.5, cy - 13.5, cx + 13.5, cy + 13.5);
          g.addColorStop(0, p.preliv[0]);
          g.addColorStop(0.5, p.preliv[1]);
          g.addColorStop(1, p.preliv[2]);
          c.beginPath();
          c.arc(cx, cy, 13.5, 0, Math.PI * 2);
          c.fillStyle = g;
          c.fill();
        }
        if (m.rekordDani.includes(dan)) {
          c.beginPath();
          c.arc(cx, cy, 16.5, 0, Math.PI * 2);
          c.strokeStyle = p.akcent;
          c.lineWidth = 1.5;
          c.stroke();
        }
        const t = tekst(String(dan), { vel: 10.5, tez: bio ? 700 : 500, boja: bio ? p.naPrelivu : p.tx3 }, { fiksno: true });
        const q = t.meri(c, kol);
        t.crtaj(c, cx - q.w / 2, cy - q.h / 2, q.w);
      });
    });
  }

  private redNapretka(n: NapredakVezbe): Cvor {
    const { p } = this;
    const traka = crtez(9, (c, x, y, w, h) => {
      const puna = (w * n.posle) / Math.max(n.posle * 1.12, 0.001);
      const stara = (w * n.pre) / Math.max(n.posle * 1.12, 0.001);
      zaobljeno(c, x, y, w, h, h / 2);
      c.fillStyle = rgba(p.tx, 0.08);
      c.fill();
      const g = c.createLinearGradient(x, y, x + puna, y + h);
      g.addColorStop(0, p.preliv[0]);
      g.addColorStop(0.5, p.preliv[1]);
      g.addColorStop(1, p.preliv[2]);
      zaobljeno(c, x, y, puna, h, h / 2);
      c.fillStyle = g;
      c.fill();
      zaobljeno(c, x, y, stara, h, h / 2);
      c.fillStyle = rgba(p.podloga, 0.5);
      c.fill();
      c.fillStyle = "#FFFFFF";
      c.fillRect(x + stara - 1, y, 2, h);
    });
    return kolona([
      red([
        skuplja(tekst(n.vezba, { vel: 13, tez: 600, boja: p.tx }, { redova: 1, minSkala: 0.75 })),
        razmak(),
        bogatTekst([
          { tekst: `${kgTekst(n.pre)} → `, stil: { vel: 12, boja: p.tx2 } },
          { tekst: `${kgTekst(n.posle)} ${n.jedinica}`, stil: { vel: 14.5, tez: 700, kurziv: true, boja: p.tx } },
        ], { fiksno: true }),
      ], { razmak: 6, osnova: true }),
      traka,
    ], { razmak: 5, puni: true });
  }

  deca(): (Cvor | null)[] {
    const s = this.u.sadrzaj;
    switch (s.vrsta) {
      case "rekord": return this.rekord(s.r);
      case "trening": return this.trening(s.t);
      case "termini": return this.termini(s.t);
      case "mesecTrenera": return this.mesecTrenera(s.m);
      case "preIPosle": return this.preIPosle(s.x);
      case "mesecKlijenta": return this.mesecKlijenta(s.m, this.u.strana);
    }
  }
}

const pozadina = (c: Ctx, u: UlazKartice, p: Paleta, visina: number) => {
  c.fillStyle = p.podloga;
  c.fillRect(0, 0, SIRINA, visina);
  if (u.stil.tema === "foto" && u.foto) {
    pokrij(c, u.foto, 0, 0, SIRINA, visina);
    // Samo rekord drzi tekst u donjoj polovini; kod ostalih je cela slika prigusena.
    const stope: [number, string][] = u.sadrzaj.vrsta === "rekord"
      ? [[0, rgba(INK, 0.62)], [0.2, rgba(INK, 0.1)], [0.38, rgba(INK, 0.34)], [0.58, rgba(INK, 0.9)], [0.8, INK], [1, INK]]
      : [[0, rgba(INK, 0.78)], [0.3, rgba(INK, 0.7)], [0.55, rgba(INK, 0.9)], [0.8, INK], [1, INK]];
    c.fillStyle = vertikalni(c, 0, visina, stope);
    c.fillRect(0, 0, SIRINA, visina);
    return;
  }
  const jacina = p.svetla ? 0.2 : u.stil.tema === "ugalj" ? 0.24 : 0.6;
  const sjaj = (boja: string, a: number, ux: number, uy: number, r: number) => {
    const cx = SIRINA * ux;
    const cy = visina * uy;
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba(boja, a));
    g.addColorStop(1, rgba(boja, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, SIRINA, visina);
  };
  sjaj(p.sjaj, jacina, 0.1, -0.02, 300);
  sjaj(p.sjaj2, jacina * 0.55, 1.06, 0.04, 230);
};

/** Crta jednu sliku na platno velicine SIRINA x visina, puta UVECANJE. */
export const crtajKarticu = (c: Ctx, u: UlazKartice) => {
  const visina = VISINA[u.stil.format];
  const g = new Graditelj(u);
  c.save();
  c.setTransform(UVECANJE, 0, 0, UVECANJE, 0, 0);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = "high";
  pozadina(c, u, g.p, visina);
  if (u.sadrzaj.vrsta === "preIPosle") g.fotografije(c, u.sadrzaj.x);

  // Story ostavlja prazno gore i dole: tu Instagram crta ime naloga i polje za poruku.
  // 88 i 84 su 264 i 252 px na slici 1080 x 1920.
  const gore = g.story ? 88 : 22;
  const dole = g.story ? 84 : 20;
  const sirina = SIRINA - 44;
  const dostupno = visina - gore - dole;
  const telo = kolona(g.deca(), { sredina: g.sredina, puni: true });
  // Najduzi tekstovi (naslov u dva reda, poruka i linija zajedno) ne smeju u bezbednu zonu.
  const potrebno = telo.meri(c, sirina).h;
  if (potrebno > dostupno) {
    // Na vecoj sirini krupna brojka se manje skuplja i raste, pa se meri ponovo.
    let k = dostupno / potrebno;
    while (k > 0.5 && telo.meri(c, sirina / k).h * k > dostupno) k -= 0.01;
    c.translate(22, gore);
    c.scale(k, k);
    telo.crtaj(c, 0, 0, sirina / k, dostupno / k);
  } else {
    telo.crtaj(c, 22, gore, sirina, dostupno);
  }
  c.restore();
};
