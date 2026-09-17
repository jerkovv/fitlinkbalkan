import { useEffect, useRef, useState } from "react";
import { ChevronDown, HeartPulse, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FullScreenSheet,
  FullScreenSheetScroll,
  FullScreenSheetFooter,
} from "@/components/ui/full-screen-sheet";
import {
  readBattery,
  saveSensor,
  scanForHrSensors,
  startSensorHrMonitoring,
  type HrReading,
  type HrSensor,
  type ScannedSensor,
} from "@/lib/wearable/bleHeartRate";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Uparen uredjaj + baterija ako je javlja. */
  onSaved: (sensor: HrSensor, baterija: number | null) => void;
  naslov?: string;
  /** Sta uraditi na uredjaju pre skeniranja (npr. ukljuciti emitovanje pulsa). */
  koraci?: string[];
  /** Isti posao, drugi meni po modelu: otvara se tek kad vezbac ne nadje svoj. */
  putevi?: { modeli: string; put: string }[];
  napomena?: string;
  uvod?: string;
};

/**
 * Uparivanje uredjaja koji salje puls preko Bluetooth-a (pojas, narukvica, sat u
 * rezimu emitovanja). Isti prozor koriste sve kartice u "Povezani uredjaji" - samo
 * im se razlikuju koraci na vrhu, jer se emitovanje svuda ukljucuje drugacije.
 */
/**
 * Red ispod imena u spisku. Uredjaj uparen sa telefonom nema jacinu signala (ne
 * oglasava se), a onaj koji u najavi ne kaze da nosi puls potvrdjuje se probom.
 */
const opisUredjaja = (d: ScannedSensor): string => {
  const delovi: string[] = [];
  if (d.povezanSaTelefonom) delovi.push("Već uparen sa telefonom");
  else if (d.rssi != null) delovi.push(`Signal ${d.rssi} dBm`);
  if (!d.hrServis) delovi.push("puls se potvrđuje probom");
  return delovi.join(" · ");
};

