// Podaci za kartice: iste tabele, RPC-ovi i filteri kao na iOS (UcitajTermine,
// UcitajMesecTrenera, UcitajKlijenta, TrenerNotifikacije, DetaljModel). Samo citanje.

import { supabase } from "@/lib/supabase";
import {
  kgTekst,
  oblik,
  razlikaMere,
  type MeraPromene,
  type MesecKlijentaZaDeljenje,
  type MesecTreneraZaDeljenje,
  type NapredakVezbe,
  type PotpisKartice,
  type PreIPosleZaDeljenje,
  type RekordMeseca,
  type RekordZaDeljenje,
  type SadrzajKartice,
  type SlikaKartice,
  type TerminiZaDeljenje,
  type TreningZaDeljenje,
  type VezbaTreninga,
} from "./model";
import { slikaSaAdrese } from "./resursi";

const db = supabase as any;

/** Kartica, ili recenica zasto je nema. "Nema podataka" nije greska. */
export type Ishod = { ok: true; sadrzaj: SadrzajKartice } | { ok: false; poruka: string };
/** Sporedan deo nije stigao, a kartica i dalje moze da se napravi. */
export type Upozori = (e: unknown) => void;

// Beograd: dani i meseci se seku kao na serveru

const delovi = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Belgrade",
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

const beograd = (d: Date) => {
  const p = Object.fromEntries(delovi.formatToParts(d).map((x) => [x.type, Number(x.value)]));
  return { g: p.year, m: p.month, d: p.day, h: p.hour, min: p.minute, s: p.second };
};

const pomakZone = (t: number) => {
  const b = beograd(new Date(t));
  return Date.UTC(b.g, b.m - 1, b.d, b.h, b.min, b.s) - Math.floor(t / 1000) * 1000;
};

/** Ponoc tog dana u Beogradu; dan moze i da prelazi mesec (d + 1). */
const ponoc = (g: number, m: number, d: number) => {
  const utc = Date.UTC(g, m - 1, d);
  const prvi = utc - pomakZone(utc);
  return new Date(utc - pomakZone(prvi));
};

const danUTC = (g: number, m: number, d: number) => new Date(Date.UTC(g, m - 1, d));
const uDatum = (x: Date) => x.toISOString().slice(0, 10);

const DANI = ["Ned", "Pon", "Uto", "Sre", "Čet", "Pet", "Sub"];
const MESECI = ["januar", "februar", "mart", "april", "maj", "jun", "jul", "avgust", "septembar", "oktobar", "novembar", "decembar"];
const MESECI_KRATKO = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "avg", "sep", "okt", "nov", "dec"];

const prvoVeliko = (s: string) => s.charAt(0).toLocaleUpperCase("sr-Latn") + s.slice(1);

const prosliMesec = (sada = new Date()) => {
  const b = beograd(sada);
  let godina = b.g;
  let broj = b.m - 1;
  if (broj < 1) {
    broj = 12;
    godina -= 1;
  }
  const pocetak = ponoc(godina, broj, 1);
  const kraj = ponoc(godina, broj + 1, 1);
  const brojDana = new Date(Date.UTC(godina, broj, 0)).getUTCDate();
  const pomak = (danUTC(godina, broj, 1).getUTCDay() + 6) % 7;
  const malo = MESECI[broj - 1];
  return { pocetak, kraj, godina, broj, brojDana, pomak, malo, naslov: `${prvoVeliko(malo)} ${godina}` };
};

/** "2026-08-14" kao ponoc tog dana u Beogradu. */
const danIz = (s: string | null | undefined) => {
  if (!s) return null;
  const d = s.slice(0, 10).split("-").map(Number);
  if (d.length !== 3 || d.some((x) => !Number.isFinite(x))) return null;
  return ponoc(d[0], d[1], d[2]);
};

const mesecGodina = (d: Date) => {
  const b = beograd(d);
  return `${MESECI_KRATKO[b.m - 1]} ${b.g}`;
};

/** "12 nedelja", a preko 16 nedelja "5 meseci". */
const trajanje = (od: Date, doKad: Date) => {
  const a = beograd(od);
  const b = beograd(doKad);
  const dana = Math.round((Date.UTC(b.g, b.m - 1, b.d) - Date.UTC(a.g, a.m - 1, a.d)) / 86400000);
  if (dana <= 0) return null;
  if (dana < 7) return `${dana} ${oblik(dana, "dan", "dana", "dana")}`;
  const nedelja = Math.round(dana / 7);
  if (nedelja <= 16) return `${nedelja} ${oblik(nedelja, "nedelja", "nedelje", "nedelja")}`;
  const meseci = Math.round(dana / 30.44);
  return `${meseci} ${oblik(meseci, "mesec", "meseca", "meseci")}`;
};

// Upiti

const grupe = <T,>(niz: T[], n: number) => {
  const izlaz: T[][] = [];
  for (let i = 0; i < niz.length; i += n) izlaz.push(niz.slice(i, i + n));
  return izlaz;
};

