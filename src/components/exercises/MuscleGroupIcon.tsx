import { Bookmark, HeartPulse } from "lucide-react";
import type { MuscleGroupId } from "@/lib/muscleGroups";

type Props = { muscle: MuscleGroupId; active?: boolean };

const BASE = "hsl(var(--muted-foreground) / 0.22)";
const ACTIVE = "hsl(var(--primary))";

export const MuscleGroupIcon = ({ muscle, active }: Props) => {
  if (muscle === "favorites") {
    return (
      <Bookmark
        className={active ? "text-primary" : "text-muted-foreground"}
        size={24}
        strokeWidth={2}
        fill={active ? "currentColor" : "none"}
      />
    );
  }
  if (muscle === "kardio") {
    return (
      <HeartPulse
        className={active ? "text-primary" : "text-muted-foreground"}
        size={24}
        strokeWidth={2}
      />
    );
  }

  const c = (m: MuscleGroupId) => (muscle === m ? ACTIVE : BASE);

  // Simple front-body silhouette, 56x56 viewBox
  return (
    <svg viewBox="0 0 56 56" width={48} height={48} fill="none">
      {/* head */}
      <circle cx="28" cy="9" r="5" fill={BASE} />
      {/* neck */}
      <rect x="26" y="13" width="4" height="3" fill={BASE} />
      {/* torso base */}
      <rect x="18" y="16" width="20" height="20" rx="4" fill={BASE} />
      {/* hips/pelvis */}
      <rect x="20" y="34" width="16" height="6" rx="2" fill={c("core")} opacity={muscle === "core" ? 1 : 0.6} />
      {/* arms upper (shoulders) */}
      <ellipse cx="14" cy="19" rx="4" ry="5" fill={c("ramena")} />
      <ellipse cx="42" cy="19" rx="4" ry="5" fill={c("ramena")} />
      {/* biceps */}
      <rect x="10" y="22" width="5" height="9" rx="2" fill={c("biceps")} />
      <rect x="41" y="22" width="5" height="9" rx="2" fill={c("biceps")} />
      {/* podlaktice */}
      <rect x="9" y="31" width="5" height="9" rx="2" fill={c("podlaktice")} />
      <rect x="42" y="31" width="5" height="9" rx="2" fill={c("podlaktice")} />
      {/* grudi */}
      <rect x="19" y="17" width="18" height="9" rx="3" fill={c("grudi")} />
      {/* ledja overlay (subtle bar across upper back position) */}
      {muscle === "ledja" && (
        <rect x="19" y="17" width="18" height="14" rx="3" fill={ACTIVE} opacity="0.85" />
      )}
      {/* triceps - back of arms, hint with dots on outer arm */}
      {muscle === "triceps" && (
        <>
          <rect x="10" y="22" width="5" height="9" rx="2" fill={ACTIVE} />
          <rect x="41" y="22" width="5" height="9" rx="2" fill={ACTIVE} />
        </>
      )}
      {/* core highlight */}
      {muscle === "core" && (
        <rect x="22" y="26" width="12" height="10" rx="2" fill={ACTIVE} />
      )}
      {/* legs */}
      <rect x="20" y="40" width="6" height="11" rx="2" fill={c("kvadriceps")} />
      <rect x="30" y="40" width="6" height="11" rx="2" fill={c("kvadriceps")} />
      {/* zadnja loza overlay */}
      {muscle === "zadnja_loza" && (
        <>
          <rect x="20" y="40" width="6" height="11" rx="2" fill={ACTIVE} opacity="0.85" />
          <rect x="30" y="40" width="6" height="11" rx="2" fill={ACTIVE} opacity="0.85" />
        </>
      )}
      {/* glutei */}
      {muscle === "glutei" && (
        <>
          <ellipse cx="24" cy="40" rx="4" ry="3" fill={ACTIVE} />
          <ellipse cx="32" cy="40" rx="4" ry="3" fill={ACTIVE} />
        </>
      )}
      {/* listovi (calves) */}
      <rect x="21" y="51" width="4" height="3" rx="1" fill={c("listovi")} />
      <rect x="31" y="51" width="4" height="3" rx="1" fill={c("listovi")} />
    </svg>
  );
};
