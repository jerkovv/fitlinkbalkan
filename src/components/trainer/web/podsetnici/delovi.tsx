import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { useZakljucanaZona } from "@/components/pretplata/useZakljucanaZona";
import type { ReactNode } from "react";
import { CheckCircle2, Circle, Eye, Loader2, RotateCw, type LucideIcon } from "lucide-react";
import { BrandGlyph } from "@/components/BrandMark";
import { Switch } from "@/components/ui/switch";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { cn } from "@/lib/utils";
import { bojaVrste } from "./vreme";

export type VrstaSesije = { id: string; name: string; color: string | null; capacity: number | null };

export const Odeljak = ({ children }: { children: ReactNode }) => (
  <h2 className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</h2>
);

export const Kartica = ({ children }: { children: ReactNode }) => (
  <div className="card-premium divide-y divide-hairline overflow-hidden rounded-[22px]">{children}</div>
);

export const Napomena = ({ children, upozorenje }: { children: ReactNode; upozorenje?: boolean }) => (
  <p className={cn("px-1 text-[12px] leading-snug", upozorenje ? "text-warning" : "text-muted-foreground")}>{children}</p>
);

const Znak = ({ ikona: Ikona }: { ikona: LucideIcon }) => (
  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
    <Ikona className="h-[18px] w-[18px]" strokeWidth={2} />
  </span>
);

export function RedPrekidaca({
  ikona,
  naslov,
  opis,
  ukljucen,
  ugaseno,
  promeni,
}: {
  ikona: LucideIcon;
  naslov: string;
  opis: string;
  ukljucen: boolean;
  ugaseno?: boolean;
  promeni: () => void;
}) {
  const { locked } = usePretplataLock();
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <Znak ikona={ikona} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold leading-tight">{naslov}</div>
        <div className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{opis}</div>
      </div>
      <Switch
        checked={ukljucen}
        disabled={!locked && ugaseno}
        onCheckedChange={promeni}
        aria-label={naslov}
        className="shrink-0"
      />
    </div>
  );
}

export function RedVrste({
  vrsta,
  opis,
  ukljucen,
  promeni,
}: {
  vrsta: VrstaSesije;
  opis?: string;
  ukljucen: boolean;
  promeni: () => void;
}) {
  const b = bojaVrste(vrsta.color);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: b.bg }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.fg }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold leading-tight">{vrsta.name}</div>
        {opis && <div className="mt-0.5 text-[12.5px] text-muted-foreground">{opis}</div>}
      </div>
      <Switch checked={ukljucen} onCheckedChange={promeni} aria-label={vrsta.name} className="shrink-0" />
    </div>
  );
}

export function Cipovi<K extends string | number>({
  stavke,
  izabrano,
  ugaseno,
  izaberi,
}: {
  stavke: [K, string][];
  izabrano: K[];
  ugaseno?: K[];
  izaberi: (k: K) => void;
}) {
  const { locked } = usePretplataLock();
  return (
    <div className="flex flex-wrap gap-2">
      {stavke.map(([k, t]) => {
        const da = izabrano.includes(k);
        const ne = !locked && !!ugaseno?.includes(k);
        return (
          <button
            key={k}
            type="button"
            disabled={ne}
            aria-pressed={da}
            onClick={() => izaberi(k)}
            className={cn(
              "h-9 rounded-full px-3.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
              da
                ? "bg-gradient-brand text-white"
                : "border border-hairline bg-surface-2 text-muted-foreground hover:text-foreground",
              ne && "cursor-not-allowed opacity-[0.45] hover:text-muted-foreground active:scale-100",
            )}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

export function IzborNacina({
  izabran,
  ikona: Ikona,
  naslov,
  opis,
  izaberi,
}: {
  izabran: boolean;
  ikona: LucideIcon;
  naslov: string;
  opis: string;
  izaberi: () => void;
}) {
  const Oznaka = izabran ? CheckCircle2 : Circle;
  return (
    <button
      type="button"
      aria-pressed={izabran}
      onClick={izaberi}
      className={cn(
        "flex h-full flex-col gap-2 rounded-[20px] bg-surface p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        izabran ? "ring-[1.5px] ring-primary" : "ring-1 ring-hairline hover:ring-primary/40",
      )}
    >
      <span className="flex items-center justify-between">
        <span
          className={cn(
            "grid h-9 w-9 place-items-center rounded-[11px]",
            izabran ? "bg-gradient-brand text-white" : "bg-primary-soft text-primary-soft-foreground",
          )}
        >
          <Ikona className="h-[17px] w-[17px]" strokeWidth={2} />
        </span>
        <Oznaka className={cn("h-[18px] w-[18px]", izabran ? "text-primary-soft-foreground" : "text-muted-foreground")} />
      </span>
      <span className="text-[14px] font-semibold">{naslov}</span>
      <span className="text-[12px] leading-snug text-muted-foreground">{opis}</span>
    </button>
  );
}

/** Izgled notifikacije u pregledu "Ovako stiže". */
export const Obavestenje = ({ naslov, tekst }: { naslov: string; tekst?: string | null }) => (
  <div className="flex items-start gap-3 rounded-[20px] border border-white/10 bg-background/60 p-3.5 backdrop-blur">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-gradient-brand">
      <BrandGlyph className="h-3 text-white" />
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-muted-foreground">FitLink</span>
        <span className="text-[11px] text-muted-foreground">sada</span>
      </div>
      <div className={cn("mt-0.5 text-[14px] font-semibold leading-snug", !tekst && "text-muted-foreground")}>{naslov}</div>
      {tekst && <div className="mt-0.5 whitespace-pre-line text-[12.5px] leading-snug text-muted-foreground">{tekst}</div>}
    </div>
  </div>
);

export const OkvirPregleda = ({ naslov, children }: { naslov: string; children: ReactNode }) => (
  <section
    className="space-y-2.5 rounded-[24px] p-4 ring-1 ring-hairline"
    style={{ background: "var(--gradient-brand-soft)" }}
  >
    <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-primary-soft-foreground">
      <Eye className="h-3 w-3" strokeWidth={2.5} />
      {naslov}
    </div>
    {children}
  </section>
);

/** Racunar: podesavanja levo, pregled desno i stalno na oku. Telefon: jedna kolona, pregled prvi. */
export function Raspored({ pregled, children }: { pregled: ReactNode; children: ReactNode }) {
  const desktop = useDesktopWeb();
  const zona = useZakljucanaZona();
  if (!desktop) {
    return (
      <div {...zona} className="space-y-4 pb-24">
        {pregled}
        {children}
      </div>
    );
  }
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
      <div className="xl:sticky xl:top-[88px] xl:col-start-2 xl:row-start-1 xl:max-h-[calc(100vh-112px)] xl:overflow-y-auto">
        {pregled}
      </div>
      <div {...zona} className="min-w-0 space-y-4 xl:col-start-1 xl:row-start-1">{children}</div>
    </div>
  );
}

export const Ucitavanje = () => (
  <div className="flex justify-center py-16" role="status" aria-label="Učitavanje">
    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  </div>
);

export const NijeUcitano = ({ ponovo }: { ponovo: () => void }) => (
  <div className="card-premium flex flex-col items-center gap-3 rounded-[22px] px-6 py-10 text-center">
    <p className="text-[14px] font-semibold">Podešavanja nisu učitana.</p>
    <button
      type="button"
      onClick={ponovo}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-hairline bg-surface-2 px-4 text-[13px] font-semibold transition hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <RotateCw className="h-3.5 w-3.5" strokeWidth={2.25} />
      Pokušaj ponovo
    </button>
  </div>
);
