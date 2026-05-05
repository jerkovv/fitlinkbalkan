import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  count: number;
  dayName: string;
  loading: boolean;
  onConfirm: () => void;
};

export const SelectionActionBar = ({ count, dayName, loading, onConfirm }: Props) => {
  const disabled = count === 0 || loading;
  return (
    <div className="absolute bottom-0 inset-x-0 z-10 bg-gradient-to-t from-background via-background/95 to-transparent pt-6 pb-7 px-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold">
          <span className="text-primary font-bold tnum">{count}</span>{" "}
          <span className="text-foreground">izabrano</span>
        </div>
        <div className="text-xs text-muted-foreground truncate">
          Dan: {dayName || "-"}
        </div>
      </div>
      <button
        disabled={disabled}
        onClick={onConfirm}
        className={cn(
          "h-12 rounded-full px-6 font-semibold flex items-center gap-2 transition shrink-0",
          disabled
            ? "bg-surface-2 text-muted-foreground shadow-none"
            : "bg-gradient-brand text-primary-foreground shadow-brand active:scale-[0.98]"
        )}
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <>
            {count === 0 ? "Izaberi vežbe" : "Dodaj u trening"}
            {count > 0 && <ArrowRight size={16} />}
          </>
        )}
      </button>
    </div>
  );
};
