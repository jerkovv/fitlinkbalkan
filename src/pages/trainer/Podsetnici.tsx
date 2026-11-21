import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlarmClock, ChevronRight, Layers, ListChecks, Moon, Sun, Users, UsersRound } from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { porukaGreske } from "@/lib/errorMessage";
import {
  Cipovi, IzborNacina, Kartica, Napomena, NijeUcitano, Obavestenje, Odeljak, OkvirPregleda, Raspored,
  RedPrekidaca, RedVrste, Ucitavanje, type VrstaSesije,
} from "@/components/trainer/web/podsetnici/delovi";
import { IzborVremena } from "@/components/trainer/web/podsetnici/IzborVremena";
import { useCuvanjePrefs } from "@/components/trainer/web/podsetnici/useCuvanjePrefs";
import { bezNule, izBaze, minutDana, trajanje, uBazu, zapis } from "@/components/trainer/web/podsetnici/vreme";

// Podsetnici za termine (trainer_notification_prefs, kolone reminder_* i *_digest_at), isto
// kao TrenerPodsetnici.swift. Upis nosi samo ove kolone, pa muted_kinds i client_* ostaju.
type Podesavanja = {
  minuti: number[];
  zajedno: boolean;
  napomene: boolean;
  utisaneVrste: string[];
  jutro: string | null;
  vece: string | null;
};

const PONUDJENI_MINUTI = [5, 10, 15, 30, 45, 60, 120];
const JUTARNJA = ["06:00", "06:30", "07:00", "07:30", "08:00", "09:00"];
const VECERNJA = ["19:00", "20:00", "21:00", "22:00"];
const NAJVISE = 3;
const DRUGO = -1;
const PORUKA_PUNO = `Najviše ${NAJVISE} podsetnika. Skini jedan pa izaberi drugi.`;

const rastuce = (a: number[]) => [...a].sort((x, y) => x - y);

/** "1 h i 15 min pre termina" */
function kadaStize(minuti: number[]): string {
  const s = [...minuti].sort((x, y) => y - x).map(trajanje);
  if (s.length === 0) return "Isključeno";
  const spisak = s.length === 1 ? s[0] : `${s.slice(0, -1).join(", ")} i ${s[s.length - 1]}`;
  return `${spisak} pre termina`;
}

function satiStavke(brzi: string[], izabran: string): [string, string][] {
  const s: [string, string][] = brzi.map((v) => [v, bezNule(v)]);
  if (!brzi.includes(izabran)) s.push([izabran, bezNule(izabran)]);
  s.push(["drugo", "Drugo"]);
  return s;
}

function Pregled({ p, vrste }: { p: Podesavanja; vrste: VrstaSesije[] }) {
  let sadrzaj: { naslov: string; tekst: string } | null = null;
  if (p.minuti.length > 0) {
    const za = `Za ${trajanje(Math.min(...p.minuti))}`;
    const grupni = vrste.find((v) => (v.capacity ?? 1) > 1)?.name ?? "Group HIIT";
    const licni = vrste.find((v) => (v.capacity ?? 1) <= 1)?.name ?? "Personalni trening";
    if (p.zajedno) {
      let t = `${licni}: Ana Marković\n${grupni} (2/8): Luka Petrović i Marija Jović`;
      if (p.napomene) t += "\nČlanarina nije plaćena: Ana Marković";
      sadrzaj = { naslov: `${za} u 9:00: 3 klijenta`, tekst: t };
    } else {
      let t = "2/8 · Luka Petrović i Marija Jović";
      if (p.napomene) t += "\nPrvi termin kod tebe: Marija Jović";
      sadrzaj = { naslov: `${za}: ${grupni} u 9:00`, tekst: t };
    }
  }
  return (
    <OkvirPregleda naslov="Ovako stiže">
      {sadrzaj ? (
        <Obavestenje naslov={sadrzaj.naslov} tekst={sadrzaj.tekst} />
      ) : (
        <Obavestenje naslov="Podsetnici pred termin su isključeni" />
      )}
      {p.minuti.length > 1 && <p className="text-[12px] text-muted-foreground">Stiže {kadaStize(p.minuti)}.</p>}
    </OkvirPregleda>
  );
}

