import { Capacitor } from "@capacitor/core";
import {
  createClient,
  isAuthRetryableFetchError,
  processLock,
  type SupabaseClient,
  type SupportedStorage,
} from "@supabase/supabase-js";

// Luno Chat, nas cet za podrsku. Radi kao LunoKlijent.swift u iOS aplikaciji:
// anonimna prijava na Luno projekat, pa samo javne widget_* funkcije i citanje
// sopstvenog razgovora (RLS). Nema veze sa FitLink bazom: drugi server, drugi
// kljuc, druga sesija.
//
// FitLink sesija se ne sme ni procitati ni pregaziti. Zato ovaj klijent ima svoj
// storageKey po FitLink nalogu, skladiste koje odbija svaki drugi kljuc i ne cita
// tokene iz adrese (detectSessionInUrl), jer bi inace pokupio FitLink prijavu.

/** Javne vrednosti iz apps/widget/build.mjs: anon kljuc je namenjen pregledacu, pristup cuva RLS. */
const LUNO_ADRESA = "https://yljhtjnilptvnhcwrihq.supabase.co";
const LUNO_ANON_KLJUC =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsamh0am5pbHB0dm5oY3dyaWhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NzQ1OTMsImV4cCI6MjEwNzA1MDU5M30.n4k74vmRhrlqeX88NRVbt7v5y0S8bf5OlJ-buR8Pi3M";

/** Sajt u Luno-u za aplikaciju, pa sajt sa fitlink.rs ako prvog nema. */
const SAJTOVI = ["fitlink-app", "fitlink"];

export const PREFIKS_SESIJE = "fitlink-luno-podrska.";

export type LunoSajt = { slug: string; pozdrav: string | null; imeTima: string | null };
export type LunoStart = { razgovor: string | null; blokiran: boolean };
export type LunoPoruka = {
  id: string;
  sender_type: string;
  kind: string;
  body: string | null;
  attachments: { name?: string | null }[] | null;
  read_at: string | null;
  created_at: string;
};

/** Ono sto model podrske trazi od Luno-a. */
export type LunoApi = {
  sajt(): Promise<LunoSajt>;
  start(slug: string, meta: Record<string, string>): Promise<LunoStart>;
  predstavi(slug: string, ime: string | null, email: string | null, meta: Record<string, string>): Promise<void>;
  posalji(slug: string, tekst: string): Promise<{ razgovor: string; poruka: string }>;
  poruke(razgovor: string): Promise<LunoPoruka[]>;
  procitano(slug: string): Promise<void>;
  ping(slug: string): Promise<void>;
};

function skladisteSesije(): SupportedStorage {
  const memorija = new Map<string, string>();
  const dozvoljen = (k: string) => k.startsWith(PREFIKS_SESIJE);
  return {
    getItem(k) {
      if (!dozvoljen(k)) return null;
      try {
        return localStorage.getItem(k) ?? memorija.get(k) ?? null;
      } catch {
        return memorija.get(k) ?? null;
      }
    },
    setItem(k, v) {
      if (!dozvoljen(k)) return;
      try {
        localStorage.setItem(k, v);
        memorija.delete(k);
      } catch {
        memorija.set(k, v);
      }
    },
    removeItem(k) {
      if (!dozvoljen(k)) return;
      memorija.delete(k);
      try {
        localStorage.removeItem(k);
      } catch {
        // Skladiste je blokirano: memorija je vec ociscena.
      }
    },
  };
}

class LunoKlijent implements LunoApi {
  private prijavaUToku: Promise<void> | null = null;

  constructor(private sb: SupabaseClient) {}

  async sajt(): Promise<LunoSajt> {
    type Red = {
      greeting?: string | null;
      settings?: { greeting?: string | null; agent_name?: string | null } | null;
    };
    for (const slug of SAJTOVI) {
      const { data, error } = await this.sb.rpc("widget_site", { p_slug: slug });
      if (error) throw error;
      const r = ((data ?? []) as Red[])[0];
      if (!r) continue;
      const pozdrav = [r.greeting, r.settings?.greeting].map((x) => x?.trim()).find((x) => !!x) ?? null;
      return { slug, pozdrav, imeTima: r.settings?.agent_name?.trim() || null };
    }
    throw new Error(`Nema Luno sajta: ${SAJTOVI.join(", ")}`);
  }