/**
 * Svi redovi upita, stranu po stranu do prazne strane: server sam odseca dugacak odgovor
 * (Max rows), a odsecen spisak bi dao manje brojke. Upit mora da ima stalan redosled.
 */
const sviRedovi = async <T,>(upit: () => any, najviseStrana = 200): Promise<T[]> => {
  const svi: T[] = [];
  for (let i = 0; i < najviseStrana; i++) {
    const { data, error } = await upit().range(svi.length, svi.length + 999);
    if (error) throw error;
    if (!data?.length) return svi;
    svi.push(...data);
  }
  throw new Error("Previše podataka za karticu. Pokušaj ponovo.");
};

const imeIzProfila = async (uid: string) => {
  const { data, error } = await db.from("profiles").select("full_name").eq("id", uid).maybeSingle();
  if (error) throw error;
  const ime = (data?.full_name ?? "").trim();
  return ime || null;
};

// Slobodni termini

type Slot = {
  start_time: string;
  capacity: number | null;
  booked_count: number | null;
  is_canceled: boolean | null;
};

const minutSlota = (s: Slot) => {
  const d = s.start_time.split(":").map(Number);
  return d.length >= 2 ? d[0] * 60 + d[1] : 0;
};

/** Narednih 7 dana od danas, ili od izabranog dana iz kalendara kad nije u proslosti. */
export const ucitajTermine = async (uid: string, datum?: string | null): Promise<Ishod> => {
  const sada = new Date();
  const b = beograd(sada);
  const danas = uDatum(danUTC(b.g, b.m, b.d));
  const start = datum && datum > danas ? datum : danas;
  const [g, m, d] = start.split("-").map(Number);
  const dani = Array.from({ length: 7 }, (_, i) => {
    const x = danUTC(g, m, d + i);
    const mesec = x.getUTCMonth() + 1;
    const dan = x.getUTCDate();
    const zaServer = uDatum(x);
    return {
      zaServer,
      naziv: DANI[x.getUTCDay()],
      dan,
      mesec,
      danas: zaServer === danas,
      datum: `${dan}. ${MESECI_KRATKO[mesec - 1]}`,
    };
  });
  // Ako ijedan dan ne stigne, pada sve: pola nedelje bi izgledalo kao da ostalih termina nema.
  const poDanu = await Promise.all(
    dani.map(async (x) => {
      const { data, error } = await db.rpc("get_day_slots", { p_trainer_id: uid, p_date: x.zaServer });
      if (error) throw error;
      return (data ?? []) as Slot[];
    }),
  );
  const sadMinut = b.h * 60 + b.min;
  const redovi: { dan: (typeof dani)[number]; vremena: string[] }[] = [];
  dani.forEach((dan, i) => {
    // Otkazan termin i termin koji je danas vec poceo se ne nude ni ne broje.
    const vazeci = poDanu[i].filter((s) => !s.is_canceled && (!dan.danas || minutSlota(s) > sadMinut));
    if (!vazeci.length) return;
    const vremena: string[] = [];
    vazeci
      .filter((s) => Math.max(Math.max(s.capacity ?? 1, 1) - (s.booked_count ?? 0), 0) > 0)
      .sort((x, y) => minutSlota(x) - minutSlota(y))
      .forEach((s) => {
        const v = s.start_time.slice(0, 5);
        if (!vremena.includes(v)) vremena.push(v);
      });
    redovi.push({ dan, vremena: vremena.slice(0, 4) });
  });
  if (!redovi.some((r) => r.vremena.length)) {
    return { ok: false, poruka: "Nema slobodnih termina u narednih 7 dana." };
  }
  const prvi = redovi[0].dan;
  const zadnji = redovi[redovi.length - 1].dan;
  const opseg = prvi.zaServer === zadnji.zaServer
    ? prvi.datum
    : prvi.mesec === zadnji.mesec
      ? `${prvi.dan}. do ${zadnji.datum}`
      : `${prvi.datum} do ${zadnji.datum}`;
  const t: TerminiZaDeljenje = {
    naslov: "Ima slobodnih mesta",
    opseg,
    dani: redovi.map((r) => ({ naziv: r.dan.naziv, datum: r.dan.datum, vremena: r.vremena })),
  };
  return { ok: true, sadrzaj: { vrsta: "termini", t } };
};

// Trenerov mesec

type RedRekorda = {
  athlete_id: string | null;
  meta: { exercise_name?: unknown; weight_kg?: unknown; reps?: unknown; kg_po_ruci?: unknown } | null;
};