export default function TrainerPodsetnici() {
  const { user } = useAuth();
  const uid = user?.id;
  const [vrste, setVrste] = useState<VrstaSesije[]>([]);
  const [ucitava, setUcitava] = useState(true);
  const [poruka, setPoruka] = useState<string | null>(null);
  const [drugo, setDrugo] = useState<"minuti" | "jutro" | "vece" | null>(null);
  const zahtev = useRef(0);

  const { vrednost: p, primeni, izmeni } = useCuvanjePrefs<Podesavanja>((s) =>
    supabase.from("trainer_notification_prefs").upsert(
      {
        trainer_id: uid,
        reminder_leads: s.minuti,
        reminder_grouping: s.zajedno ? "by_time" : "per_session",
        reminder_details: s.napomene,
        reminder_muted_types: s.utisaneVrste,
        morning_digest_at: uBazu(s.jutro),
        evening_digest_at: uBazu(s.vece),
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
      const [red, tipovi] = await Promise.all([
        supabase
          .from("trainer_notification_prefs")
          .select("reminder_leads,reminder_grouping,reminder_details,reminder_muted_types,morning_digest_at,evening_digest_at")
          .eq("trainer_id", uid)
          .maybeSingle(),
        supabase
          .from("session_types")
          .select("id,name,color,capacity")
          .eq("trainer_id", uid)
          .eq("is_archived", false)
          .order("created_at", { ascending: true }),
      ]);
      if (broj !== zahtev.current) return;
      const greska = red.error ?? tipovi.error;
      if (greska) throw greska;
      // Neuspelo citanje nije isto sto i "nema reda"; bez reda vaze podrazumevane iz baze.
      const r = red.data as any;
      setVrste((tipovi.data as VrstaSesije[]) ?? []);
      primeni({
        minuti: rastuce(r?.reminder_leads ?? [15]),
        zajedno: r?.reminder_grouping !== "per_session",
        napomene: r?.reminder_details ?? true,
        utisaneVrste: r?.reminder_muted_types ?? [],
        jutro: izBaze(r?.morning_digest_at),
        vece: izBaze(r?.evening_digest_at),
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
    setPoruka(null);
    if (p.minuti.includes(m)) {
      // Poslednji izbor se ne skida ovde; za iskljucivanje je prekidac iznad.
      if (p.minuti.length <= 1) return;
      izmeni((s) => ({ ...s, minuti: s.minuti.filter((x) => x !== m) }));
    } else if (p.minuti.length >= NAJVISE) {
      setPoruka(PORUKA_PUNO);
    } else {
      izmeni((s) => ({ ...s, minuti: rastuce([...s.minuti, m]) }));
    }
  };

  const dodajMinute = (m: number) => {
    if (!p) return;
    setPoruka(null);
    if (p.minuti.includes(m)) return;
    if (p.minuti.length >= NAJVISE) {
      setPoruka(PORUKA_PUNO);
      return;
    }
    izmeni((s) => ({ ...s, minuti: rastuce([...s.minuti, m]) }));
  };

  const prebaciVrstu = (id: string) =>
    izmeni((s) => ({
      ...s,
      utisaneVrste: s.utisaneVrste.includes(id) ? s.utisaneVrste.filter((x) => x !== id) : [...s.utisaneVrste, id],
    }));

  const minutiStavke: [number, string][] = p
    ? [
        ...PONUDJENI_MINUTI.map((m): [number, string] => [m, trajanje(m)]),
        ...p.minuti.filter((m) => !PONUDJENI_MINUTI.includes(m)).map((m): [number, string] => [m, trajanje(m)]),
        [DRUGO, "Drugo"],
      ]
    : [];
  const puno = !!p && p.minuti.length >= NAJVISE;

  return (
    <PhoneShell
      title="Podsetnici za termine"
      eyebrow="Notifikacije"
      back="/trener/podesavanja-obavestenja"
      desktopWidth="wide"
    >
      <p className="-mt-2 max-w-[640px] px-1 text-[13.5px] leading-relaxed text-muted-foreground">
        Podsetnik stiže pre svakog termina, da znaš ko dolazi i šta treba da proveriš.
      </p>

      {!p ? (
        ucitava ? <Ucitavanje /> : <NijeUcitano ponovo={ucitaj} />
      ) : (
        <Raspored pregled={<Pregled p={p} vrste={vrste} />}>
          <Odeljak>Pred termin</Odeljak>
          <Kartica>
            <RedPrekidaca
              ikona={AlarmClock}
              naslov="Podsetnik pred termin"
              opis={p.minuti.length === 0 ? "Isključen" : kadaStize(p.minuti)}
              ukljucen={p.minuti.length > 0}
              promeni={() => izmeni((s) => ({ ...s, minuti: s.minuti.length === 0 ? [15] : [] }))}
            />
            {p.minuti.length > 0 && (
              <div className="space-y-2.5 px-4 py-3.5">
                <div className="text-[12px] font-semibold text-muted-foreground">Koliko ranije</div>
                <Cipovi
                  stavke={minutiStavke}
                  izabrano={p.minuti}
                  ugaseno={puno ? minutiStavke.map(([k]) => k).filter((k) => !p.minuti.includes(k)) : []}
                  izaberi={(m) => (m === DRUGO ? setDrugo("minuti") : izaberiMinute(m))}
                />
                <Napomena upozorenje={!!poruka}>
                  {poruka ?? `Može više podsetnika, najviše ${NAJVISE}. Npr. sat ranije i 15 min ranije.`}
                </Napomena>
              </div>
            )}
          </Kartica>

          {p.minuti.length > 0 && (
            <>
              <Odeljak>Kako da stiže</Odeljak>
              <div className="grid grid-cols-2 gap-3">
                <IzborNacina
                  izabran={p.zajedno}
                  ikona={UsersRound}
                  naslov="Jedna za sve"
                  opis="Svi koji počinju u isto vreme, u jednoj notifikaciji"
                  izaberi={() => izmeni((s) => ({ ...s, zajedno: true }))}
                />
                <IzborNacina
                  izabran={!p.zajedno}
                  ikona={Layers}
                  naslov="Po terminu"
                  opis="Posebno za svaku vrstu treninga u to vreme"
                  izaberi={() => izmeni((s) => ({ ...s, zajedno: false }))}
                />
              </div>

              <Odeljak>U podsetniku</Odeljak>
              <Kartica>
                <RedPrekidaca
                  ikona={ListChecks}
                  naslov="Napomene o klijentu"
                  opis="Nije plaćena članarina, ističe, prvi termin kod tebe"
                  ukljucen={p.napomene}
                  promeni={() => izmeni((s) => ({ ...s, napomene: !s.napomene }))}
                />
              </Kartica>
            </>
          )}

          {vrste.length > 0 && (p.minuti.length > 0 || p.jutro !== null || p.vece !== null) && (
            <>
              <Odeljak>Za koje treninge</Odeljak>
              <Kartica>
                {vrste.map((v) => (
                  <RedVrste
                    key={v.id}
                    vrsta={v}
                    opis={v.capacity != null ? (v.capacity > 1 ? `Do ${v.capacity} klijenata` : "Jedan klijent") : undefined}
                    ukljucen={!p.utisaneVrste.includes(v.id)}
                    promeni={() => prebaciVrstu(v.id)}
                  />
                ))}
              </Kartica>
            </>
          )}

          <Odeljak>Pregled dana</Odeljak>
          <Kartica>
            <div>
              <RedPrekidaca
                ikona={Sun}
                naslov="Jutarnji pregled"
                opis="Koliko termina imaš danas i ko je prvi"
                ukljucen={p.jutro !== null}
                promeni={() => izmeni((s) => ({ ...s, jutro: s.jutro === null ? "07:30" : null }))}
              />
              {p.jutro !== null && (
                <div className="px-4 pb-3.5">
                  <Cipovi
                    stavke={satiStavke(JUTARNJA, p.jutro)}
                    izabrano={[p.jutro]}
                    izaberi={(v) => (v === "drugo" ? setDrugo("jutro") : izmeni((s) => ({ ...s, jutro: v })))}
                  />
                </div>
              )}
            </div>
            <div>
              <RedPrekidaca
                ikona={Moon}
                naslov="Večernji pregled za sutra"
                opis="Sutrašnji termini, da isplaniraš dan"
                ukljucen={p.vece !== null}
                promeni={() => izmeni((s) => ({ ...s, vece: s.vece === null ? "21:00" : null }))}
              />
              {p.vece !== null && (
                <div className="px-4 pb-3.5">
                  <Cipovi
                    stavke={satiStavke(VECERNJA, p.vece)}
                    izabrano={[p.vece]}
                    izaberi={(v) => (v === "drugo" ? setDrugo("vece") : izmeni((s) => ({ ...s, vece: v })))}
                  />
                </div>
              )}
            </div>
          </Kartica>
          <Napomena>Pregled stiže samo kad imaš termine. Otkazani termini se ne računaju.</Napomena>

          <Odeljak>Tvojim klijentima</Odeljak>
          <Link
            to="/trener/podsetnici-klijenti"
            className="card-premium-hover flex items-center gap-3 rounded-[22px] px-4 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
              <Users className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold leading-tight">Podsetnici za klijente</span>
              <span className="mt-0.5 block text-[12.5px] text-muted-foreground">Kada vežbačima stiže podsetnik za trening</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
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
      {p && drugo === "jutro" && (
        <IzborVremena
          naslov="Jutarnji pregled, u koliko sati"
          vrsta="sat"
          od={5 * 60}
          do={12 * 60}
          pocetno={p.jutro ? minutDana(p.jutro) : 7 * 60 + 15}
          izaberi={(m) => izmeni((s) => ({ ...s, jutro: zapis(m) }))}
          zatvori={() => setDrugo(null)}
        />
      )}
      {p && drugo === "vece" && (
        <IzborVremena
          naslov="Večernji pregled, u koliko sati"
          vrsta="sat"
          od={17 * 60}
          do={23 * 60}
          pocetno={p.vece ? minutDana(p.vece) : 20 * 60 + 30}
          izaberi={(m) => izmeni((s) => ({ ...s, vece: zapis(m) }))}
          zatvori={() => setDrugo(null)}
        />
      )}
      <BottomNav role="trainer" />
    </PhoneShell>
  );
}
