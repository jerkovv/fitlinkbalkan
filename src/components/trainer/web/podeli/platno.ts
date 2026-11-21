// Mali raspored za Canvas 2D: kolone, redovi, razmaci i "prvi koji stane", po uzoru na
// VStack, HStack, Spacer i ViewThatFits. Tako se kartice prenose sa iOS red po red.

import { UVECANJE } from "./model";

export type Ctx = CanvasRenderingContext2D;
export type Mera = { w: number; h: number; osnova?: number };

export interface Cvor {
  meri(c: Ctx, maxW: number): Mera;
  crtaj(c: Ctx, x: number, y: number, w: number, h: number): void;
  /** Zauzima preostalu sirinu u redu, odnosno punu sirinu u koloni. */
  puni?: boolean;
  /** Zauzima preostalu visinu u koloni. */
  rasteg?: boolean;
  /** U redu se meri poslednji, da ono sto je fiksno ostane celo. */
  skuplja?: boolean;
}

export const PORODICA = "FitLinkKartica";
const PISMO = `${PORODICA}, Poppins, system-ui, sans-serif`;

// Poppins: uspon 1,05 i pad 0,35 od velicine; SwiftUI red nosi samo to, bez proreda.
const USPON = 1.05;
const VISINA_REDA = 1.4;

export type Bojenje = string | ((c: Ctx, x: number, y: number, w: number, h: number) => CanvasGradient | string);

export type StilTeksta = {
  vel: number;
  tez?: 400 | 500 | 600 | 700;
  kurziv?: boolean;
  boja: Bojenje;
  razmak?: number;
  velika?: boolean;
};

export type OpcijeTeksta = {
  redova?: number;
  minSkala?: number;
  sredina?: boolean;
  fiksno?: boolean;
  senka?: { boja: string; r: number; y: number };
};

const fontOd = (s: StilTeksta, k: number) => `${s.kurziv ? "italic " : ""}${s.tez ?? 400} ${s.vel * k}px ${PISMO}`;
const imaRazmak = (c: Ctx) => "letterSpacing" in c;

const sirinaTeksta = (c: Ctx, t: string, s: StilTeksta, k: number) => {
  c.font = fontOd(s, k);
  const r = (s.razmak ?? 0) * k;
  if (imaRazmak(c)) {
    (c as Ctx & { letterSpacing: string }).letterSpacing = `${r}px`;
    return c.measureText(t).width;
  }
  return c.measureText(t).width + r * [...t].length;
};

type Komad = { t: string; s: StilTeksta; w: number; praznina: boolean };
type Linija = { komadi: Komad[]; w: number; vel: number };

const nova = (): Linija => ({ komadi: [], w: 0, vel: 0 });

const skiniPraznine = (l: Linija) => {
  while (l.komadi.length && l.komadi[l.komadi.length - 1].praznina) {
    l.w -= l.komadi[l.komadi.length - 1].w;
    l.komadi.pop();
  }
};

const prelomi = (c: Ctx, delovi: { tekst: string; stil: StilTeksta }[], maxW: number, k: number) => {
  const linije: Linija[] = [];
  let l = nova();
  const zatvori = () => {
    skiniPraznine(l);
    linije.push(l);
    l = nova();
  };
  const dodaj = (t: string, s: StilTeksta, w: number, praznina: boolean) => {
    l.komadi.push({ t, s, w, praznina });
    l.w += w;
    l.vel = Math.max(l.vel, s.vel * k);
  };
  for (const d of delovi) {
    const tekst = d.stil.velika ? d.tekst.toLocaleUpperCase("sr-Latn") : d.tekst;
    for (const token of tekst.match(/\s+|\S+/g) ?? []) {
      const praznina = /^\s+$/.test(token);
      if (praznina) {
        if (l.komadi.length) dodaj(" ", d.stil, sirinaTeksta(c, " ", d.stil, k), true);
        continue;
      }
      const w = sirinaTeksta(c, token, d.stil, k);
      if (l.komadi.length && l.w + w > maxW + 0.01) zatvori();
      if (w <= maxW + 0.01) {
        dodaj(token, d.stil, w, false);
        continue;
      }
      // Rec duza od reda se lomi po slovima.
      let deo = "";
      for (const slovo of token) {
        if (deo && l.w + sirinaTeksta(c, deo + slovo, d.stil, k) > maxW + 0.01) {
          dodaj(deo, d.stil, sirinaTeksta(c, deo, d.stil, k), false);
          zatvori();
          deo = "";
        }
        deo += slovo;
      }
      if (deo) dodaj(deo, d.stil, sirinaTeksta(c, deo, d.stil, k), false);
    }
  }
  skiniPraznine(l);
  if (l.komadi.length || !linije.length) linije.push(l);
  return linije;
};

