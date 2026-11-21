import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlarmClock, BellRing, CalendarClock, CalendarDays, Moon, Sun } from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { porukaGreske } from "@/lib/errorMessage";
import { cn } from "@/lib/utils";
import {
  Cipovi, Kartica, Napomena, NijeUcitano, Obavestenje, Odeljak, OkvirPregleda, Raspored, RedPrekidaca,
  RedVrste, Ucitavanje, type VrstaSesije,
} from "@/components/trainer/web/podsetnici/delovi";
import { IzborVremena } from "@/components/trainer/web/podsetnici/IzborVremena";
import { useCuvanjePrefs } from "@/components/trainer/web/podsetnici/useCuvanjePrefs";
import {
  bezNule, duzina, izBaze, minutDana, sat, skrati, trajanje, uBazu, zapis,
} from "@/components/trainer/web/podsetnici/vreme";

// Podsetnici koje dobijaju trenerovi klijenti (trainer_notification_prefs, kolone client_*),
// isto kao TrenerPodsetniciKlijenti.swift. Prekidaci ne nose client_message, a poruka se
// cuva zasebno i nosi samo svoju kolonu, pa nacrt poruke ne ide u bazu uz drugu izmenu.
type Podesavanja = {
  ukljuceno: boolean;
  minuti: number[];
  vece: string | null;
  jutro: string | null;
  rok: boolean;
  utisaneVrste: string[];
};

const PONUDJENI_MINUTI = [15, 30, 60, 120, 180, 240, 300, 360, 720];
const DAN_PRE = 1440;
const VECERNJA = ["18:00", "19:00", "20:00", "21:00"];
const JUTARNJA = ["06:00", "07:00", "08:00", "09:00"];
const NAJVISE = 3;
const NAJDUZA_PORUKA = 140;
const DRUGO = -1;
const DRUGO_SAT = "drugo";
const PORUKA_PUNO = "Najviše 3 podsetnika. Skini jedan pa izaberi drugi.";
const PORUKA_BAR_JEDAN = "Bar jedan podsetnik mora da ostane. Za gašenje je prekidač na vrhu.";
const POCETAK_PRIMERA = 18 * 60;

const rastuce = (a: number[]) => [...a].sort((x, y) => x - y);
const ukupno = (p: Podesavanja) => p.minuti.length + (p.vece === null ? 0 : 1) + (p.jutro === null ? 0 : 1);
const natpis = (m: number) => (m === DAN_PRE ? "Dan pre u isto vreme" : trajanje(m));

function satiStavke(brzi: string[], izabran: string): [string, string][] {
  const s: [string, string][] = brzi.map((v) => [v, bezNule(v)]);
  if (!brzi.includes(izabran)) s.push([izabran, bezNule(izabran)]);
  s.push([DRUGO_SAT, "Drugo"]);
  return s;
}

/** Isto kao _za_minuta na serveru: "za 15 min", "za 2 h", "za 1 h 30 min". */
function zaMinuta(m: number): string {
  if (m < 60) return `za ${Math.max(m, 1)} min`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `za ${h} h` : `za ${h} h ${m % 60} min`;
}