export const ucitajMesecTrenera = async (uid: string): Promise<Ishod> => {
  const nema: Ishod = { ok: false, poruka: "U prošlom mesecu nema završenih treninga." };
  const o = prosliMesec();
  const vezbaci = (await sviRedovi<{ id: string }>(() =>
    db.from("athletes").select("id").eq("trainer_id", uid).order("id"),
  )).map((r) => r.id);
  if (!vezbaci.length) return nema;

  const od = o.pocetak.toISOString();
  const kraj = o.kraj.toISOString();
  const komadi = grupe(vezbaci, 100);
  // Ako ijedan upit ne stigne, pada sve: kartica sa pola brojki bi lagala.
  const [treninziDelovi, rekordi, profiliDelovi] = await Promise.all([
    Promise.all(komadi.map((k) => sviRedovi<{ athlete_id: string }>(() =>
      db.from("workout_session_logs").select("athlete_id").in("athlete_id", k)
        .gte("completed_at", od).lt("completed_at", kraj).order("id"),
    ))),
    sviRedovi<RedRekorda>(() =>
      db.from("notifications").select("athlete_id,meta").eq("recipient_id", uid).eq("kind", "pr_set")
        .gte("created_at", od).lt("created_at", kraj).order("id"),
    ),
    Promise.all(komadi.map(async (k) => {
      const { data, error } = await db.from("profiles").select("id,full_name").in("id", k);
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null }[];
    })),
  ]);
  const treninzi = treninziDelovi.flat();
  if (!treninzi.length) return nema;
  const imena = new Map(profiliDelovi.flat().map((p) => [p.id, p.full_name ?? ""]));

  // Najveca kilaza ide prva; kod iste kilaze vise ponavljanja.
  const poKilazi = rekordi.flatMap((r) => {
    const kg = typeof r.meta?.weight_kg === "number" ? r.meta.weight_kg : 0;
    const vezba = typeof r.meta?.exercise_name === "string" ? r.meta.exercise_name.trim() : "";
    const ime = r.athlete_id ? (imena.get(r.athlete_id) ?? "").trim().split(/\s+/)[0] : "";
    if (!r.athlete_id || kg <= 0 || !vezba || !ime) return [];
    return [{
      id: r.athlete_id,
      ime,
      vezba,
      kg,
      pon: typeof r.meta?.reps === "number" ? r.meta.reps : 0,
      poRuci: r.meta?.kg_po_ruci === true,
    }];
  }).sort((a, b) => (a.kg !== b.kg ? b.kg - a.kg : b.pon - a.pon));

  // Jedan rekord po vezbacu, da tri reda ne budu ista osoba.
  const najbolji: RekordMeseca[] = [];
  const uzeti = new Set<string>();
  for (const r of poKilazi) {
    if (najbolji.length >= 3 || uzeti.has(r.id)) continue;
    uzeti.add(r.id);
    najbolji.push({ ime: r.ime, vezba: r.vezba, vrednost: `${r.poRuci ? "2× " : ""}${kgTekst(r.kg)} kg` });
  }

  const m: MesecTreneraZaDeljenje = {
    mesec: o.naslov,
    naslov: `Moj ${o.malo} u sali`,
    treninga: treninzi.length,
    klijenata: new Set(treninzi.map((t) => t.athlete_id)).size,
    // Nula ovde ne znaci "bez rekorda": obavestenja mogu biti iskljucena ili obrisana.
    rekorda: rekordi.length ? rekordi.length : null,
    // Dolazak na termin se nigde ne belezi, pa procenat ne bi bio tacan.
    dolaznost: null,
    rekordi: najbolji,
  };
  return { ok: true, sadrzaj: { vrsta: "mesecTrenera", m } };
};

// Pre i posle

type MeraRed = {
  recorded_on: string | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  waist_cm: number | null;
};

/**
 * Razlika jedne mere izmedju dve fotografije, na jednu decimalu. Svaka fotografija uzima
 * sebi najblize merenje, ali samo ono udaljeno manje od pola perioda.
 */
const promena = (merenja: MeraRed[], polje: keyof MeraRed, od: Date, doKad: Date) => {
  const tacke = merenja.flatMap((m) => {
    const dan = danIz(m.recorded_on);
    const v = m[polje];
    return dan && typeof v === "number" ? [{ dan: dan.getTime(), v }] : [];
  });
  const pola = (doKad.getTime() - od.getTime()) / 2;
  const uz = (kraj: number) => {
    let naj: { dan: number; v: number } | null = null;
    for (const t of tacke) {
      if (Math.abs(t.dan - kraj) >= pola) continue;
      if (!naj || Math.abs(t.dan - kraj) < Math.abs(naj.dan - kraj)) naj = t;
    }
    return naj?.v ?? null;
  };
  const pre = uz(od.getTime());
  const posle = uz(doKad.getTime());
  if (pre == null || posle == null) return null;
  return Math.round((posle - pre) * 10) / 10;
};