class Tekst implements Cvor {
  skuplja?: boolean;
  constructor(
    private delovi: { tekst: string; stil: StilTeksta }[],
    private op: OpcijeTeksta,
  ) {}

  private plan(c: Ctx, maxW: number): Linija[] {
    const granica = this.op.fiksno ? Number.POSITIVE_INFINITY : maxW;
    const min = this.op.minSkala ?? 1;
    const redova = this.op.fiksno ? 1 : this.op.redova;
    for (let k = 1; k >= min - 0.001; k -= 0.025) {
      const linije = prelomi(c, this.delovi, granica, k);
      if ((!redova || linije.length <= redova) && linije.every((l) => l.w <= granica + 0.5)) return linije;
    }
    // Ni na najmanjoj velicini ne staje: poslednji red se skracuje.
    const linije = prelomi(c, this.delovi, granica, min);
    if (!redova || linije.length <= redova) return linije;
    const ostaje = linije.slice(0, redova);
    const zadnja = ostaje[ostaje.length - 1];
    const poslednji = zadnja.komadi[zadnja.komadi.length - 1];
    const k = zadnja.vel / poslednji.s.vel;
    const ostatak = zadnja.w - poslednji.w;
    let t = poslednji.t;
    while (t.length > 1 && ostatak + sirinaTeksta(c, `${t}…`, poslednji.s, k) > granica) t = t.slice(0, -1);
    poslednji.t = `${t}…`;
    poslednji.w = sirinaTeksta(c, poslednji.t, poslednji.s, k);
    zadnja.w = ostatak + poslednji.w;
    return ostaje;
  }

  meri(c: Ctx, maxW: number): Mera {
    const linije = this.plan(c, maxW);
    let h = 0;
    let osnova = 0;
    let w = 0;
    for (const l of linije) {
      osnova = h + l.vel * USPON;
      h += l.vel * VISINA_REDA;
      w = Math.max(w, l.w);
    }
    return { w, h, osnova };
  }

  crtaj(c: Ctx, x: number, y: number, w: number) {
    const linije = this.plan(c, w + 0.5);
    c.save();
    c.textBaseline = "alphabetic";
    c.textAlign = "left";
    if (this.op.senka) {
      c.shadowColor = this.op.senka.boja;
      c.shadowBlur = this.op.senka.r * 2 * UVECANJE;
      c.shadowOffsetY = this.op.senka.y * UVECANJE;
    }
    let vrh = y;
    for (const l of linije) {
      const visina = l.vel * VISINA_REDA;
      const baza = vrh + l.vel * USPON;
      let kx = this.op.sredina ? x + (w - l.w) / 2 : x;
      for (const kom of l.komadi) {
        if (!kom.praznina) {
          const k = l.vel / Math.max(...l.komadi.map((m) => m.s.vel));
          const boja = kom.s.boja;
          c.fillStyle = typeof boja === "function" ? boja(c, kx, vrh, kom.w, visina) : boja;
          c.font = fontOd(kom.s, k);
          const r = (kom.s.razmak ?? 0) * k;
          if (imaRazmak(c)) {
            (c as Ctx & { letterSpacing: string }).letterSpacing = `${r}px`;
            c.fillText(kom.t, kx, baza);
          } else if (!r) {
            c.fillText(kom.t, kx, baza);
          } else {
            // Pregledac bez letterSpacing: slovo po slovo, sa kerningom iz sirine prefiksa.
            const slova = [...kom.t];
            let prefiks = "";
            slova.forEach((slovo, i) => {
              c.fillText(slovo, kx + c.measureText(prefiks).width + r * i, baza);
              prefiks += slovo;
            });
          }
        }
        kx += kom.w;
      }
      vrh += visina;
    }
    c.restore();
  }
}

export const tekst = (t: string, s: StilTeksta, op: OpcijeTeksta = {}) => new Tekst([{ tekst: t, stil: s }], op);
export const bogatTekst = (delovi: { tekst: string; stil: StilTeksta }[], op: OpcijeTeksta = {}) => new Tekst(delovi, op);

/** Ono sto u redu sme da se skupi kad nema mesta. */
export const skuplja = <T extends Cvor>(c: T): T => {
  c.skuplja = true;
  return c;
};

export class Razmak implements Cvor {
  puni = true;
  rasteg = true;
  meri() {
    return { w: 0, h: 0 };
  }
  crtaj() {}
}
export const razmak = () => new Razmak();

