import { Link } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { StatCard } from "@/components/ui-bits";
import { Play, Bell } from "lucide-react";
import { athleteProfile, athleteWorkout } from "@/data/mock";

const Home = () => {
  return (
    <>
      <PhoneShell
        title={`Zdravo, ${athleteProfile.name} 💪`}
        variant="athlete"
        rightSlot={
          <button className="rounded-full bg-surface-3 p-2 text-muted-foreground hover:text-foreground" aria-label="Notifikacije">
            <Bell className="h-4 w-4" />
          </button>
        }
      >
        <div className="rounded-2xl bg-gradient-card-athlete border border-accent/30 p-4 mb-4 shadow-athlete">
          <div className="text-[10px] uppercase tracking-widest text-accent-soft-foreground mb-1">
            Sledeći trening
          </div>
          <div className="text-lg font-bold text-white">{athleteWorkout.title}</div>
          <div className="text-xs text-accent-soft-foreground mt-1">
            Danas u 10:00 · Trener: {athleteProfile.trainerName.split(" ")[0]}
          </div>
          <div className="h-1.5 bg-white/10 rounded-full mt-3 overflow-hidden">
            <div
              className="h-full bg-accent-bright rounded-full"
              style={{ width: `${athleteWorkout.progressPct}%` }}
            />
          </div>
          <div className="text-[10px] text-accent-soft-foreground mt-1.5">
            {athleteWorkout.progressLabel}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <StatCard tone="warning" value="8" label="treninga ovog mes." />
          <StatCard tone="success" value={athleteProfile.daysLeft} label="dana do isteka" />
        </div>

        <Link
          to="/vezbac/trening"
          className="w-full rounded-xl bg-gradient-athlete text-white font-bold py-4 shadow-athlete hover:opacity-95 transition flex items-center justify-center gap-2"
        >
          <Play className="h-5 w-5 fill-white" /> POČNI TRENING
        </Link>

        <Link
          to="/vezbac/rezervacija"
          className="mt-3 block w-full text-center rounded-xl bg-surface border border-border/60 hover:border-accent/50 font-semibold py-3 text-sm transition"
        >
          📅 Rezerviši termin
        </Link>
      </PhoneShell>
      <BottomNav role="athlete" />
    </>
  );
};

export default Home;