export const SenzorPulsaSheet = ({
  open,
  onClose,
  onSaved,
  naslov = "Poveži senzor pulsa",
  koraci,
  putevi,
  napomena,
  uvod = "Stavi senzor na sebe da bi se probudio, pa ga izaberi sa spiska.",
}: Props) => {
  const [skeniram, setSkeniram] = useState(false);
  const [nadjeni, setNadjeni] = useState<ScannedSensor[]>([]);
  // Koliko uredjaja se uopste javilo u blizini i da li spisak vise ne filtrira po
  // imenu: sat u rezimu emitovanja ume da se javi imenom koje ne ocekujemo.
  const [uBlizini, setUBlizini] = useState(0);
  const [sviUredjaji, setSviUredjaji] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  // Proba uzivo: dok je uredjaj izabran, prikazuje se stvaran puls.
  const [proba, setProba] = useState<ScannedSensor | null>(null);
  const [probaBpm, setProbaBpm] = useState<number | null>(null);
  const [probaVeza, setProbaVeza] = useState<"spajam" | "ok" | "pao">("spajam");
  const [probaRazlog, setProbaRazlog] = useState<string | null>(null);
  // Poslednje ocitavanje kakvo je uredjaj poslao, i ono odbaceno - da se vidi da li
  // broj fali zbog nas ili zato sto uredjaj ne oseca kozu.
  const [probaOcitavanje, setProbaOcitavanje] = useState<HrReading | null>(null);
  // Veza stoji, a nijedno ocitavanje nije stiglo: kod sata to znaci da emitovanje
  // pulsa nije upaljeno, pa ekran mora da kaze bas to umesto da drzi "--".
  const [bezOcitavanja, setBezOcitavanja] = useState(false);

  const stopScanRef = useRef<(() => Promise<void>) | null>(null);
  const stopProbeRef = useRef<(() => void) | null>(null);

  const ocistiProbu = () => {
    stopProbeRef.current?.();
    stopProbeRef.current = null;
    setProba(null);
    setProbaBpm(null);
    setProbaVeza("spajam");
    setProbaRazlog(null);
    setProbaOcitavanje(null);
    setBezOcitavanja(false);
  };

  useEffect(() => {
    setBezOcitavanja(false);
    if (probaVeza !== "ok" || probaBpm != null || probaOcitavanje) return;
    const t = setTimeout(() => setBezOcitavanja(true), 8000);
    return () => clearTimeout(t);
  }, [probaVeza, probaBpm, probaOcitavanje]);

  // iOS ume da odbije connect dok skeniranje jos traje, pa se stop CEKA.
  const ocistiSkeniranje = async () => {
    const stop = stopScanRef.current;
    stopScanRef.current = null;
    setSkeniram(false);
    if (stop) await stop();
  };

  const pokreniSkeniranje = async (sve = false) => {
    setGreska(null);
    setNadjeni([]);
    setUBlizini(0);
    setSviUredjaji(sve);
    ocistiProbu();
    await ocistiSkeniranje();
    setSkeniram(true);
    try {
      const stop = await scanForHrSensors(
        (lista, ukupno) => {
          setNadjeni(lista);
          setUBlizini(ukupno);
        },
        12,
        sve,
      );
      stopScanRef.current = stop;
      // scanForHrSensors sam staje posle svog roka - ovde se samo gasi indikator.
      setTimeout(() => setSkeniram(false), 12000);
    } catch {
      setSkeniram(false);
      setGreska(
        "Nije moguće skenirati. Uključi Bluetooth i dozvoli FitLink-u pristup uređajima u blizini.",
      );
    }
  };

  // Skeniranje krece sa otvaranjem, a sve veze se raskidaju na zatvaranje: uredjaj
  // koji ostane povezan trosi bateriju i ne pusta drugi telefon da ga uzme.
  useEffect(() => {
    if (!open) return;
    void pokreniSkeniranje();
    return () => {
      void ocistiSkeniranje();
      ocistiProbu();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const probaj = async (kandidat: ScannedSensor) => {
    ocistiProbu();
    setProba(kandidat);
    setProbaVeza("spajam");
    await ocistiSkeniranje();
    const rezultat = await startSensorHrMonitoring(
      kandidat,
      (bpm) => setProbaBpm(bpm),
      (povezana) => setProbaVeza(povezana ? "ok" : "pao"),
      (ocitavanje) => setProbaOcitavanje(ocitavanje),
    );
    if (!rezultat.stop) {
      setProbaVeza("pao");
      setProbaRazlog(rezultat.razlog);
      return;
    }
    stopProbeRef.current = rezultat.stop;
  };

  const sacuvaj = async () => {
    if (!proba) return;
    const izabrana: HrSensor = { deviceId: proba.deviceId, name: proba.name };
    saveSensor(izabrana);
    const pct = await readBattery(izabrana.deviceId);
    ocistiProbu();
    onSaved(izabrana, pct);
    toast.success("Senzor je uparen");
    onClose();
  };

  return (
    <FullScreenSheet open={open} onClose={onClose} title={naslov}>
      <FullScreenSheetScroll className="pt-4 space-y-3">
        {koraci && koraci.length > 0 && (
          <ol className="space-y-2.5 rounded-2xl border border-hairline bg-surface-2 p-4">
            {koraci.map((k, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-snug">
                <span className="h-5 w-5 shrink-0 rounded-full bg-gradient-brand text-white text-[11px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span>{k}</span>
              </li>
            ))}
          </ol>
        )}

        {putevi && putevi.length > 0 && (
          <details className="rounded-2xl border border-hairline bg-surface-2 px-4 py-3 [&[open]>summary>svg]:rotate-180">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[13px] font-semibold">
              Gde je to na mom modelu?
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform" />
            </summary>
            <ul className="mt-3 space-y-2.5">
              {putevi.map((p) => (
                <li key={p.modeli} className="text-[12px] leading-snug">
                  <span className="font-semibold">{p.modeli}</span>
                  <br />
                  <span className="text-muted-foreground">{p.put}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        <p className="text-[13px] text-muted-foreground">{uvod}</p>

        {napomena && (
          <p className="text-[12px] text-muted-foreground leading-snug">{napomena}</p>
        )}

        {greska && (
          <div className="rounded-xl bg-destructive/10 p-3 text-[12px] text-destructive leading-snug">
            {greska}
          </div>
        )}

        {proba ? (
          <div className="rounded-2xl border border-hairline p-4 text-center">
            <div className="text-[13px] font-semibold">{proba.name}</div>
            {probaVeza === "spajam" && (
              <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Povezujem...
              </div>
            )}
            {probaVeza === "pao" && (
              <div className="mt-3 space-y-2">
                <div className="text-[12px] text-destructive leading-snug">
                  Uređaj se ne javlja. Proveri da li je na telu i da nije povezan sa drugom
                  aplikacijom, pa probaj ponovo.
                </div>
                {probaRazlog && (
                  <div className="text-[11px] text-muted-foreground leading-snug break-words">
                    {probaRazlog}
                  </div>
                )}
                <Button size="sm" variant="outline" onClick={() => void probaj(proba)}>
                  Probaj ponovo
                </Button>
              </div>
            )}
            {probaVeza === "ok" && (
              <>
                <div className="mt-2 font-display text-[44px] leading-none font-bold tracking-tightest tnum">
                  {probaOcitavanje?.contact === false ? "--" : probaBpm ?? "--"}
                </div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mt-1">
                  bpm uživo
                </div>
                {probaOcitavanje?.contact === false && (
                  <div className="mt-2 text-[12px] text-destructive leading-snug">
                    Uređaj javlja da ne oseća kožu. Zategni ga i navlaži kontakte - dok javlja
                    da nema kontakt, broj koji šalje nije merenje.
                  </div>
                )}
                {bezOcitavanja && (
                  <div className="mt-2 space-y-2">
                    <div className="text-[12px] text-destructive leading-snug">
                      Veza radi, ali uređaj ne šalje otkucaje. Ako je sat, uključi emitovanje
                      pulsa na njemu i ostavi taj ekran upaljen; traku stavi na sebe da se
                      probudi.
                    </div>
                    <Button size="sm" variant="outline" onClick={() => void probaj(proba)}>
                      Probaj ponovo
                    </Button>
                  </div>
                )}
                {probaOcitavanje?.contact === null && (
                  <div className="mt-2 text-[11px] text-muted-foreground leading-snug">
                    Uređaj ne javlja da li oseća kožu, pa se broj ne može proveriti softverski.
                    Uporedi ga sa satom ili aplikacijom proizvođača.
                  </div>
                )}
                {probaOcitavanje && (
                  <div className="mt-2 text-[10px] text-muted-foreground/70 tnum">
                    {probaOcitavanje.raw}
                  </div>
                )}
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => {
                ocistiProbu();
                void pokreniSkeniranje(sviUredjaji);
              }}
            >
              Nazad na spisak
            </Button>
          </div>
        ) : (
          <>
            {nadjeni.map((d) => (
              <button
                key={d.deviceId}
                onClick={() => void probaj(d)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-hairline hover:border-primary/40 transition text-left"
              >
                <div className="h-9 w-9 rounded-xl bg-gradient-brand-soft flex items-center justify-center shrink-0">
                  <HeartPulse className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{d.name}</div>
                  <div className="text-[11px] text-muted-foreground">{opisUredjaja(d)}</div>
                </div>
              </button>
            ))}

            {skeniram && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Tražim uređaje u blizini...
              </div>
            )}

            {!skeniram && nadjeni.length === 0 && !greska && (
              <div className="text-center py-6 text-sm text-muted-foreground px-6">
                Nijedan uređaj nije nađen.
              </div>
            )}

            {!sviUredjaji && uBlizini > nadjeni.length && (
              <button
                onClick={() => void pokreniSkeniranje(true)}
                className="w-full text-center py-3 text-[12.5px] font-semibold text-primary"
              >
                Ne vidiš svoj uređaj? Prikaži sve u blizini ({uBlizini})
              </button>
            )}
          </>
        )}
      </FullScreenSheetScroll>

      <FullScreenSheetFooter>
        {proba && probaVeza === "ok" ? (
          <Button
            className="w-full bg-gradient-brand text-white shadow-brand"
            onClick={() => void sacuvaj()}
          >
            Sačuvaj ovaj uređaj
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full"
            disabled={skeniram}
            onClick={() => void pokreniSkeniranje(sviUredjaji)}
          >
            <Search className="h-4 w-4 mr-1.5" />
            {skeniram ? "Tražim..." : "Skeniraj ponovo"}
          </Button>
        )}
      </FullScreenSheetFooter>
    </FullScreenSheet>
  );
};

export default SenzorPulsaSheet;
