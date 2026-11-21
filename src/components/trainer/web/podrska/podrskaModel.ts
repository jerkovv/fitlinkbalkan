import { porukaGreske } from "@/lib/errorMessage";
import type { LunoApi, LunoPoruka } from "./lunoKlijent";

// Stanje ceta sa podrskom, prenos PodrskaModel-a iz iOS aplikacije: serverske poruke
// su istina, a lokalne ostaju na kraju dok ih server ne vrati.

export type Strana = "ja" | "tim" | "sistem";
export type StanjePoruke = "salje" | "palo" | "poslato";

export type Stavka = {
  id: string;
  strana: Strana;
  tekst: string;
  datum: Date | null;
  prilog: boolean;
  stanje: StanjePoruke;
  /** Lokalna poruka: id koji je server dodelio posle slanja. */
  serverId?: string;
};

export type StanjePodrske = {
  stavke: Stavka[];
  pozdrav: string | null;
  /** Prvi odgovor Luno-a je stigao; do tada se ne crta nista izmisljeno. */
  spremno: boolean;
  greska: string | null;
  bezVeze: boolean;
  blokiran: boolean;
};

export type KontekstPodrske = {
  ime: string;
  email: string | null;
  /** Studio, Vežbača, Pretplata; nepoznate vrednosti se ne salju. */
  dodatno: [string, string][];
};

const PODRAZUMEVANI_POZDRAV = "Zdravo! Napiši pitanje i odgovaramo što pre.";
const NEDOSTUPNO = "Podrška trenutno nije dostupna. Pokušaj ponovo.";

/**
 * Luno greska ne sme da se procita kao FitLink greska ("Sesija je istekla" bi
 * trenera poslalo na ponovnu prijavu), pa od prevoda ostaje samo poruka o mrezi.
 */
export function porukaPodrske(e: unknown): string {
  const p = porukaGreske(e);
  return p.startsWith("Nema internet") ? p : NEDOSTUPNO;
}

function stavkaOd(p: LunoPoruka): Stavka | null {
  if (p.kind === "email_card") return null;
  const strana: Strana = p.sender_type === "visitor" ? "ja" : p.sender_type === "system" ? "sistem" : "tim";
  const imena = (p.attachments ?? []).map((a) => a?.name ?? "").filter(Boolean);
  let tekst = (p.body ?? "").trim();
  if (p.kind === "file") {
    if (!tekst) tekst = imena[0] ?? "Fajl";
  } else if (imena.length > 0) {
    tekst = [tekst, ...imena].filter(Boolean).join("\n");
  }
  if (!tekst) return null;
  const d = new Date(p.created_at);
  return {
    id: p.id,
    strana,
    tekst,
    datum: isNaN(d.getTime()) ? null : d,
    prilog: p.kind === "file" || imena.length > 0,
    stanje: "poslato",
  };
}

export class PodrskaModel {
  stanje: StanjePodrske = {
    stavke: [],
    pozdrav: null,
    spremno: false,
    greska: null,
    bezVeze: false,
    blokiran: false,
  };

  private slusaoci = new Set<() => void>();
  private slug = "";
  private razgovor: string | null = null;
  private serverske: Stavka[] = [];
  private lokalne: Stavka[] = [];
  private poslednjiPing = 0;
  private procitanaDo: string | null = null;
  private padovi = 0;
  private otvara = false;
  private osvezava = false;
  private brojac = 0;

  constructor(
    private luno: LunoApi,
    private uid: string,
    private kontekst: () => Promise<KontekstPodrske>,
    private javi: (poruka: string) => void,
  ) {}

  pretplati = (f: () => void) => {
    this.slusaoci.add(f);
    return () => {
      this.slusaoci.delete(f);
    };
  };

  snimak = () => this.stanje;

  private promeni(izmena: Partial<StanjePodrske>) {
    this.stanje = { ...this.stanje, ...izmena };
    this.slusaoci.forEach((f) => f());
  }

  async otvori() {
    if (this.otvara) return;
    this.otvara = true;
    this.promeni({ greska: null });
    try {
      const k = await this.kontekst();
      // Isti podaci koje salje iOS, sa oznakom veba umesto modela telefona.
      const meta: Record<string, string> = {
        Uloga: "Trener",
        "FitLink ID": this.uid,
        "Uređaj": "Računar",
        Verzija: "Web",
      };
      for (const [kljuc, vrednost] of k.dodatno) if (vrednost) meta[kljuc] = vrednost;
      const startMeta = { ...meta, device: "Računar, FitLink web", source: "FitLink web", language: "sr" };

      const sajt = await this.luno.sajt();
      this.slug = sajt.slug;
      const st = await this.luno.start(this.slug, startMeta);
      this.razgovor = st.razgovor;
      this.poslednjiPing = Date.now();
      this.promeni({ blokiran: st.blokiran });
      try {
        const ime = k.ime.trim();
        await this.luno.predstavi(this.slug, ime ? `${ime} · Trener` : null, k.email, meta);
      } catch (e) {
        // Podaci o nalogu su za tim, ne za korisnika: cet radi i bez njih.
        console.error("[podrska] widget_identify nije prosao", e);
      }
      if (this.razgovor) await this.ucitajPoruke(this.razgovor);
      // Pozdrav samo pre prve poruke; posle ostaje dok je ekran otvoren.
      this.promeni({
        pozdrav: this.serverske.length === 0 ? sajt.pozdrav ?? PODRAZUMEVANI_POZDRAV : this.stanje.pozdrav,
        spremno: true,
      });
    } catch (e) {
      if (!this.stanje.spremno) {
        const poruka = porukaPodrske(e);
        this.promeni({ greska: poruka });
        this.javi(poruka);
      } else {
        console.error("[podrska] ponovno otvaranje nije proslo", e);
      }
    } finally {
      this.otvara = false;
    }
  }