export const ucitajPreIPosle = async (vezbacId: string): Promise<Ishod> => {
  const nema: Ishod = { ok: false, poruka: "Za pre i posle trebaju bar dve fotografije iz različitih dana." };
  // Trener dobija samo fotografije koje je vezbac podelio sa njim.
  const foto = (rast: boolean) =>
    db.from("progress_photos").select("storage_path,taken_on").eq("athlete_id", vezbacId)
      .not("taken_on", "is", null).eq("shared_with_trainer", true)
      .order("taken_on", { ascending: rast }).limit(1);
  const [pPrva, pZadnja] = await Promise.all([foto(true), foto(false)]);
  if (pPrva.error) throw pPrva.error;
  if (pZadnja.error) throw pZadnja.error;
  const prva = pPrva.data?.[0];
  const zadnja = pZadnja.data?.[0];
  const danPre = danIz(prva?.taken_on);
  const danPosle = danIz(zadnja?.taken_on);
  if (!prva || !zadnja || !danPre || !danPosle || danPre >= danPosle) return nema;

  const { data: adrese, error: greskaAdresa } = await supabase.storage
    .from("progress-photos")
    .createSignedUrls([prva.storage_path, zadnja.storage_path], 600);
  if (greskaAdresa) throw greskaAdresa;
  const adresa = (p: string) => adrese?.find((a) => a.path === p && !a.error)?.signedUrl;
  const adresaPre = adresa(prva.storage_path);
  const adresaPosle = adresa(zadnja.storage_path);
  if (!adresaPre || !adresaPosle) throw new Error("Fotografija napretka nije dostupna. Pokušaj ponovo.");

  const b = beograd(danPosle);
  const odKad = danPre.toISOString();
  const doKad = ponoc(b.g, b.m, b.d + 1).toISOString();
  const [slikaPre, slikaPosle, mereOdg, brojOdg, ime] = await Promise.all([
    slikaSaAdrese(adresaPre, 1600, "Fotografija pre"),
    slikaSaAdrese(adresaPosle, 1600, "Fotografija posle"),
    db.from("body_metrics").select("recorded_on,weight_kg,body_fat_pct,waist_cm").eq("athlete_id", vezbacId)
      .order("recorded_on", { ascending: true }).order("created_at", { ascending: true }).limit(500),
    db.from("workout_session_logs").select("id", { count: "exact", head: true }).eq("athlete_id", vezbacId)
      .gte("completed_at", odKad).lt("completed_at", doKad),
    imeIzProfila(vezbacId),
  ]);
  if (mereOdg.error) throw mereOdg.error;
  if (brojOdg.error) throw brojOdg.error;
  const merenja = (mereOdg.data ?? []) as MeraRed[];
  const treninga = brojOdg.count ?? 0;

  const mere: MeraPromene[] = [];
  const struk = promena(merenja, "waist_cm", danPre, danPosle);
  if (struk != null && struk !== 0) mere.push({ opis: "struk", vrednost: `${razlikaMere(struk)} cm`, ikona: "ruler" });
  const masti = promena(merenja, "body_fat_pct", danPre, danPosle);
  if (masti != null && masti !== 0) mere.push({ opis: "masti", vrednost: `${razlikaMere(masti)} %`, ikona: "drop" });
  if (treninga > 0) mere.push({ opis: oblik(treninga, "trening", "treninga", "treninga"), vrednost: String(treninga), ikona: "dumbbell" });

  const x: PreIPosleZaDeljenje = {
    klijent: ime,
    pre: slikaPre,
    posle: slikaPosle,
    preDatum: mesecGodina(danPre),
    posleDatum: mesecGodina(danPosle),
    promenaKg: promena(merenja, "weight_kg", danPre, danPosle),
    trajanje: trajanje(danPre, danPosle),
    mere,
  };
  return { ok: true, sadrzaj: { vrsta: "preIPosle", x } };
};

// Mesec klijenta

type Pomaci = {
  napredak: NapredakVezbe[];
  najPre: Map<string, number>;
  oboreno: Map<string, number>;
};
const prazniPomaci = (): Pomaci => ({ napredak: [], najPre: new Map(), oboreno: new Map() });

type SerijaRed = {
  weight_kg: number | null;
  session_log_id: string | null;
  assigned_program_exercises: { exercise_id: string | null; exercises: { name: string | null } | null } | null;
};

/** Uradjene serije sa kilazom; set_logs.exercise_id pokazuje na red plana. */
const serije = async (treninzi: string[]) => {
  const delovi = await Promise.all(grupe(treninzi, 40).map((deo) =>
    sviRedovi<SerijaRed>(() =>
      db.from("set_logs")
        .select("weight_kg,session_log_id,assigned_program_exercises(exercise_id,exercises(name))")
        .in("session_log_id", deo).eq("done", true).gt("weight_kg", 0).gt("reps", 0).order("id"),
    ),
  ));
  return delovi.flat();
};

/**
 * Najveca kilaza po vezbi u mesecu naspram najvece pre tog meseca. Kad se ne moze pouzdano
 * izracunati vraca null, i kartica ostaje bez slike "Napredak".
 */
