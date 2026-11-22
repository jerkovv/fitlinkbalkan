import { Check, Lock } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { adresaPretplate } from "./adresaPretplate";
import type { OblastZakljucanja } from "./oblastiZakljucanja";
import type { ZakljucanKontekst } from "./PretplataLockContext";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Neutralna cinjenica iz statusa pretplate ("Pretplata je istekla." i sl.). */
  fact: string | null;
  /** Oblast u kojoj je trener: naslov, tekst i sta se otkljucava. */
  oblast: OblastZakljucanja;
  /** Posebna radnja (npr. snimak vezbe); ima prednost nad oblascu. */
  kontekst?: ZakljucanKontekst | null;
}

// Jedno objasnjenje za svaku zakljucanu radnju. Put do placanja postoji SAMO na racunaru
// (fitlink.rs/dashboard). U aplikaciji i na telefonu nema cene, linka ni dugmeta ka
// placanju, jer se kupovina tamo ne sme nuditi (vidi TrainerLayout).
export const PretplataLockSheet = ({ open, onOpenChange, fact, oblast, kontekst }: Props) => {
  const desktop = useDesktopWeb();
  const Ikona = kontekst?.ikona ?? oblast.ikona;
  const naslov = kontekst?.naslov ?? oblast.naslov;
  const tekst = kontekst?.tekst ?? oblast.tekst;
  const stavke = kontekst?.stavke ?? oblast.stavke;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* Iznad full-screen sloja (z-100). Objasnjenje zakljucane akcije se okida i
          iz sheet-ova, a na z-50 bi ostalo ispod njih - dugme bi izgledalo mrtvo. */}
      <DrawerContent className="z-[120]" overlayClassName="z-[120]">
        {kontekst?.slika ? (
          <div className="relative mx-4 mt-4 h-44 shrink-0 overflow-hidden rounded-2xl bg-white">
            <img src={kontekst.slika} alt={kontekst.naziv ?? ""} className="h-full w-full object-contain" />
            <span className="absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-brand shadow-brand">
              <Lock className="h-4 w-4 text-white" strokeWidth={2.4} />
            </span>
          </div>
        ) : (
          <div className="relative mx-auto mt-6 flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[22px] bg-gradient-brand shadow-brand">
            <Ikona className="h-8 w-8 text-white" strokeWidth={1.9} />
            <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-background ring-1 ring-hairline">
              <Lock className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} />
            </span>
          </div>
        )}
        <DrawerHeader>
          {fact && (
            <p className="mb-1 text-center text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
              {fact.replace(/\.$/, "")}
            </p>
          )}
          <DrawerTitle className="text-center">{naslov}</DrawerTitle>
          <DrawerDescription className="text-center">{tekst}</DrawerDescription>
        </DrawerHeader>
        <ul className="mx-4 mb-1 divide-y divide-hairline rounded-2xl border border-hairline bg-surface">
          {stavke.map((s) => (
            <li key={s} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px] font-medium">
              <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.6} />
              {s}
            </li>
          ))}
        </ul>
        <DrawerFooter>
          {desktop ? (
            <>
              <Button asChild size="lg" className="bg-gradient-brand font-semibold text-white shadow-brand hover:opacity-95">
                <a href={adresaPretplate()}>Izaberi plan</a>
              </Button>
              <Button variant="ghost" size="lg" onClick={() => onOpenChange(false)}>
                Ne sada
              </Button>
            </>
          ) : (
            <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
              Razumem
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default PretplataLockSheet;
