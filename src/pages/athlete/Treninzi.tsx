import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { WorkoutsList } from "@/components/wearables/WorkoutsList";

const Treninzi = () => {
  return (
    <>
      <PhoneShell
        hasBottomNav
        back="/vezbac/profil"
        eyebrow="Sa sata"
        title="Svi treninzi"
      >
        <WorkoutsList limit={50} />
      </PhoneShell>
      <BottomNav role="athlete" />
    </>
  );
};

export default Treninzi;