  async start(slug: string, meta: Record<string, string>): Promise<LunoStart> {
    const o = await this.rpc<{ conversation_id: string | null; banned?: boolean }>("widget_start", {
      p_slug: slug,
      p_meta: meta,
    });
    return { razgovor: o.conversation_id ?? null, blokiran: !!o.banned };
  }

  async predstavi(slug: string, ime: string | null, email: string | null, meta: Record<string, string>) {
    const podaci: Record<string, unknown> = { meta };
    if (ime) podaci.name = ime.slice(0, 120);
    if (email?.includes("@")) podaci.email = email.slice(0, 200);
    await this.rpc("widget_identify", { p_slug: slug, p_data: podaci });
  }

  async posalji(slug: string, tekst: string) {
    const o = await this.rpc<{ conversation_id: string; message_id: string }>("widget_send", {
      p_slug: slug,
      p_body: tekst,
    });
    return { razgovor: o.conversation_id, poruka: o.message_id };
  }

  /** Poslednjih 200 poruka razgovora, od najstarije. */
  async poruke(razgovor: string): Promise<LunoPoruka[]> {
    await this.prijava();
    const upit = () =>
      this.sb
        .from("messages")
        .select("id,sender_type,kind,body,attachments,read_at,created_at")
        .eq("conversation_id", razgovor)
        .order("created_at", { ascending: false })
        .limit(200);
    let r = await upit();
    if (r.status === 401) {
      await this.obnovi();
      r = await upit();
    }
    if (r.error) throw r.error;
    return ((r.data ?? []) as LunoPoruka[]).reverse();
  }

  async procitano(slug: string) {
    await this.rpc("widget_mark_read", { p_slug: slug });
  }

  async ping(slug: string) {
    await this.rpc("widget_ping", { p_slug: slug });
  }

  private async rpc<T = unknown>(ime: string, parametri: Record<string, unknown>): Promise<T> {
    await this.prijava();
    let r = await this.sb.rpc(ime, parametri);
    if (r.status === 401) {
      await this.obnovi();
      r = await this.sb.rpc(ime, parametri);
    }
    if (r.error) throw r.error;
    return r.data as T;
  }

  /** Vazeca Luno sesija. Pad mreze ne pravi novog posetioca, da razgovor ne ostane iza njega. */
  private prijava(): Promise<void> {
    if (!this.prijavaUToku) {
      this.prijavaUToku = (async () => {
        const { data, error } = await this.sb.auth.getSession();
        if (data.session) return;
        if (error && isAuthRetryableFetchError(error)) throw error;
        const res = await this.sb.auth.signInAnonymously();
        if (res.error) throw res.error;
      })().finally(() => {
        this.prijavaUToku = null;
      });
    }
    return this.prijavaUToku;
  }

  /** Posle 401: osvezavanje, a ako je Luno opozvao token, nov anoniman posetilac. */
  private async obnovi() {
    const { error } = await this.sb.auth.refreshSession();
    if (!error) return;
    if (isAuthRetryableFetchError(error)) throw error;
    const res = await this.sb.auth.signInAnonymously();
    if (res.error) throw res.error;
  }
}

const klijenti = new Map<string, LunoKlijent>();

/** Jedan Luno klijent po FitLink nalogu, sa sopstvenom sesijom. */
export function lunoZaNalog(uid: string): LunoApi {
  let k = klijenti.get(uid);
  if (!k) {
    k = new LunoKlijent(
      createClient(LUNO_ADRESA, LUNO_ANON_KLJUC, {
        auth: {
          storageKey: `${PREFIKS_SESIJE}${uid}`,
          storage: skladisteSesije(),
          persistSession: true,
          // Token se osvezava pri pozivu; bez tajmera koji radi i kad cet nije otvoren.
          autoRefreshToken: false,
          detectSessionInUrl: false,
          ...(Capacitor.isNativePlatform() ? { lock: processLock } : {}),
        },
      }),
    );
    klijenti.set(uid, k);
  }
  return k;
}
