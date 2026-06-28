import { ReactNode } from "react";
import { Lock, MessageCircle } from "lucide-react";
import { useClanarinaLock } from "./useClanarinaLock";

interface Props {
  active: boolean;
  children: ReactNode;
  label?: string;
}

// Tizer: sadrzaj se vidi ali blurovan i netaktilan; preko njega taktilan overlay
// (Lock + label + "Piši treneru") koji otvara zajednicki lock sheet.
export const PremiumBlur = ({ active, children, label = "Ishrana je zaključana" }: Props) => {
  const { openLock } = useClanarinaLock();

  if (!active) return <>{children}</>;

  return (
    <div className="relative">
      <div
        aria-hidden
        className="select-none"
        style={{ filter: "blur(6px)", opacity: 0.6, pointerEvents: "none" }}
      >
        {children}
      </div>

      <div
        className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center"
        style={{ pointerEvents: "auto" }}
        role="button"
        onClick={openLock}
      >
        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
          <Lock className="h-6 w-6 text-primary" strokeWidth={2.2} />
        </div>
        <div className="font-display text-[16px] font-bold tracking-tight text-foreground">
          {label}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            openLock();
          }}
          className="mt-4 inline-flex items-center justify-center gap-2 h-10 px-5 rounded-2xl bg-gradient-brand text-white font-semibold text-[13.5px] shadow-brand active:scale-[0.98] transition"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={2.2} />
          Piši treneru
        </button>
      </div>
    </div>
  );
};

export default PremiumBlur;
