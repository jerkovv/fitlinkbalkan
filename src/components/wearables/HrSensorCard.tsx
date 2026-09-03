import { useEffect, useRef, useState } from "react";
import { Bluetooth, Check, HeartPulse, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui-bits";
import {
  FullScreenSheet,
  FullScreenSheetScroll,
  FullScreenSheetFooter,
} from "@/components/ui/full-screen-sheet";
import {
  clearSavedSensor,
  getSavedSensor,
  isHrSensorSupported,
  readBattery,
  saveSensor,
  scanForHrSensors,
  startSensorHrMonitoring,
  type HrReading,
  type HrSensor,
  type ScannedSensor,
} from "@/lib/wearable/bleHeartRate";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Uparivanje puls trake (Bluetooth), bez sata.
 *
 * Traka se pamti na ovom telefonu, pa kartica ne zna nista o bazi ni o
 * provajderima iz useWearableConnections - zato je zasebna, a ne jos jedan
 * WearableProviderCard.
 */
export const HrSensorCard = () => {
  const podrzano = isHrSensorSupported();
  const [sensor, setSensor] = useState<HrSensor | null>(() => getSavedSensor());
  const [baterija, setBaterija] = useState<number | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [skeniram, setSkeniram] = useState(false);
  const [nadjeni, setNadjeni] = useState<ScannedSensor[]>([]);
  const [greska, setGreska] = useState<string | null>(null);

  // Proba uzivo: dok je sheet otvoren i traka izabrana, prikazuje se stvaran puls.
  const [proba, setProba] = useState<ScannedSensor | null>(null);
  const [probaBpm, setProbaBpm] = useState<number | null>(null);
  const [probaVeza, setProbaVeza] = useState<"spajam" | "ok" | "pao">("spajam");
  const [probaRazlog, setProbaRazlog] = useState<string | null>(null);
  // Poslednje ocitavanje kakvo je traka poslala, i ono odbaceno - da se na
  // telefonu vidi da li broj fali zbog nas ili zato sto traka ne oseca kozu.
  const [probaOcitavanje, setProbaOcitavanje] = useState<HrReading | null>(null);

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
  };

  // iOS ume da odbije connect dok skeniranje jos traje, pa se stop CEKA.
  const ocistiSkeniranje = async () => {
    const stop = stopScanRef.current;
    stopScanRef.current = null;
    setSkeniram(false);
    if (stop) await stop();
  };

  // Sve veze se raskidaju kad kartica nestane - traka koja ostane povezana
  // trosi bateriju i ne pusta drugi telefon da je uzme.
  useEffect(() => () => {
    stopScanRef.current?.();
    stopProbeRef.current?.();
  }, []);

  const pokreniSkeniranje = async () => {
    setGreska(null);
    setNadjeni([]);
    ocistiProbu();
    await ocistiSkeniranje();
    setSkeniram(true);
    try {
      const stop = await scanForHrSensors((lista) => setNadjeni(lista));
      stopScanRef.current = stop;
      // scanForHrSensors sam staje posle svog roka - ovde se samo gasi indikator.
      setTimeout(() => setSkeniram(false), 12000);
    } catch (e) {
      setSkeniram(false);
      setGreska(
        "Nije moguće skenirati. Uključi Bluetooth i dozvoli FitLink-u pristup uređajima u blizini.",
      );
    }
  };

  const otvoriSheet = () => {
    setSheetOpen(true);
    void pokreniSkeniranje();
  };

  const zatvoriSheet = () => {
    void ocistiSkeniranje();
    ocistiProbu();
    setSheetOpen(false);
  };

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
    setSensor(izabrana);
    const pct = await readBattery(izabrana.deviceId);
    setBaterija(pct);
    ocistiProbu();
    setSheetOpen(false);
    toast.success("Traka je uparena");
  };

  const zaboravi = () => {
    clearSavedSensor();
    setSensor(null);
    setBaterija(null);
    toast.success("Traka je uklonjena");
  };

  const povezana = !!sensor;

  return (
    <>
      <Card
        className={cn(
          "p-4 relative overflow-hidden transition",
          povezana && "ring-1 ring-primary/30",
          !podrzano && "opacity-60",
        )}
      >
        {povezana && <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-brand" />}

        <div className="flex items-start gap-3">
          <div
            className={cn(
              "h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 text-primary-foreground",
              podrzano ? "bg-gradient-brand shadow-brand" : "bg-muted text-muted-foreground",
            )}
          >
            <HeartPulse className="h-5 w-5" strokeWidth={2.25} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-display text-[15px] font-bold tracking-tight">Puls traka</div>
              {povezana && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success-soft-foreground">
                  <Check className="h-3 w-3" /> Uparena
                </span>
              )}
              {!podrzano && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  Samo u aplikaciji
                </span>
              )}
            </div>

            <div className="text-[12px] text-muted-foreground mt-0.5 leading-snug">
              {povezana
                ? sensor!.name
                : "Bluetooth traka za grudi ili nadlakticu - puls tokom treninga bez sata"}
            </div>

            {povezana && baterija != null && (
              <div className="text-[11px] text-muted-foreground mt-1.5">
                Baterija trake: {baterija}%
              </div>
            )}
            {!podrzano && (
              <div className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                Bluetooth uređaji rade samo u FitLink aplikaciji sa telefona, ne u pregledaču.
              </div>
            )}
          </div>
        </div>

        {podrzano && (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant={povezana ? "outline" : "default"}
              className={cn("flex-1", !povezana && "bg-gradient-brand text-primary-foreground hover:opacity-95")}
              onClick={otvoriSheet}
            >
              <Bluetooth className="h-3.5 w-3.5 mr-1.5" />
              {povezana ? "Promeni traku" : "Poveži"}
            </Button>
            {povezana && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={zaboravi}
                aria-label="Ukloni traku"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </Card>

      <FullScreenSheet open={sheetOpen} onClose={zatvoriSheet} title="Poveži puls traku">
        <FullScreenSheetScroll className="pt-4 space-y-3">
          <p className="text-[13px] text-muted-foreground">
            Stavi traku na sebe da bi se probudila, pa je izaberi sa spiska.
          </p>

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
                    Traka se ne javlja. Proveri da li je na telu i da nije povezana sa satom ili
                    drugom aplikacijom, pa probaj ponovo.
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
                      Traka ne oseća kožu. Zategni je i navlaži kontakte - dok javlja da nema
                      kontakt, broj koji šalje nije merenje.
                    </div>
                  )}
                  {probaOcitavanje?.contact === null && (
                    <div className="mt-2 text-[11px] text-muted-foreground leading-snug">
                      Traka ne javlja da li oseća kožu, pa se broj ne može proveriti softverski.
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
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => { ocistiProbu(); void pokreniSkeniranje(); }}>
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
                    {d.rssi != null && (
                      <div className="text-[11px] text-muted-foreground">Signal {d.rssi} dBm</div>
                    )}
                  </div>
                </button>
              ))}

              {skeniram && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Tražim trake u blizini...
                </div>
              )}

              {!skeniram && nadjeni.length === 0 && !greska && (
                <div className="text-center py-6 text-sm text-muted-foreground px-6">
                  Nijedna traka nije nađena.
                </div>
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
              Sačuvaj ovu traku
            </Button>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              disabled={skeniram}
              onClick={() => void pokreniSkeniranje()}
            >
              <Search className="h-4 w-4 mr-1.5" />
              {skeniram ? "Tražim..." : "Skeniraj ponovo"}
            </Button>
          )}
        </FullScreenSheetFooter>
      </FullScreenSheet>
    </>
  );
};
