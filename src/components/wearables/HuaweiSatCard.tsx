import { useState } from "react";
import { Bluetooth, Check, Watch, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui-bits";
import { clearSavedSensor, isHrSensorSupported, type HrSensor } from "@/lib/wearable/bleHeartRate";
import { SenzorPulsaSheet } from "@/components/wearables/SenzorPulsaSheet";
import { NISKA_BATERIJA } from "@/lib/baterija";
import { kadaIzmereno, type ZapisBaterije } from "@/components/wearables/HrSensorCard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Huawei Health nema most ka Apple Health-u ni ka Health Connect-u, pa sat ne moze
// da bude provajder. Zato ide ovim putem: sam emituje puls preko Bluetooth-a, a
// FitLink ga hvata kao svaki drugi senzor (provereno na Watch GT 5).
const KORACI = [
  "Na satu otvori spisak aplikacija, pa Podešavanja.",
  'Uđi u "HR Data Broadcasts" (Emitovanje pulsa) i uključi ga.',
  "Vrati se ovde i izaberi sat sa spiska. Ostavi ekran emitovanja uključen dok traje uparivanje.",
];

const NAPOMENA =
  "Dok emituje puls, sat se kod nekih modela privremeno odvoji od Huawei Health aplikacije. Ako opcije nema u meniju, taj model je ne podržava.";

/** Da li je uparen bas Huawei uredjaj (ime iz skeniranja), da chip ne laze. */
export const jeHuawei = (sensor: HrSensor | null) =>
  !!sensor && /huawei|\bhw\b|watch gt|watch fit/i.test(sensor.name);

type Props = {
  sensor: HrSensor | null;
  baterija: ZapisBaterije;
  onSaved: (sensor: HrSensor, pct: number | null) => void;
  onForget: () => void;
};

/**
 * Huawei sat kao izvor pulsa. Deli isto uparivanje sa karticom "Senzor pulsa" -
 * razlika su koraci na satu, koje bi vezbac inace morao sam da trazi.
 */
export const HuaweiSatCard = ({ sensor, baterija, onSaved, onForget }: Props) => {
  const podrzano = isHrSensorSupported();
  const [sheetOpen, setSheetOpen] = useState(false);
  const uparen = jeHuawei(sensor);

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
              <div className="font-display text-[15px] font-bold tracking-tight">Huawei sat</div>
              {uparen && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success-soft-foreground">
                  <Check className="h-3 w-3" /> Uparen
                </span>
              )}
            </div>

            <div className="text-[12px] text-muted-foreground mt-0.5 leading-snug">
              {uparen ? sensor!.name : "Watch GT, Watch Fit i Band koji umeju da emituju puls"}
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
        naslov="Poveži Huawei sat"
        koraci={KORACI}
        napomena={NAPOMENA}
        uvod="Kad emitovanje radi, sat se javlja u spisku ispod. Na iPhone-u ime ume da bude prazno, pa piše samo Puls traka."
      />
    </>
  );
};

export default HuaweiSatCard;