type OpcijeKolone = { razmak?: number; sredina?: boolean; puni?: boolean };

export class Kolona implements Cvor {
  puni?: boolean;
  skuplja?: boolean;
  rasteg?: boolean;
  private deca: Cvor[];
  constructor(deca: (Cvor | null | false | undefined)[], private op: OpcijeKolone = {}) {
    this.deca = deca.filter(Boolean) as Cvor[];
    this.puni = op.puni;
  }

  meri(c: Ctx, maxW: number): Mera {
    const r = this.op.razmak ?? 0;
    let w = 0;
    let h = r * Math.max(this.deca.length - 1, 0);
    for (const d of this.deca) {
      const m = d.meri(c, maxW);
      w = Math.max(w, d.puni ? maxW : m.w);
      if (!d.rasteg) h += m.h;
    }
    return { w, h };
  }

  crtaj(c: Ctx, x: number, y: number, w: number, h: number) {
    const r = this.op.razmak ?? 0;
    const mere = this.deca.map((d) => d.meri(c, w));
    const fiksno = mere.reduce((s, m, i) => s + (this.deca[i].rasteg ? 0 : m.h), 0) + r * Math.max(this.deca.length - 1, 0);
    const rastegljivih = this.deca.filter((d) => d.rasteg).length;
    const deo = rastegljivih ? Math.max(0, h - fiksno) / rastegljivih : 0;
    let vy = y;
    this.deca.forEach((d, i) => {
      const m = mere[i];
      const dw = d.puni ? w : m.w;
      const dx = d.puni || !this.op.sredina ? x : x + (w - m.w) / 2;
      const dh = d.rasteg ? deo : m.h;
      d.crtaj(c, dx, vy, dw, dh);
      vy += dh + r;
    });
  }
}
export const kolona = (deca: (Cvor | null | false | undefined)[], op?: OpcijeKolone) => new Kolona(deca, op);

type OpcijeReda = { razmak?: number; osnova?: boolean };

export class Red implements Cvor {
  skuplja?: boolean;
  private deca: Cvor[];
  constructor(deca: (Cvor | null | false | undefined)[], private op: OpcijeReda = {}) {
    this.deca = deca.filter(Boolean) as Cvor[];
  }

  get puni() {
    return this.deca.some((d) => d.puni);
  }

  private raspored(c: Ctx, maxW: number) {
    const r = this.op.razmak ?? 0;
    const mere: Mera[] = new Array(this.deca.length);
    const sirine: number[] = new Array(this.deca.length);
    let zauzeto = r * Math.max(this.deca.length - 1, 0);
    // Prvo fiksno, pa ono sto sme da se skupi, pa ono sto puni ostatak.
    this.deca.forEach((d, i) => {
      if (d.puni || d.skuplja) return;
      const m = d.meri(c, Math.max(0, maxW - zauzeto));
      mere[i] = m;
      sirine[i] = m.w;
      zauzeto += m.w;
    });
    this.deca.forEach((d, i) => {
      if (d.puni || !d.skuplja) return;
      const m = d.meri(c, Math.max(0, maxW - zauzeto));
      mere[i] = m;
      sirine[i] = m.w;
      zauzeto += m.w;
    });
    const punih = this.deca.filter((d) => d.puni).length;
    const deo = punih ? Math.max(0, maxW - zauzeto) / punih : 0;
    this.deca.forEach((d, i) => {
      if (!d.puni) return;
      mere[i] = d.meri(c, deo);
      sirine[i] = deo;
    });
    let uspon = 0;
    let pad = 0;
    let h = 0;
    mere.forEach((m) => {
      const o = m.osnova ?? m.h;
      uspon = Math.max(uspon, o);
      pad = Math.max(pad, m.h - o);
      h = Math.max(h, m.h);
    });
    if (this.op.osnova) h = uspon + pad;
    const ukupno = sirine.reduce((s, x) => s + x, 0) + r * Math.max(this.deca.length - 1, 0);
    return { mere, sirine, uspon, h, ukupno };
  }

  meri(c: Ctx, maxW: number): Mera {
    const p = this.raspored(c, maxW);
    return { w: this.puni ? maxW : p.ukupno, h: p.h, osnova: this.op.osnova ? p.uspon : undefined };
  }

  crtaj(c: Ctx, x: number, y: number, w: number) {
    const r = this.op.razmak ?? 0;
    const p = this.raspored(c, w);
    let vx = x;
    this.deca.forEach((d, i) => {
      const m = p.mere[i];
      const vy = this.op.osnova ? y + p.uspon - (m.osnova ?? m.h) : y + (p.h - m.h) / 2;
      d.crtaj(c, vx, vy, p.sirine[i], m.h);
      vx += p.sirine[i] + r;
    });
  }
}
export const red = (deca: (Cvor | null | false | undefined)[], op?: OpcijeReda) => new Red(deca, op);

