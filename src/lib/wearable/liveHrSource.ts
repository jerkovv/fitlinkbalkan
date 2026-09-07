import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { getSavedSensor, startSensorHrMonitoring } from "./bleHeartRate";

export type LiveHrSource = "sensor" | "healthkit";

/** Stanje trake za prikaz na ekranu treninga. */
export type SensorStatus =
  | { stanje: "nema" }
  | { stanje: "trazim" }
  | { stanje: "povezana" }
  | { stanje: "pala"; razlog: string | null };

// Prvi ponovni pokusaj brzo, pa sve redje do minuta. Traka koja je ugasena ne
// odgovara na connect dok se ne upali, pa cesto kucanje nista ne dobija - a
// svaki neuspeo pokusaj usput kratko skenira, sto trosi bateriju telefona.
const PRVI_RAZMAK_MS = 20000;
const NAJVECI_RAZMAK_MS = 60000;

/**
 * Jedno mesto koje bira odakle ide zivi puls tokom treninga na telefonu.
 *
 * Uparena traka se povezuje SAMA i vezbac ne prolazi kroz uparivanje ponovo:
 * zapamcena je na telefonu, pa se na pocetku treninga trazi, i ako je tad
 * ugasena ili nije na ruci - pokusaj se ponavlja celog treninga. Cim je vezbac
 * upali usred zagrevanja, preuzima puls.
 *
 * Dok traka nije tu, puls daje telefonov HealthKit, da trening ne ostane bez
 * ijedne cifre. Uvek radi tacno JEDAN izvor: kad se traka javi, HealthKit se
 * gasi; kad veza padne, HealthKit se vraca. Bez toga bi isti otkucaj dva puta
 * ulazio u seriju treninga.
 *
 * Sat NIJE ovde: on ne salje puls kroz telefon nego pravo u bazu
 * (watch_update_workout_hr), pa se ta dva izvora ne takmice u ovoj funkciji.
 */
export const startLiveHrSource = async (
  onUpdate: (bpm: number, source: LiveHrSource) => void,
  onSensorConnectionChange?: (povezana: boolean) => void,
  /** Stanje trake sa razlogom - da vezbac na ekranu vidi zasto pulsa nema. */
  onStatus?: (status: SensorStatus) => void,
): Promise<() => void> => {
  const sensor = getSavedSensor();

  let ugasen = false;
  // Razlika je bitna: stopTrake znaci "nadzor nad trakom postoji" (i posle pada
  // veze, jer se sam vraca), a trakaPovezana "puls bas sad stize sa trake".
  // HealthKit se pali po DRUGOM, inace bi posle pada veze trening ostao nem.
  let trakaPovezana = false;
  let stopTrake: (() => void) | null = null;
  let stopHk: (() => void) | null = null;
  let pokusajUToku = false;
  let razmak = PRVI_RAZMAK_MS;
  let tajmer: ReturnType<typeof setTimeout> | null = null;
  let slusac: PluginListenerHandle | null = null;

  const pokreniHk = async () => {
    if (ugasen || stopHk || trakaPovezana) return;
    const { startLiveHRMonitoring } = await import("./healthkit");
    if (ugasen || trakaPovezana) return;
    const stop = await startLiveHRMonitoring((bpm) => onUpdate(bpm, "healthkit"));
    // Traka je mogla da se javi dok je HealthKit startovao - tada on nije potreban.
    if (ugasen || trakaPovezana) stop();
    else stopHk = stop;
  };

  const ugasiHk = () => {
    stopHk?.();
    stopHk = null;
  };

  const zakaziPokusaj = (uMs: number) => {
    if (ugasen || stopTrake || tajmer) return;
    tajmer = setTimeout(() => {
      tajmer = null;
      void probajTraku();
    }, uMs);
  };

  const probajTraku = async () => {
    if (ugasen || stopTrake || pokusajUToku || !sensor) return;
    pokusajUToku = true;
    onStatus?.({ stanje: "trazim" });
    try {
      const rezultat = await startSensorHrMonitoring(
        sensor,
        (bpm) => onUpdate(bpm, "sensor"),
        (povezana) => {
          trakaPovezana = povezana;
          onSensorConnectionChange?.(povezana);
          onStatus?.(povezana ? { stanje: "povezana" } : { stanje: "trazim" });
          if (povezana) {
            ugasiHk();
          } else if (!ugasen) {
            // Veza pukla usred treninga: startSensorHrMonitoring sam pokusava da
            // se vrati, a dotle puls daje HealthKit umesto da nestane.
            void pokreniHk();
          }
        },
      );

      if (ugasen) {
        rezultat.stop?.();
        return;
      }

      if (rezultat.stop) {
        stopTrake = rezultat.stop;
        razmak = PRVI_RAZMAK_MS;
        ugasiHk();
        return;
      }

      console.warn("[HR] traka se nije javila:", rezultat.razlog);
      onStatus?.({ stanje: "pala", razlog: rezultat.razlog });
      void pokreniHk();
      zakaziPokusaj(razmak);
      razmak = Math.min(razmak * 2, NAJVECI_RAZMAK_MS);
    } catch (e) {
      // Nadzor mora da prezivi svaku gresku: bez ovoga jedan izuzetak ubije
      // pokusaje do kraja treninga, a vezbac ne vidi ni zasto.
      const poruka = e instanceof Error ? e.message : String(e ?? "");
      console.warn("[HR] pokusaj puknuo:", poruka);
      onStatus?.({ stanje: "pala", razlog: poruka || "nepoznata greška" });
      void pokreniHk();
      zakaziPokusaj(razmak);
      razmak = Math.min(razmak * 2, NAJVECI_RAZMAK_MS);
    } finally {
      pokusajUToku = false;
    }
  };

  if (sensor) {
    // Povratak u aplikaciju je najbolji trenutak za pokusaj: vezbac je tad
    // najcesce upravo stavio traku i vratio se na ekran treninga.
    slusac = await App.addListener("appStateChange", ({ isActive }) => {
      if (isActive && !ugasen && !stopTrake) {
        razmak = PRVI_RAZMAK_MS;
        void probajTraku();
      }
    });
    // Pokusaj se NE ceka: traka koja je ugasena ne odgovara do isteka roka, pa bi
    // trening prvih pola minuta stajao bez ijedne cifre. Kreni odmah sa
    // HealthKit-om, a traka preuzme cim se javi.
    void probajTraku();
    await pokreniHk();
  } else {
    onStatus?.({ stanje: "nema" });
    await pokreniHk();
  }

  return () => {
    ugasen = true;
    trakaPovezana = false;
    if (tajmer) clearTimeout(tajmer);
    void slusac?.remove();
    stopTrake?.();
    stopTrake = null;
    ugasiHk();
  };
};