const pomaciMeseca = async (uid: string, pocetak: Date, mereni: Map<string, number>, upozori: Upozori): Promise<Pomaci | null> => {
  if (!mereni.size) return prazniPomaci();
  try {
    const raniji = (await sviRedovi<{ id: string }>(() =>
      db.from("workout_session_logs").select("id").eq("athlete_id", uid)
        .lt("completed_at", pocetak.toISOString()).order("id"),
    )).map((r) => r.id);
    // Prvi mesec u aplikaciji: nema sta da se obori.
    if (!raniji.length) return prazniPomaci();
    if (raniji.length > 600) return null;
    const [ranije, uMesecu] = await Promise.all([serije(raniji), serije([...mereni.keys()])]);

    const najPre = new Map<string, number>();
    for (const s of ranije) {
      const v = s.assigned_program_exercises?.exercise_id;
      if (!v || s.weight_kg == null) return null;
      najPre.set(v, Math.max(najPre.get(v) ?? 0, s.weight_kg));
    }
    const najPosle = new Map<string, { ime: string | null; kg: number; dan: number }>();
    for (const s of uMesecu) {
      const x = s.assigned_program_exercises;
      const dan = s.session_log_id ? mereni.get(s.session_log_id) : undefined;
      if (!x?.exercise_id || s.weight_kg == null || dan == null) return null;
      const dosad = najPosle.get(x.exercise_id);
      // Ista kilaza u dva treninga: racuna se dan kad je prvi put podignuta.
      if (!dosad || s.weight_kg > dosad.kg || (s.weight_kg === dosad.kg && dan < dosad.dan)) {
        najPosle.set(x.exercise_id, { ime: x.exercises?.name ?? dosad?.ime ?? null, kg: s.weight_kg, dan });
      }
    }
    const p: Pomaci = { napredak: [], najPre, oboreno: new Map() };
    const svi: NapredakVezbe[] = [];
    najPosle.forEach((novo, v) => {
      const staro = najPre.get(v);
      if (staro == null || novo.kg <= staro) return;
      p.oboreno.set(v, novo.dan);
      if (novo.ime) svi.push({ vezba: novo.ime, pre: staro, posle: novo.kg, jedinica: "kg" });
    });
    svi.sort((a, b) => {
      const ra = a.posle - a.pre;
      const rb = b.posle - b.pre;
      return ra !== rb ? rb - ra : a.vezba.localeCompare(b.vezba, "sr-Latn");
    });
    p.napredak = svi.slice(0, 4);
    return p;
  } catch (e) {
    upozori(e);
    return null;
  }
};

export const ucitajMesecKlijenta = async (uid: string, upozori: Upozori): Promise<Ishod> => {
  const mesec = prosliMesec();
  type Red = {
    id: string;
    completed_at: string | null;
    duration_seconds: number | null;
    total_volume_kg: number | null;
    active_calories: number | null;
    entered_by_trainer: string | null;
  };
  const [redovi, imeKlijenta] = await Promise.all([
    sviRedovi<Red>(() =>
      db.from("workout_session_logs")
        .select("id,completed_at,duration_seconds,total_volume_kg,active_calories,entered_by_trainer")
        .eq("athlete_id", uid).gte("completed_at", mesec.pocetak.toISOString())
        .lt("completed_at", mesec.kraj.toISOString())
        .order("completed_at", { ascending: true }).order("id"),
    ),
    imeIzProfila(uid),
  ]);
  if (!redovi.length) return { ok: false, poruka: "U prošlom mesecu nema završenih treninga." };

  const dani = new Set<number>();
  const danTreninga = new Map<string, number>();
  const mereni = new Map<string, number>();
  let kg = 0;
  let sekundi = 0;
  let kcal = 0;
  for (const r of redovi) {
    if (r.completed_at) {
      const dan = beograd(new Date(r.completed_at)).d;
      dani.add(dan);
      danTreninga.set(r.id, dan);
      // Trening koji je trener upisao naknadno ne pravi rekorde ni na serveru.
      if (r.entered_by_trainer == null) mereni.set(r.id, dan);
    }
    kg += r.total_volume_kg ?? 0;
    sekundi += Math.max(0, r.duration_seconds ?? 0);
    if (r.active_calories != null && r.active_calories > 0) kcal += r.active_calories;
  }

  type RekordRed = { exercise_id: string | null; best_weight_kg: number | null; best_weight_session_log_id: string | null };
  const [rekordiDelovi, istorija] = await Promise.all([
    Promise.all(grupe(redovi.map((r) => r.id), 60).map(async (deo) => {
      const { data, error } = await db.from("personal_records")
        .select("exercise_id,best_weight_kg,best_weight_session_log_id")
        .eq("athlete_id", uid).not("best_weight_kg", "is", null)
        .in("best_weight_session_log_id", deo);
      if (error) throw error;
      return (data ?? []) as RekordRed[];
    })),
    pomaciMeseca(uid, mesec.pocetak, mereni, upozori),
  ]);

  // Vezba -> dan rekorda. Kad je istorija poznata, rekord je samo ono sto je imalo sta da
  // obori; bez istorije se broje svi rekordi postavljeni u tom mesecu.
  const rekordDan = new Map<string, number>(istorija?.oboreno ?? []);
  const bezVezbe: number[] = [];
  for (const r of rekordiDelovi.flat()) {
    const dan = r.best_weight_session_log_id ? danTreninga.get(r.best_weight_session_log_id) : undefined;
    if (dan == null) continue;
    if (!r.exercise_id) {
      bezVezbe.push(dan);
      continue;
    }
    if (istorija) {
      const staro = istorija.najPre.get(r.exercise_id);
      if (staro == null || (r.best_weight_kg ?? 0) < staro) continue;
    }
    rekordDan.set(r.exercise_id, dan);
  }

  const m: MesecKlijentaZaDeljenje = {
    klijent: imeKlijenta ?? "",
    mesec: mesec.naslov,
    mesecMalo: mesec.malo,
    treninga: redovi.length,
    // Termini i treninzi iz aplikacije nisu isti skup, pa "od N zakazanih" ne bi bilo tacno.
    zakazano: null,
    dani: [...dani].sort((a, b) => a - b),
    rekordDani: [...new Set([...rekordDan.values(), ...bezVezbe])].sort((a, b) => a - b),
    brojDana: mesec.brojDana,
    pomak: mesec.pomak,
    napredak: istorija?.napredak ?? [],
    kg,
    minuta: Math.floor(sekundi / 60),
    kcal: kcal > 0 ? Math.round(kcal) : null,
    rekorda: rekordDan.size + bezVezbe.length,
  };
  return { ok: true, sadrzaj: { vrsta: "mesecKlijenta", m } };
};

