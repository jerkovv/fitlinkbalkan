import { useState } from "react";
import { Bluetooth, Check, Watch, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui-bits";
import { clearSavedSensor, isHrSensorSupported, type HrSensor } from "@/lib/wearable/bleHeartRate";
import { SenzorPulsaSheet } from "@/components/wearables/SenzorPulsaSheet";
import { NISKA_BATERIJA } from "@/lib/baterija";
import { kadaIzmereno, type ZapisBaterije } from "@/components/wearables/HrSensorCard";
import { jeGarminSat } from "@/lib/uredjaji";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Garmin Connect nema most ka Apple Health-u u realnom vremenu, pa sat ide istim
// putem kao Huawei: ukljuci se "Broadcast Heart Rate" i sat emituje puls preko
// standardnog Bluetooth profila, koji FitLink hvata kao svaki drugi senzor.
const KORACI = [
  'Na satu otvori Podešavanja i nađi "Wrist Heart Rate" (Puls na zglobu). Meni iznad njega zavisi od modela, spisak je ispod.',
  'Izaberi "Broadcast Heart Rate" (Emitovanje pulsa) i pritisni gornje dugme da krene emitovanje.',
  "Ostavi taj ekran upaljen na satu, pa se vrati ovde i izaberi sat sa spiska.",
];

/**
 * Isti posao, drugi meni po seriji - provereno u Garmin uputstvima za svaku.
 * Bez ovoga se vezbac vrti po pogresnom meniju i zakljuci da sat ne moze.
 */
const PUTEVI = [
  {
    modeli: "Venu 4, Vivoactive 6, Forerunner 165, 255, 265, 570, 955, 965, 970, Fenix 8, Fenix E",
    put: "Podešavanja > Health & Wellness > Wrist Heart Rate > Broadcast Heart Rate",
  },
  {
    modeli: "Venu 3, Vivoactive 5",
    put: "Podešavanja > Watch Sensors > Wrist Heart Rate > Broadcast Heart Rate",
  },
  {
    modeli: "Fenix 7 i stariji, Epix, Enduro, Tactix, Instinct 2 i 3, Instinct Crossover",
    put: "Drži MENU > Sensors & Accessories > Wrist Heart Rate > Broadcast Heart Rate",
  },
  {
    modeli: "Venu 2, Venu Sq, Vivoactive 4 i stariji",
    put: "Podešavanja (zupčanik) > Wrist Heart Rate > Broadcast",
  },
  {
    modeli: "Prečica na skoro svim modelima",
    put: "Drži gornje dugme (na Fenix-u LIGHT, na Instinct-u CTRL) da otvoriš Kontrole, pa izaberi ikonicu srca. Ako je nema, dodaje se kroz izmenu Kontrola.",
  },
];

const NAPOMENA =
  "Ponovni pritisak istog dugmeta zaustavlja emitovanje, kao i izlazak sa tog ekrana, pa sat odmah prestaje da šalje puls. Dok emituje, troši više baterije, a neki modeli ne javljaju stanje baterije.";

/** Da li je uparen bas Garmin sat (ime iz skeniranja), da chip ne laze. */
export const jeGarmin = (sensor: HrSensor | null) => jeGarminSat(sensor?.name);

type Props = {
  sensor: HrSensor | null;
  baterija: ZapisBaterije;
  onSaved: (sensor: HrSensor, pct: number | null) => void;
  onForget: () => void;
};

/**
 * Garmin sat kao izvor pulsa. Deli isto uparivanje sa karticom "Senzor pulsa" -
 * razlika su koraci na satu, koje bi vezbac inace morao sam da trazi.
 */
export const GarminSatCard = ({ sensor, baterija, onSaved, onForget }: Props) => {
  const podrzano = isHrSensorSupported();
  const [sheetOpen, setSheetOpen] = useState(false);
  const uparen = jeGarmin(sensor);

  const zaboravi = () => {
    clearSavedSensor();
    onForget();
    toast.success("Sat je uklonjen");
  };

  return (
    <>
      <Card
        className={cn(
          "p-4 relative overflow-hidden transition",
          uparen && "ring-1 ring-primary/30",
          !podrzano && "opacity-60",
        )}
      >
        {uparen && <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-brand" />}

        <div className="flex items-start gap-3">
          <div
            className={cn(
              "h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 text-primary-foreground",
              podrzano ? "bg-gradient-brand shadow-brand" : "bg-muted text-muted-foreground",
            )}
          >
            <Watch className="h-5 w-5" strokeWidth={2.25} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-display text-[15px] font-bold tracking-tight">Garmin sat</div>
              {uparen && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success-soft-foreground">
                  <Check className="h-3 w-3" /> Uparen
                </span>
              )}
            </div>

            <div className="text-[12px] text-muted-foreground mt-0.5 leading-snug">
              {uparen ? sensor!.name : "Forerunner, Fenix, Venu, Vivoactive, Instinct i slični"}
            </div>

            <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
              {uparen
                ? "Povezuje se sam na početku treninga. Uključi emitovanje pulsa na satu pre nego što kreneš."
                : "Puls sa sata stiže uživo treneru, a posle treninga dobijaš zone. Vodimo te kroz tri koraka na satu."}
            </div>

            {uparen && baterija != null && (
              <div
                className={cn(
                  "text-[11px] mt-1.5 tnum",
                  baterija.pct <= NISKA_BATERIJA ? "font-semibold text-warning" : "text-muted-foreground",
                )}
              >
                Baterija: {baterija.pct}% · {kadaIzmereno(baterija.at)}
              </div>
            )}
          </div>
        </div>

        {podrzano && (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant={uparen ? "outline" : "default"}
              className={cn("flex-1", !uparen && "bg-gradient-brand text-primary-foreground hover:opacity-95")}
              onClick={() => setSheetOpen(true)}
            >
              <Bluetooth className="h-3.5 w-3.5 mr-1.5" />
              {uparen ? "Poveži ponovo" : "Poveži"}
            </Button>
            {uparen && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={zaboravi}
                aria-label="Ukloni sat"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </Card>

      <SenzorPulsaSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSaved={onSaved}
        naslov="Poveži Garmin sat"
        koraci={KORACI}
        putevi={PUTEVI}
        pripada={jeGarminSat}
        napomena={NAPOMENA}
        uvod="Kad emitovanje radi, sat se javlja u spisku ispod, obično imenom modela (Forerunner, Fenix, Venu)."
      />
    </>
  );
};

export default GarminSatCard;
