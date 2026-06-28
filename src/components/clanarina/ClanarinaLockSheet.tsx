import { useNavigate } from "react-router-dom";
import { Lock, MessageCircle } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import type { MembershipState } from "@/hooks/useMembershipAccess";

const TITLES: Record<MembershipState, string> = {
  active: "",
  expired: "Članarina ti je istekla",
  none: "Nemaš aktivnu članarinu",
  paused: "Članarina je pauzirana",
  cancelled: "Članarina je otkazana",
};

// "2026-07-05" -> "5.7.2026."
function fmtDate(s: string | null): string | null {
  if (!s) return null;
  const p = s.slice(0, 10).split("-");
  if (p.length !== 3) return null;
  return `${parseInt(p[2], 10)}.${parseInt(p[1], 10)}.${p[0]}.`;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  state: MembershipState;
  endsOn: string | null;
  trainerId: string | null;
  trainerName: string | null;
}

export const ClanarinaLockSheet = ({
  open,
  onOpenChange,
  state,
  endsOn,
  trainerId,
  trainerName,
}: Props) => {
  const navigate = useNavigate();
  const ime = trainerName ? ` ${trainerName}` : "";
  const expiredOn = state === "expired" ? fmtDate(endsOn) : null;

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent>
        <DrawerHeader className="items-center text-center">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-1">
            <Lock className="h-6 w-6 text-primary" strokeWidth={2.2} />
          </div>
          <DrawerTitle className="font-display text-[22px] font-bold tracking-tight">
            {TITLES[state] || "Nemaš aktivnu članarinu"}
          </DrawerTitle>
          <DrawerDescription className="text-[14.5px] leading-relaxed text-muted-foreground max-w-[340px]">
            Da otključaš treninge, ishranu i zakazivanje, obnovi članarinu kod trenera{ime}.
          </DrawerDescription>
          {expiredOn && (
            <div className="text-[13px] text-muted-foreground/70 mt-1">Istekla {expiredOn}</div>
          )}
        </DrawerHeader>
        <DrawerFooter className="gap-2">
          {trainerId && (
            <button
              onClick={() => go("/vezbac/chat")}
              className="inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-gradient-brand text-white font-semibold text-[15px] shadow-brand active:scale-[0.98] transition"
            >
              <MessageCircle className="h-[18px] w-[18px]" strokeWidth={2.2} />
              Piši treneru
            </button>
          )}
          <button
            onClick={() => go("/vezbac/clanarina")}
            className="h-11 rounded-2xl text-[14px] font-semibold text-muted-foreground hover:text-foreground transition"
          >
            Pogledaj članarinu
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default ClanarinaLockSheet;