// Rekord iz obavestenja

type RedObavestenja = {
  id?: string;
  kind: string;
  body: string | null;
  meta: Record<string, unknown> | null;
  created_at: string | null;
  athlete_id: string | null;
};

/** Brojke su u meta polju, a kod starijih redova u tekstu ("Čučanj • 85 kg × 3"). */
const rekordIz = (n: RedObavestenja, klijent: string | null): RekordZaDeljenje | null => {
  if (n.kind !== "pr_set") return null;
  const datum = n.created_at ? new Date(n.created_at) : new Date();
  const m = n.meta ?? {};
  const baza = { napredak: [] as number[], datum, klijent };
  if (typeof m.weight_kg === "number" && m.weight_kg > 0 && typeof m.reps === "number" && typeof m.exercise_name === "string") {
    return { ...baza, vezba: m.exercise_name, kg: m.weight_kg, pon: m.reps };
  }
  const delovi = String(n.body ?? "").split(/[•·]/).map((s) => s.trim());
  const nadjeno = delovi[1]?.match(/([0-9]+(?:[.,][0-9]+)?) kg × ([0-9]+)/);
  if (delovi.length < 2 || !nadjeno) return null;
  return { ...baza, vezba: delovi[0], kg: Number(nadjeno[1].replace(",", ".")), pon: Number(nadjeno[2]) };
};

export const ucitajRekord = async (uid: string, obavestenjeId: string): Promise<Ishod> => {
  const { data: n, error } = await db.from("notifications")
    .select("kind,body,meta,created_at,athlete_id")
    .eq("id", obavestenjeId).eq("recipient_id", uid).maybeSingle();
  if (error) throw error;
  const klijent = n?.athlete_id ? await imeIzProfila(n.athlete_id) : null;
  const r = n ? rekordIz(n, klijent) : null;
  if (!r) return { ok: false, poruka: "Rekord nije pronađen." };
  return { ok: true, sadrzaj: { vrsta: "rekord", r } };
};

export type PoslednjiRezultat = {
  id: string;
  ime: string;
  opis: string;
  datum: Date | null;
  /** Parametri za /trener/objave. */
  veza: Record<string, string>;
};

