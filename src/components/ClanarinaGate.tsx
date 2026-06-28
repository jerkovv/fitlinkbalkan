import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Loader2, MessageCircle } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { useMembershipAccess, type MembershipState } from "@/hooks/useMembershipAccess";

// Zakljucava srz vezbaceve app-a kad nema aktivnu clanarinu. Trener se ne zakljucava
// (hook to resava). Brendiran ekran, bez crvene/error boje.

const TITLES: Record<MembershipState, string> = {
  active: "",
  expired: "Članarina ti je istekla",
  none: "Nemaš aktivnu članarinu",
  paused: "Članarina je pauzirana",
  cancelled: "Članarina je otkazana",
};

function bodyText(state: MembershipState, name: string | null): string {
  const ime = name ? ` ${name}` : "";
  switch (state) {
    case "expired":
      return `Obnovi članarinu kod trenera${ime} da nastaviš sa treninzima i ishranom.`;
    case "paused":
      return `Tvoj trener${ime} je pauzirao članarinu. Javite se da je ponovo aktivirate.`;
    case "cancelled":
      return `Javi se treneru${ime} da obnoviš članarinu.`;
    case "none":
    default:
      return `Javi se treneru${ime} da ti aktivira članarinu i otključa treninge i ishranu.`;
  }
}

// "2026-07-05" -> "5.7.2026."
function fmtDate(s: string | null): string | null {
  if (!s) return null;
  const parts = s.slice(0, 10).split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  return `${parseInt(d, 10)}.${parseInt(m, 10)}.${y}.`;
}

export const ClanarinaGate = ({ children }: { children: ReactNode }) => {
  const { loading, hasAccess, state, endsOn, trainerId, trainerName } = useMembershipAccess();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (hasAccess) return <>{children}</>;

  const expiredOn = state === "expired" ? fmtDate(endsOn) : null;

  return (
    <div className="h-[100dvh] overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-[440px] min-h-full flex flex-col items-center justify-center px-7 pb-28 text-center">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
          <Lock className="h-7 w-7 text-primary" strokeWidth={2.2} />
        </div>

        <h1 className="font-display text-[26px] leading-tight font-bold tracking-tight text-foreground">
          {TITLES[state] || "Nemaš aktivnu članarinu"}
        </h1>

        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground max-w-[320px]">
          {bodyText(state, trainerName)}
        </p>

        {expiredOn && (
          <p className="mt-2 text-[13px] text-muted-foreground/70">Istekla {expiredOn}</p>
        )}

        {trainerId && (
          <button
            onClick={() => navigate("/vezbac/chat")}
            className="mt-8 inline-flex items-center justify-center gap-2 h-12 px-6 rounded-2xl bg-gradient-brand text-white font-semibold text-[15px] shadow-brand active:scale-[0.98] transition"
          >
            <MessageCircle className="h-[18px] w-[18px]" strokeWidth={2.2} />
            Piši treneru
          </button>
        )}
      </div>

      <BottomNav role="athlete" />
    </div>
  );
};

export default ClanarinaGate;