  /** Na 4 s dok je kartica vidljiva: nove poruke, procitano i znak prisustva na minut. */
  async osvezi() {
    if (!this.stanje.spremno || this.osvezava) return;
    this.osvezava = true;
    try {
      if (this.razgovor) await this.ucitajPoruke(this.razgovor);
      if (Date.now() - this.poslednjiPing >= 60_000) {
        this.poslednjiPing = Date.now();
        await this.luno.ping(this.slug);
      }
      this.padovi = 0;
      if (this.stanje.bezVeze) this.promeni({ bezVeze: false });
    } catch (e) {
      this.padovi += 1;
      if (this.padovi >= 3 && !this.stanje.bezVeze) this.promeni({ bezVeze: true });
      console.error("[podrska] osvezavanje nije proslo", e);
    } finally {
      this.osvezava = false;
    }
  }

  private async ucitajPoruke(r: string) {
    const p = await this.luno.poruke(r);
    this.serverske = p.map(stavkaOd).filter((s): s is Stavka => s !== null);
    this.spoji();
    // Poruke tima koje su stvarno na ekranu su procitane; skrivena kartica ih ne oznacava.
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const zadnja = [...p]
      .reverse()
      .find((m) => (m.sender_type === "agent" || m.sender_type === "bot") && !m.read_at);
    if (zadnja && zadnja.id !== this.procitanaDo) {
      await this.luno.procitano(this.slug);
      this.procitanaDo = zadnja.id;
    }
  }

  async posalji(tekst: string) {
    const s: Stavka = {
      id: `tmp-${Date.now()}-${++this.brojac}`,
      strana: "ja",
      tekst,
      datum: new Date(),
      prilog: false,
      stanje: "salje",
    };
    this.lokalne.push(s);
    this.spoji();
    await this.salji(s.id);
  }

  async ponovi(id: string) {
    const l = this.lokalne.find((x) => x.id === id);
    if (!l || l.stanje !== "palo") return;
    this.postavi(id, { stanje: "salje" });
    await this.salji(id);
  }

  private async salji(id: string) {
    const tekst = this.lokalne.find((x) => x.id === id)?.tekst;
    if (tekst === undefined) return;
    try {
      if (!this.stanje.spremno) await this.otvori();
      if (!this.stanje.spremno) throw new Error("Podrška nije otvorena");
      const r = await this.luno.posalji(this.slug, tekst);
      this.postavi(id, { stanje: "poslato", serverId: r.poruka });
      this.razgovor = r.razgovor;
      await this.ucitajPoruke(r.razgovor);
    } catch (e) {
      // Poruka je mozda vec poslata, a palo je samo citanje: tada ostaje poslata.
      if (this.lokalne.find((x) => x.id === id)?.serverId === undefined) {
        this.postavi(id, { stanje: "palo" });
        const opis = `${(e as { message?: string })?.message ?? ""} ${(e as { details?: string })?.details ?? ""}`;
        if (opis.includes("blocked")) this.promeni({ blokiran: true });
        else this.javi(porukaPodrske(e));
      } else {
        console.error("[podrska] citanje posle slanja nije proslo", e);
      }
    }
  }

  private postavi(id: string, izmena: Partial<Stavka>) {
    this.lokalne = this.lokalne.map((x) => (x.id === id ? { ...x, ...izmena } : x));
    this.spoji();
  }

  private spoji() {
    const ids = new Set(this.serverske.map((s) => s.id));
    this.lokalne = this.lokalne.filter((l) => !(l.serverId && ids.has(l.serverId)));
    const uzete = new Set(this.lokalne.map((l) => l.serverId).filter(Boolean) as string[]);
    const vidljive = this.lokalne.filter((l) => {
      // Poruka koja se jos salje a server je vec vratio: ne crta se dvaput.
      if (l.stanje !== "salje" || !l.datum) return true;
      const t = l.datum.getTime();
      const m = this.serverske.find(
        (s) =>
          s.strana === "ja" &&
          s.tekst === l.tekst &&
          !uzete.has(s.id) &&
          Math.abs((s.datum?.getTime() ?? t) - t) < 120_000,
      );
      if (m) {
        uzete.add(m.id);
        return false;
      }
      return true;
    });
    this.promeni({ stavke: [...this.serverske, ...vidljive] });
  }
}