/** Poslednji rekordi i zavrseni treninzi iz obavestenja, isti izvor kao na telefonu. */
export const ucitajPoslednjeRezultate = async (uid: string, koliko = 6) => {
  const polja = "id,kind,body,meta,created_at,athlete_id";
  const [rekordi, treninzi] = await Promise.all([
    db.from("notifications").select(polja).eq("recipient_id", uid).eq("kind", "pr_set")
      .order("created_at", { ascending: false }).limit(koliko * 2),
    db.from("notifications").select(polja).eq("recipient_id", uid).eq("kind", "workout_completed")
      .not("meta->>session_log_id", "is", null)
      .order("created_at", { ascending: false }).limit(koliko),
  ]);
  if (rekordi.error) throw rekordi.error;
  if (treninzi.error) throw treninzi.error;
  const redRekorda = (rekordi.data ?? []) as RedObavestenja[];
  const redTreninga = (treninzi.data ?? []) as RedObavestenja[];
  const ids = [...new Set([...redRekorda, ...redTreninga].map((n) => n.athlete_id).filter(Boolean))] as string[];
  const imena = new Map<string, string>();
  for (const deo of grupe(ids, 100)) {
    const { data, error } = await db.from("profiles").select("id,full_name").in("id", deo);
    if (error) throw error;
    for (const p of (data ?? []) as { id: string; full_name: string | null }[]) {
      imena.set(p.id, (p.full_name ?? "").trim());
    }
  }
  const ime = (n: RedObavestenja) => (n.athlete_id && imena.get(n.athlete_id)) || "Vežbač";
  const datum = (n: RedObavestenja) => (n.created_at ? new Date(n.created_at) : null);

  const zaRekord: PoslednjiRezultat[] = redRekorda.flatMap((n) => {
    const r = rekordIz(n, null);
    if (!r || !n.id) return [];
    return [{
      id: n.id,
      ime: ime(n),
      opis: `${r.vezba} · ${kgTekst(r.kg)} kg × ${r.pon}`,
      datum: datum(n),
      veza: { kartica: "rekord", obavestenje: n.id },
    }];
  }).slice(0, koliko);

  const zaTrening: PoslednjiRezultat[] = redTreninga.flatMap((n) => {
    const sesija = n.meta?.session_log_id;
    if (typeof sesija !== "string" || !n.id) return [];
    return [{
      id: n.id,
      ime: ime(n),
      opis: (n.body ?? "").trim() || "Završen trening",
      datum: datum(n),
      veza: { kartica: "trening", sesija, ...(n.athlete_id ? { vezbac: n.athlete_id } : {}) },
    }];
  });
  return { rekordi: zaRekord, treninzi: zaTrening };
};

// Zavrsen trening

type SerijaDetalja = { reps: number | null; weight_kg: number | null; duration_minutes: number | null; kg_po_ruci?: boolean | null };
type VezbaDetalja = { exercise_name: string | null; is_duration_based?: boolean | null; kg_po_ruci?: boolean | null; sets: SerijaDetalja[] | null };

const tekstSerije = (x: VezbaDetalja): string | null => {
  const sets = x.sets ?? [];
  if (x.is_duration_based === true) {
    const m = sets.reduce((s, q) => s + (q.duration_minutes ?? 0), 0);
    return m > 0 ? `${m} min` : null;
  }
  let naj: SerijaDetalja | null = null;
  for (const s of sets) {
    if ((s.weight_kg ?? 0) > 0 && (!naj || (s.weight_kg ?? 0) > (naj.weight_kg ?? 0))) naj = s;
  }
  if (naj) {
    const poRuci = (naj.kg_po_ruci ?? x.kg_po_ruci) === true;
    return `${poRuci ? "2× " : ""}${kgTekst(naj.weight_kg)} kg × ${naj.reps ?? 0}`;
  }
  const pon = Math.max(0, ...sets.map((s) => s.reps ?? 0));
  return pon > 0 ? `${pon} pon.` : null;
};

export const ucitajTrening = async (sesijaId: string, vezbacId: string | null, upozori: Upozori): Promise<Ishod> => {
  const { data, error } = await db.rpc("get_inapp_workout_detail", { p_session_id: sesijaId });
  if (error) throw error;
  const d = Array.isArray(data) ? data[0] : data;
  if (!d) return { ok: false, poruka: "Trening nije pronađen" };
  if (d.success === false) {
    return { ok: false, poruka: d.error === "not_authorized" ? "Nemaš pristup ovom treningu." : "Trening nije pronađen" };
  }

  // Samo ukras na kartici: bez rekorda trening se i dalje deli.
  let rekordVezba: string | null = null;
  const pr = await db.from("personal_records").select("exercises(name)")
    .eq("best_weight_session_log_id", sesijaId).order("best_weight_kg", { ascending: false }).limit(1);
  if (pr.error) upozori(pr.error);
  else rekordVezba = pr.data?.[0]?.exercises?.name ?? null;

  let uid = vezbacId;
  if (!uid) {
    const log = await db.from("workout_session_logs").select("athlete_id").eq("id", sesijaId).maybeSingle();
    if (log.error) upozori(log.error);
    uid = log.data?.athlete_id ?? null;
  }
  const klijent = uid ? await imeIzProfila(uid) : null;

  const vezbe: VezbaTreninga[] = ((d.exercises ?? []) as VezbaDetalja[]).flatMap((x) => {
    if (!x.exercise_name) return [];
    const serija = tekstSerije(x);
    return serija ? [{ naziv: x.exercise_name, serija, rekord: x.exercise_name === rekordVezba }] : [];
  });

  let naziv: string;
  if (d.entered_by_trainer != null) naziv = (d.entry_title ?? "").trim() || "Trening sa trenerom";
  else if (d.entry_title) naziv = d.entry_title;
  else if (d.day_name) naziv = d.day_name;
  else naziv = d.day_number == null ? "Slobodan trening" : `Dan ${d.day_number}`;

  const t: TreningZaDeljenje = {
    naziv,
    datum: d.completed_at ? new Date(d.completed_at) : new Date(),
    minuta: d.duration_seconds > 0 ? Math.floor(d.duration_seconds / 60) : null,
    volumen: d.total_volume_kg ?? null,
    serija: d.sets_done ?? null,
    puls: d.hr_avg > 0 ? d.hr_avg : null,
    kalorije: d.active_calories > 0 ? Math.trunc(d.active_calories) : null,
    pulsNiz: ((d.hr_series ?? []) as unknown[]).flatMap((q) =>
      Array.isArray(q) && q.length > 1 && Number.isFinite(q[1]) ? [Math.trunc(q[1] as number)] : [],
    ),
    // Rekord ide prvi, pa vezbe sa kilazom: tako najvaznije stane u tri reda.
    vezbe: [
      ...vezbe.filter((v) => v.rekord),
      ...vezbe.filter((v) => !v.rekord && v.serija.includes("kg")),
      ...vezbe.filter((v) => !v.rekord && !v.serija.includes("kg")),
    ],
    klijent,
  };
  return { ok: true, sadrzaj: { vrsta: "trening", t } };
};