class Odmak implements Cvor {
  constructor(
    private d: Cvor,
    private g: number,
    private dole: number,
    private l: number,
    private r: number,
  ) {}
  get puni() {
    return this.d.puni;
  }
  get rasteg() {
    return this.d.rasteg;
  }
  get skuplja() {
    return this.d.skuplja;
  }
  set skuplja(v: boolean | undefined) {
    this.d.skuplja = v;
  }
  meri(c: Ctx, maxW: number): Mera {
    const m = this.d.meri(c, maxW - this.l - this.r);
    return {
      w: m.w + this.l + this.r,
      h: m.h + this.g + this.dole,
      osnova: m.osnova != null ? m.osnova + this.g : undefined,
    };
  }
  crtaj(c: Ctx, x: number, y: number, w: number, h: number) {
    this.d.crtaj(c, x + this.l, y + this.g, w - this.l - this.r, h - this.g - this.dole);
  }
}
/** Padding; negativan kao na iOS, gde krupna brojka ima visok red. */
export const odmak = (d: Cvor, o: { g?: number; d?: number; l?: number; r?: number }) =>
  new Odmak(d, o.g ?? 0, o.d ?? 0, o.l ?? 0, o.r ?? 0);

/** Prvi koji stane u preostalu visinu (ViewThatFits). */
export class PrviKojiStane implements Cvor {
  puni = true;
  rasteg = true;
  constructor(private izbor: Cvor[]) {}
  meri(_c: Ctx, maxW: number) {
    return { w: maxW, h: 0 };
  }
  crtaj(c: Ctx, x: number, y: number, w: number, h: number) {
    for (const d of this.izbor) {
      const m = d.meri(c, w);
      if (m.h <= h + 0.5) {
        d.crtaj(c, x, y, w, m.h);
        return;
      }
    }
  }
}

export const zaobljeno = (c: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + q, y);
  c.arcTo(x + w, y, x + w, y + h, q);
  c.arcTo(x + w, y + h, x, y + h, q);
  c.arcTo(x, y + h, x, y, q);
  c.arcTo(x, y, x + w, y, q);
  c.closePath();
};

type OpcijeOkvira = {
  pH?: number;
  pG?: number;
  pD?: number;
  visina?: number;
  r: number;
  pozadina?: string;
  linija?: string;
  puni?: boolean;
};

class Okvir implements Cvor {
  puni?: boolean;
  skuplja?: boolean;
  constructor(private d: Cvor, private op: OpcijeOkvira) {
    this.puni = op.puni;
  }
  meri(c: Ctx, maxW: number): Mera {
    const pH = this.op.pH ?? 0;
    const m = this.d.meri(c, maxW - pH * 2);
    return {
      w: m.w + pH * 2,
      h: this.op.visina ?? m.h + (this.op.pG ?? 0) + (this.op.pD ?? 0),
    };
  }
  crtaj(c: Ctx, x: number, y: number, w: number, h: number) {
    const pH = this.op.pH ?? 0;
    zaobljeno(c, x, y, w, h, this.op.r);
    if (this.op.pozadina) {
      c.fillStyle = this.op.pozadina;
      c.fill();
    }
    if (this.op.linija) {
      c.strokeStyle = this.op.linija;
      c.lineWidth = 1;
      c.stroke();
    }
    const m = this.d.meri(c, w - pH * 2);
    const dy = this.op.visina != null ? y + (h - m.h) / 2 : y + (this.op.pG ?? 0);
    this.d.crtaj(c, x + pH, dy, w - pH * 2, m.h);
  }
}
export const okvir = (d: Cvor, op: OpcijeOkvira) => new Okvir(d, op);

/** Slobodan crtez zadate visine; bez sirine puni red. */
export const crtez = (h: number, fn: (c: Ctx, x: number, y: number, w: number, h: number) => void, w?: number): Cvor => ({
  puni: w == null,
  meri: (_c, maxW) => ({ w: w ?? maxW, h }),
  crtaj: (c, x, y, sirina, visina) => fn(c, x, y, sirina, visina),
});

/** Zadata sirina (kolona sa danom u redu termina). */
export const uSirini = (d: Cvor, w: number): Cvor => ({
  meri: (c) => ({ w, h: d.meri(c, w).h }),
  crtaj: (c, x, y, _w, h) => d.crtaj(c, x, y, w, h),
});