/** Kako podsetnik stiže vežbaču, istim tekstom kao server. Primer: termin sutra u 18:00. */
function Pregled({
  p, poruka, ime, rokSati, vrsta,
}: {
  p: Podesavanja;
  poruka: string;
  ime: string;
  rokSati: number;
  vrsta: string;
}) {
  const trener = ime || "tvoj trener";

  // Red sa rokom: samo dok rok jos traje u trenutku slanja (kao na serveru).
  // `slanje` i rok su u minutima od ponoci dana pre termina.
  const rokRed = (slanje: number): string | null => {
    if (!p.rok || rokSati <= 0) return null;
    const rok = 1440 + POCETAK_PRIMERA - rokSati * 60;
    if (rok <= slanje) return null;
    const istiDan = Math.floor(rok / 1440) === Math.floor(slanje / 1440);
    return `Otkazivanje bez gubitka treninga ${istiDan ? "do " : "do sutra u "}${sat(rok)}`;
  };

  const dopuni = (osnova: string, slanje: number) => {
    let t = osnova;
    const r = rokRed(slanje);
    if (r) t += `\n${r}`;
    const por = poruka.trim();
    if (por) t += `\n${por}`;
    return t;
  };

  const kartice: { id: string; slanje: number; kada: string; naslov: string; tekst: string }[] = [];
  if (p.vece !== null) {
    const slanje = minutDana(p.vece);
    kartice.push({
      id: "vece",
      slanje,
      kada: `Veče pre u ${bezNule(p.vece)}`,
      naslov: "Sutra trening u 18:00",
      tekst: dopuni(`${vrsta}, trener ${trener}`, slanje),
    });
  }
  if (p.jutro !== null) {
    const slanje = 1440 + minutDana(p.jutro);
    kartice.push({
      id: "jutro",
      slanje,
      kada: `Ujutru u ${bezNule(p.jutro)}`,
      naslov: "Danas trening u 18:00",
      tekst: dopuni(`${vrsta}, trener ${trener}`, slanje),
    });
  }
  for (const m of p.minuti) {
    const slanje = 1440 + POCETAK_PRIMERA - m;
    kartice.push({
      id: `m${m}`,
      slanje,
      kada: m === DAN_PRE ? "Dan pre u 18:00" : `${natpis(m)} pre termina`,
      // Kao server: kad podsetnik stize dan ranije pise "Sutra trening u", inace "Trening za".
      naslov: slanje < 1440 ? "Sutra trening u 18:00" : `Trening ${zaMinuta(m)}`,
      tekst: dopuni(`${vrsta} u 18:00, trener ${trener}`, slanje),
    });
  }
  kartice.sort((a, b) => a.slanje - b.slanje);

  return (
    <OkvirPregleda naslov="Ovako stiže vežbaču">
      {!p.ukljuceno ? (
        <Obavestenje naslov="Podsetnici za klijente su isključeni" />
      ) : (
        kartice.map((k) => (
          <div key={k.id} className="space-y-1">
            <div className="text-[11.5px] font-semibold text-muted-foreground">{k.kada}</div>
            <Obavestenje naslov={k.naslov} tekst={k.tekst} />
          </div>
        ))
      )}
    </OkvirPregleda>
  );
}

