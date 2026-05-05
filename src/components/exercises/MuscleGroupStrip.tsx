import { MUSCLE_GROUPS, type MuscleGroupId } from "@/lib/muscleGroups";
import { MuscleGroupIcon } from "./MuscleGroupIcon";
import { cn } from "@/lib/utils";

type Props = {
  active: MuscleGroupId;
  onChange: (id: MuscleGroupId) => void;
};

export const MuscleGroupStrip = ({ active, onChange }: Props) => (
  <div className="overflow-x-auto no-scrollbar flex gap-1 px-3 py-3 border-b border-hairline">
    {MUSCLE_GROUPS.map((g) => {
      const isActive = active === g.id;
      return (
        <button
          key={g.id}
          onClick={() => onChange(g.id)}
          className={cn(
            "w-[76px] flex flex-col items-center gap-2 p-2 rounded-2xl shrink-0 transition-colors",
            isActive ? "bg-primary-soft" : "hover:bg-surface-2"
          )}
        >
          <div className="h-14 w-14 flex items-center justify-center">
            <MuscleGroupIcon muscle={g.id} active={isActive} />
          </div>
          <span
            className={cn(
              "text-[11px] leading-tight text-center",
              isActive
                ? "text-primary-soft-foreground font-bold"
                : "text-muted-foreground font-semibold"
            )}
          >
            {g.label}
          </span>
        </button>
      );
    })}
  </div>
);
