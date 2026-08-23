import { Lock } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Neutralna cinjenica iz statusa pretplate ("Pretplata je istekla." i sl.). */
  fact: string | null;
}

// Objasnjenje zasto je akcija zakljucana. NAMERNO bez cene, linka i dugmeta ka
// placanju - kupovina se ne nudi u aplikaciji (vidi TrainerLayout).
export const PretplataLockSheet = ({ open, onOpenChange, fact }: Props) => (
  <Drawer open={open} onOpenChange={onOpenChange}>
    {/* Iznad full-screen sloja (z-100). Objasnjenje zakljucane akcije se okida i
        iz sheet-ova, a na z-50 bi ostalo ispod njih - dugme bi izgledalo mrtvo. */}
    <DrawerContent className="z-[120]" overlayClassName="z-[120]">
      <DrawerHeader>
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft">
          <Lock className="h-6 w-6 text-primary" strokeWidth={2.2} />
        </div>
        <DrawerTitle className="text-center">Nemaš aktivnu pretplatu</DrawerTitle>
        <DrawerDescription className="text-center">
          Možeš da razgledaš aplikaciju, ali izmene su zaključane.
          {fact ? ` ${fact}` : ""}
        </DrawerDescription>
      </DrawerHeader>
      <DrawerFooter>
        <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
          U redu
        </Button>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
);

export default PretplataLockSheet;