export default function TrainerPodsetniciKlijenti() {
  const { user } = useAuth();
  const uid = user?.id;
  const { locked, openLock } = usePretplataLock();
  const [poruka, setPoruka] = useState("");
  const [sacuvanaPoruka, setSacuvanaPoruka] = useState("");
  const [cuvaPoruku, setCuvaPoruku] = useState(false);
  const [vrste, setVrste] = useState<VrstaSesije[]>([]);
  const [ime, setIme] = useState("");
  const [rokSati, setRokSati] = useState(0);
  const [ucitava, setUcitava] = useState(true);
  const [napomena, setNapomena] = useState<string | null>(null);
  const [drugo, setDrugo] = useState<"minuti" | "vece" | "jutro" | null>(null);
  const zahtev = useRef(0);

  const { vrednost: p, primeni, izmeni } = useCuvanjePrefs<Podesavanja>((s) =>
    supabase.from("trainer_notification_prefs").upsert(
      {
        trainer_id: uid,
        client_reminders: s.ukljuceno,
        client_reminder_leads: s.minuti,
        client_evening_at: uBazu(s.vece),
        client_morning_at: uBazu(s.jutro),
        client_cancel_info: s.rok,
        client_muted_types: s.utisaneVrste,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "trainer_id" },
    ),
  );

  const ucitaj = useCallback(async () => {
    if (!uid) return;
    const broj = ++zahtev.current;
    setUcitava(true);
    try {
      const [red, tipovi, profil, trener] = await Promise.all([
        supabase
          .from("trainer_notification_prefs")
          .select("client_reminders,client_reminder_leads,client_evening_at,client_morning_at,client_cancel_info,client_message,client_muted_types")
          .eq("trainer_id", uid)
          .maybeSingle(),
        supabase
          .from("session_types")
          .select("id,name,color,capacity")
          .eq("trainer_id", uid)
          .eq("is_archived", false)
          .order("created_at", { ascending: true }),
        supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle(),
        supabase.from("trainers").select("cancel_cutoff_hours").eq("id", uid).maybeSingle(),
      ]);
      if (broj !== zahtev.current) return;
      // Sva cetiri odgovora se primenjuju odjednom; ako jedan ne stigne, ne primenjuje se nijedan.
      const greska = red.error ?? tipovi.error ?? profil.error ?? trener.error;
      if (greska) throw greska;
      const r = red.data as any;
      const tekst: string = r?.client_message ?? "";
      setVrste((tipovi.data as VrstaSesije[]) ?? []);
      setIme(((profil.data as any)?.full_name ?? "").trim());
      setRokSati(Math.max(0, (trener.data as any)?.cancel_cutoff_hours ?? 0));
      setSacuvanaPoruka(tekst);
      setPoruka(tekst);
      primeni({
        ukljuceno: r?.client_reminders ?? true,
        minuti: rastuce(r?.client_reminder_leads ?? [60]),
        vece: izBaze(r?.client_evening_at),
        jutro: izBaze(r?.client_morning_at),
        rok: r?.client_cancel_info ?? false,
        utisaneVrste: r?.client_muted_types ?? [],
      });
      setUcitava(false);
    } catch (e) {
      if (broj !== zahtev.current) return;
      toast.error(porukaGreske(e));
      setUcitava(false);
    }
  }, [uid, primeni]);

  useEffect(() => {
    void ucitaj();
    return () => {
      zahtev.current++;
    };
  }, [ucitaj]);

  const izaberiMinute = (m: number) => {
    if (!p) return;
    setNapomena(null);
    if (p.minuti.includes(m)) {
      if (ukupno(p) <= 1) {
        setNapomena(PORUKA_BAR_JEDAN);
        return;
      }
      izmeni((s) => ({ ...s, minuti: s.minuti.filter((x) => x !== m) }));
    } else if (ukupno(p) < NAJVISE) {
      izmeni((s) => ({ ...s, minuti: rastuce([...s.minuti, m]) }));
    }
  };

  /** Vrednost iz izbora "Drugo": dodaje se kao izabran cip (ako vec nije izabrana). */
  const dodajMinute = (m: number) => {
    if (!p) return;
    setNapomena(null);
    if (p.minuti.includes(m)) return;
    if (ukupno(p) >= NAJVISE) {
      setNapomena(PORUKA_PUNO);
      return;
    }
    izmeni((s) => ({ ...s, minuti: rastuce([...s.minuti, m]) }));
  };

  const prebaci = (kljuc: "vece" | "jutro", pocetno: string) => {
    if (!p) return;
    setNapomena(null);
    if (p[kljuc] !== null) {
      if (ukupno(p) <= 1) {
        setNapomena(PORUKA_BAR_JEDAN);
        return;
      }
      izmeni((s) => ({ ...s, [kljuc]: null }));
    } else if (ukupno(p) < NAJVISE) {
      izmeni((s) => ({ ...s, [kljuc]: pocetno }));
    }
  };

  const prebaciVrstu = (id: string) =>
    izmeni((s) => ({
      ...s,
      utisaneVrste: s.utisaneVrste.includes(id) ? s.utisaneVrste.filter((x) => x !== id) : [...s.utisaneVrste, id],
    }));

  const sacuvajPoruku = async () => {
    if (locked) {
      openLock();
      return;
    }
    if (!p || !uid) return;
    const tekst = poruka.trim();
    setCuvaPoruku(true);
    try {
      const { error } = await supabase.from("trainer_notification_prefs").upsert(
        { trainer_id: uid, client_message: tekst || null, updated_at: new Date().toISOString() } as any,
        { onConflict: "trainer_id" },
      );
      if (error) throw error;
      setSacuvanaPoruka(tekst);
      // Ako je trener nastavio da kuca dok se cuvalo, njegov nov tekst ostaje.
      setPoruka((t) => (t.trim() === tekst ? tekst : t));
    } catch (e) {
      toast.error(porukaGreske(e));
    } finally {
      setCuvaPoruku(false);
    }
  };

  const puno = !!p && ukupno(p) >= NAJVISE;
  const minutiStavke: [number, string][] = p
    ? [
        ...PONUDJENI_MINUTI.map((m): [number, string] => [m, natpis(m)]),
        ...p.minuti
          .filter((m) => !PONUDJENI_MINUTI.includes(m) && m !== DAN_PRE)
          .map((m): [number, string] => [m, natpis(m)]),
        [DRUGO, "Drugo"],
      ]
    : [];
  const slobodniMinuti = p ? [...PONUDJENI_MINUTI.filter((m) => !p.minuti.includes(m)), DRUGO] : [];
  const danPre = !!p && p.minuti.includes(DAN_PRE);
  const primerVrste = (p && vrste.find((v) => !p.utisaneVrste.includes(v.id))?.name) || "Personalni trening";
  const brojZnakova = duzina(poruka);

  return (
    <PhoneShell title="Podsetnici za klijente" eyebrow="Notifikacije" back="/trener/podsetnici" desktopWidth="wide">
      <p className="-mt-2 max-w-[640px] px-1 text-[13.5px] leading-relaxed text-muted-foreground">
        Podsetnik za trening stiže svakom tvom vežbaču koji ima zakazan termin. Kada stiže biraš samo ti.
      </p>

      {!p ? (
        ucitava ? <Ucitavanje /> : <NijeUcitano ponovo={ucitaj} />
      ) : (
        <Raspored pregled={<Pregled p={p} poruka={poruka} ime={ime} rokSati={rokSati} vrsta={primerVrste} />}>
          <Kartica>
            <RedPrekidaca
              ikona={BellRing}
              naslov="Šalji podsetnike klijentima"
              opis={p.ukljuceno ? "Uključeno za sve tvoje klijente" : "Klijenti ne dobijaju podsetnike"}
              ukljucen={p.ukljuceno}
              promeni={() => izmeni((s) => ({ ...s, ukljuceno: !s.ukljuceno }))}
            />
          </Kartica>

          {p.ukljuceno && (
            <>
              <Odeljak>Kada stiže</Odeljak>
              <Kartica>
                <div className="space-y-3 px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                      <AlarmClock className="h-[18px] w-[18px]" strokeWidth={2} />
                    </span>
                    <div>
                      <div className="text-[14px] font-semibold leading-tight">Pred termin</div>
                      <div className="mt-0.5 text-[12.5px] text-muted-foreground">Koliko ranije stiže</div>
                    </div>
                  </div>
                  <Cipovi
                    stavke={minutiStavke}
                    izabrano={p.minuti}
                    ugaseno={puno ? slobodniMinuti : []}
                    izaberi={(m) => (m === DRUGO ? setDrugo("minuti") : izaberiMinute(m))}
                  />
                </div>
                <RedPrekidaca
                  ikona={CalendarDays}
                  naslov="Dan pre u isto vreme"
                  opis="Termin u 18:00, podsetnik dan ranije u 18:00"
                  ukljucen={danPre}
                  ugaseno={!danPre && puno}
                  promeni={() => izaberiMinute(DAN_PRE)}
                />
                <div>
                  <RedPrekidaca
                    ikona={Moon}
                    naslov="Veče pre"
                    opis={p.vece ? `Dan ranije u ${bezNule(p.vece)}` : "Dan ranije, u izabrano vreme"}
                    ukljucen={p.vece !== null}
                    ugaseno={p.vece === null && puno}
                    promeni={() => prebaci("vece", "20:00")}
                  />
                  {p.vece !== null && (
                    <div className="px-4 pb-3.5">
                      <Cipovi
                        stavke={satiStavke(VECERNJA, p.vece)}
                        izabrano={[p.vece]}
                        izaberi={(x) => (x === DRUGO_SAT ? setDrugo("vece") : izmeni((s) => ({ ...s, vece: x })))}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <RedPrekidaca
                    ikona={Sun}
                    naslov="Ujutru na dan termina"
                    opis={p.jutro ? `Istog dana u ${bezNule(p.jutro)}` : "Istog dana, u izabrano vreme"}
                    ukljucen={p.jutro !== null}
                    ugaseno={p.jutro === null && puno}
                    promeni={() => prebaci("jutro", "08:00")}
                  />
                  {p.jutro !== null && (
                    <div className="px-4 pb-3.5">
                      <Cipovi
                        stavke={satiStavke(JUTARNJA, p.jutro)}
                        izabrano={[p.jutro]}
                        izaberi={(x) => (x === DRUGO_SAT ? setDrugo("jutro") : izmeni((s) => ({ ...s, jutro: x })))}
                      />
                    </div>
                  )}
                </div>
              </Kartica>
              <Napomena upozorenje={!!napomena || puno}>
                {napomena ?? (puno ? PORUKA_PUNO : "Može više podsetnika, najviše 3. Npr. veče pre i 1 h pre termina.")}
              </Napomena>

              <Odeljak>U podsetniku</Odeljak>
              <Kartica>
                <RedPrekidaca
                  ikona={CalendarClock}
                  naslov="Rok za otkazivanje"
                  opis={
                    rokSati > 0
                      ? `Tvoj rok je ${rokSati} h pre termina`
                      : "Nemaš podešen rok za otkazivanje, pa se ovaj red ne prikazuje"
                  }
                  ukljucen={p.rok}
                  promeni={() => izmeni((s) => ({ ...s, rok: !s.rok }))}
                />
              </Kartica>
              {rokSati > 0 && (
                <Napomena>Red stiže samo dok rok još traje, npr. „Otkazivanje bez gubitka treninga do 14:00”.</Napomena>
              )}

              <Odeljak>Poruka klijentima</Odeljak>
              <div className="space-y-2">
                <textarea
                  value={poruka}
                  onChange={(e) => setPoruka(skrati(e.target.value, NAJDUZA_PORUKA))}
                  rows={3}
                  aria-label="Poruka klijentima"
                  placeholder="Npr. Ponesi peškir i vodu."
                  className="w-full resize-none rounded-2xl border border-hairline bg-surface px-4 py-3 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex items-center justify-between gap-3 px-1">
                  <span className="text-[12px] text-muted-foreground">Stiže na kraju svakog podsetnika.</span>
                  <span
                    className={cn(
                      "text-[12px] font-semibold tabular-nums",
                      brojZnakova >= NAJDUZA_PORUKA ? "text-warning" : "text-muted-foreground",
                    )}
                  >
                    {brojZnakova}/{NAJDUZA_PORUKA}
                  </span>
                </div>
                {poruka.trim() !== sacuvanaPoruka && (
                  <button
                    type="button"
                    onClick={sacuvajPoruku}
                    disabled={cuvaPoruku}
                    className="h-[46px] w-full rounded-full bg-gradient-brand text-[14px] font-bold text-white shadow-brand transition active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {cuvaPoruku ? "Čuvam" : "Sačuvaj poruku"}
                  </button>
                )}
              </div>

              {vrste.length > 0 && (
                <>
                  <Odeljak>Za koje treninge</Odeljak>
                  <Kartica>
                    {vrste.map((v) => {
                      const utisana = p.utisaneVrste.includes(v.id);
                      return (
                        <RedVrste
                          key={v.id}
                          vrsta={v}
                          opis={utisana ? "Bez podsetnika" : "Klijenti dobijaju podsetnik"}
                          ukljucen={!utisana}
                          promeni={() => prebaciVrstu(v.id)}
                        />
                      );
                    })}
                  </Kartica>
                </>
              )}
            </>
          )}
        </Raspored>
      )}

      {p && drugo === "minuti" && (
        <IzborVremena
          naslov="Koliko pre termina"
          vrsta="trajanje"
          od={5}
          do={1440}
          pocetno={90}
          izaberi={dodajMinute}
          zatvori={() => setDrugo(null)}
        />
      )}
      {p && drugo === "vece" && (
        <IzborVremena
          naslov="Veče pre, u koliko sati"
          vrsta="sat"
          od={17 * 60}
          do={23 * 60}
          pocetno={p.vece ? minutDana(p.vece) : 19 * 60 + 30}
          izaberi={(m) => izmeni((s) => ({ ...s, vece: zapis(m) }))}
          zatvori={() => setDrugo(null)}
        />
      )}
      {p && drugo === "jutro" && (
        <IzborVremena
          naslov="Ujutru, u koliko sati"
          vrsta="sat"
          od={5 * 60}
          do={12 * 60}
          pocetno={p.jutro ? minutDana(p.jutro) : 7 * 60 + 30}
          izaberi={(m) => izmeni((s) => ({ ...s, jutro: zapis(m) }))}
          zatvori={() => setDrugo(null)}
        />
      )}
      <BottomNav role="trainer" />
    </PhoneShell>
  );
}
