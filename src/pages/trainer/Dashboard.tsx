import { Link } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { StatCard, Chip } from "@/components/ui-bits";
import { Clock, Bell } from "lucide-react";
import { trainerProfile, todaySessions } from "@/data/mock";

const statusChip = {
  active: <Chip tone="success">aktiv.</Chip>,
  confirmed: <Chip tone="info">potvrđ.</Chip>,
  pending: <Chip tone="warning">čeka</Chip>,
};

const Dashboard = () => {
  return (
    <>
      <PhoneShell
        title={`Zdravo, ${trainerProfile.name} 👋`}
        variant="trainer"
        rightSlot={
          <button className="rounded-full bg-surface-3 p-2 text-muted-foreground hover:text-foreground" aria-label="Notifikacije">
            <Bell className="h-4 w-4" />
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-3 mb-6">
          <StatCard tone="trainer" value="12" label="aktivnih članova" />
          <StatCard tone="warning" value="3" label="ističe uskoro" />
        </div>

        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
          Danas — 16. April
        </div>

        <ul className="space-y-2">
          {todaySessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-xl bg-surface border border-border/60 p-3"
            >
              <div className="h-9 w-9 rounded-lg bg-primary-soft flex items-center justify-center text-primary-soft-foreground">
                <Clock className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">
                  {s.time} — {s.athleteName}
                </div>
                <div className="text-xs text-muted-foreground truncate">{s.workout}</div>
              </div>
              {statusChip[s.status]}
            </li>
          ))}
        </ul>

        <Link
          to="/trener/program"
          className="mt-5 block w-full text-center rounded-xl bg-primary-soft text-primary-soft-foreground font-bold py-3 text-sm hover:bg-primary/30 transition"
        >
          + Novi program
        </Link>
      </PhoneShell>
      <BottomNav role="trainer" />
    </>
  );
};

export default Dashboard;
