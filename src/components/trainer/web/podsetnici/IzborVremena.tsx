import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sat, trajanje } from "./vreme";

// "Drugo" uz brze cipove: trener bira sate i minute u koracima od 5 min, kao tockici na iOS-u.
// Opseg: trajanje (minuti pre termina) ili sat u danu, oba kao od/do u minutima.
type Props = {
  naslov: string;
  vrsta: "trajanje" | "sat";
  od: number;
  do: number;
  pocetno: number;
  izaberi: (minuti: number) => void;
  zatvori: () => void;
};

const MINUTI = Array.from({ length: 12 }, (_, i) => i * 5);
const dve = (n: number) => String(n).padStart(2, "0");

export function IzborVremena({ naslov, vrsta, od, do: doMinuta, pocetno, izaberi, zatvori }: Props) {
  const start = Math.min(Math.max(pocetno, od), doMinuta);
  const [sati, setSati] = useState(Math.floor(start / 60));
  const [minuti, setMinuti] = useState(Math.floor((start % 60) / 5) * 5);

  // Izbor van opsega (npr. 24 h i 30 min, 0 h i 0 min) vraca se na najblizu granicu.
  const uskladi = (s: number, m: number) => {
    let x = m;
    if (s * 60 + x > doMinuta) x = doMinuta - s * 60 < 0 ? 0 : Math.floor((doMinuta - s * 60) / 5) * 5;
    if (s * 60 + x < od) x = Math.min(55, Math.floor((od - s * 60 + 4) / 5) * 5);
    return x;
  };

  const ukupno = sati * 60 + minuti;
  const sviSati = Array.from(
    { length: Math.floor(doMinuta / 60) - Math.floor(od / 60) + 1 },
    (_, i) => Math.floor(od / 60) + i,
  );

  return (
    <Dialog open onOpenChange={(o) => !o && zatvori()}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-muted-foreground">{naslov}</DialogTitle>
          <DialogDescription className="fig pt-1 text-[30px] font-bold leading-tight text-foreground">
            {vrsta === "trajanje" ? `${trajanje(ukupno)} pre termina` : sat(ukupno)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <span className="text-[12px] font-semibold text-muted-foreground">Sati</span>
            <Select
              value={String(sati)}
              onValueChange={(v) => {
                const s = Number(v);
                setSati(s);
                setMinuti((m) => uskladi(s, m));
              }}
            >
              <SelectTrigger aria-label="Sati" className="h-12 rounded-xl text-[15px] font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {sviSati.map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {vrsta === "trajanje" ? `${h} h` : dve(h)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <span className="text-[12px] font-semibold text-muted-foreground">Minuti</span>
            <Select value={String(minuti)} onValueChange={(v) => setMinuti(uskladi(sati, Number(v)))}>
              <SelectTrigger aria-label="Minuti" className="h-12 rounded-xl text-[15px] font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {MINUTI.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {vrsta === "trajanje" ? `${m} min` : dve(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            izaberi(ukupno);
            zatvori();
          }}
          className="h-12 w-full rounded-full bg-gradient-brand text-[15px] font-bold text-white shadow-brand transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Izaberi
        </button>
      </DialogContent>
    </Dialog>
  );
}