// Potpis

/** Trener prijavljenog vezbaca: potpis na kartici je uvek trener, i kad deli vezbac. */
export const trenerVezbaca = async (uid: string): Promise<string | null> => {
  const { data, error } = await db.from("athletes").select("trainer_id").eq("id", uid).maybeSingle();
  if (error) throw error;
  return data?.trainer_id ?? null;
};

/** Ime, nalog i studio trenera; ono sto je sam upisao u "Moj stil" ima prednost. */
export const ucitajPotpis = async (
  trenerId: string,
  zapamcen: PotpisKartice,
  upozori: Upozori,
): Promise<{ potpis: PotpisKartice; lice: SlikaKartice | null }> => {
  const [profil, trener] = await Promise.all([
    db.from("profiles").select("full_name,avatar_url").eq("id", trenerId).maybeSingle(),
    db.from("trainers").select("studio_name,instagram_handle").eq("id", trenerId).maybeSingle(),
  ]);
  if (profil.error) upozori(profil.error);
  if (trener.error) upozori(trener.error);
  const potpis: PotpisKartice = {
    ime: zapamcen.ime || (profil.data?.full_name ?? ""),
    instagram: zapamcen.instagram || (trener.data?.instagram_handle ?? ""),
    studio: zapamcen.studio || (trener.data?.studio_name ?? ""),
  };
  let lice: SlikaKartice | null = null;
  if (profil.data?.avatar_url) {
    try {
      lice = await slikaSaAdrese(profil.data.avatar_url, 480, "Profilna slika");
    } catch (e) {
      // Kartica ostaje ispravna, sa inicijalima umesto slike.
      upozori(e);
    }
  }
  return { potpis, lice };
};

// Duboke veze

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ispravanDatum = (s: string | null) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [g, m, d] = s.split("-").map(Number);
  return uDatum(danUTC(g, m, d)) === s ? s : null;
};

export type ParametriKartice = {
  kartica: string;
  vezbac: string | null;
  datum: string | null;
  sesija: string | null;
  obavestenje: string | null;
};

/**
 * /trener/objave?kartica=termini&datum=YYYY-MM-DD, ?kartica=mesec[&vezbac=id],
 * ?kartica=pre-posle&vezbac=id, ?kartica=rekord&obavestenje=id,
 * ?kartica=trening&sesija=id[&vezbac=id]
 */
export const ucitajKarticu = async (p: ParametriKartice, uid: string, upozori: Upozori): Promise<Ishod> => {
  const pogresno: Ishod = { ok: false, poruka: "Ova kartica ne može da se otvori. Izaberi je ponovo." };
  if (p.vezbac && !UUID.test(p.vezbac)) return pogresno;
  switch (p.kartica) {
    case "termini":
      return ucitajTermine(uid, ispravanDatum(p.datum));
    case "mesec":
      return p.vezbac ? ucitajMesecKlijenta(p.vezbac, upozori) : ucitajMesecTrenera(uid);
    case "pre-posle":
      if (!p.vezbac) return { ok: false, poruka: "Pre i posle se pravi iz profila vežbača, uz fotografije napretka." };
      return ucitajPreIPosle(p.vezbac);
    case "rekord":
      if (!p.obavestenje || !UUID.test(p.obavestenje)) return pogresno;
      return ucitajRekord(uid, p.obavestenje);
    case "trening":
      if (!p.sesija || !UUID.test(p.sesija)) return pogresno;
      return ucitajTrening(p.sesija, p.vezbac, upozori);
    default:
      return pogresno;
  }
};
