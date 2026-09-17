import { useState } from "react";
import { Bluetooth, Check, HeartPulse, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui-bits";
import { clearSavedSensor, isHrSensorSupported, type HrSensor } from "@/lib/wearable/bleHeartRate";
import { SenzorPulsaSheet } from "@/components/wearables/SenzorPulsaSheet";
import { NISKA_BATERIJA } from "@/lib/baterija";
import { imaSvojuKarticu } from "@/lib/uredjaji";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type ZapisBaterije = { pct: number; at: string } | null;

// "izmereno danas u 14:20" / "izmereno juče u 09:05" / "izmereno 12. sep"
export const kadaIzmereno = (iso: string) => {
  const d = new Date(iso);
  const sad = new Date();
  const vreme = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const dan = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const razlika = Math.round((dan(sad) - dan(d)) / 86400000);
  if (razlika <= 0) return `izmereno danas u ${vreme}`;
  if (razlika === 1) return `izmereno juče u ${vreme}`;
  return `izmereno ${d.toLocaleDateString("sr-Latn-RS", { day: "numeric", month: "short" })}`;
};

type Props = {
  sensor: HrSensor | null;
  baterija: ZapisBaterije;
  onSaved: (sensor: HrSensor, pct: number | null) => void;
  onForget: () => void;
};

/**
 * Uparivanje senzora pulsa (pojas za grudi, narukvica, sat koji emituje puls).
 * Uredjaj se pamti na OVOM telefonu, pa kartica ne zna nista o nalogu ni o
 * provajderima iz useWearableConnections - zato je zasebna.
 */
export const HrSensorCard = ({ sensor, baterija, onSaved, onForget }: Props) => {
  const podrzano = isHrSensorSupported();
  const [sheetOpen, setSheetOpen] = useState(false);
  const povezana = !!sensor;

  const zaboravi = () => {
    clearSavedSensor();
    onForget();
    toast.success("Senzor je uklonjen");
  };

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
              <div className="font-display text-[15px] font-bold tracking-tight">Senzor pulsa</div>
              {povezana && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success-soft-foreground">
                  <Check className="h-3 w-3" /> Uparen
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
                : "Pojas za grudi, narukvica ili bilo koji drugi senzor pulsa preko Bluetooth-a"}
            </div>

            {povezana && (
              <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
                Povezuje se sam na početku treninga. Samo ga upali i stavi na sebe - ovde se
                vraćaš jedino da ga zameniš.
              </div>
            )}

            {povezana && baterija != null && (
              <div
                className={cn(
                  "text-[11px] mt-1.5 tnum",
                  baterija.pct <= NISKA_BATERIJA ? "font-semibold text-warning" : "text-muted-foreground",
                )}
              >
                Baterija: {baterija.pct}% · {kadaIzmereno(baterija.at)}
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
              onClick={() => setSheetOpen(true)}
            >
              <Bluetooth className="h-3.5 w-3.5 mr-1.5" />
              {povezana ? "Promeni senzor" : "Poveži"}
            </Button>
            {povezana && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={zaboravi}
                aria-label="Ukloni senzor"
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
        pripada={(ime) => !imaSvojuKarticu(ime)}
        napomena="Sat koji ume da emituje puls uključi u tom režimu pre skeniranja. Huawei i Garmin imaju svoje kartice ispod."
      />
    </>
  );
};
