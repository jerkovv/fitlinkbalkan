import { MUSCLE_GROUPS, type MuscleGroupId } from "@/lib/muscleGroups";
import { muscleIcon } from "@/lib/muscleIcons";
import { MuscleGroupIcon } from "./MuscleGroupIcon";
import { cn } from "@/lib/utils";

type Props = {
  /** null = nijedna grupa (npr. dok pretraga ide kroz sve grupe). */
  active: MuscleGroupId | null;
  onChange: (id: MuscleGroupId) => void;
};

/**
 * Misicne grupe kao uspravna kolona - desktop verzija MuscleGroupStrip-a. Na sirokom
 * ekranu sve grupe stanu odjednom, pa nista ne ostaje skriveno iza strelica kao u traci.
 */
export const MuscleGroupRail = ({ active, onChange }: Props) => (
  <nav aria-label="Mišićne grupe" className="flex flex-col gap-0.5 p-2">
    {MUSCLE_GROUPS.map((g) => {
      const isActive = active === g.id;
      // Nas chip za misicne/kardio grupe; null (Omiljeno) -> bookmark ikonica.
      const icon = muscleIcon(g.id);
      return (
        <button
          key={g.id}
          type="button"
          onClick={() => onChange(g.id)}
          aria-current={isActive || undefined}
          className={cn(
            // Visina stavke je odmerena da svih 14 grupa stane u prozor bez skrola.
            "flex items-center gap-3 rounded-xl px-2.5 py-1 text-left transition-colors",
            isActive
              ? "bg-primary-soft text-primary-soft-foreground font-bold"
              : "text-foreground/80 font-semibold hover:bg-surface-2",
          )}
        >
          <span className="h-8 w-8 shrink-0 flex items-center justify-center">
            {icon ? (
              <img src={icon} alt="" className="h-8 w-8 rounded-full" />
            ) : (
              <MuscleGroupIcon muscle={g.id} active={isActive} />
            )}
          </span>
          <span className="text-[13.5px] truncate">{g.label}</span>
        </button>
      );
    })}
  </nav>
);
