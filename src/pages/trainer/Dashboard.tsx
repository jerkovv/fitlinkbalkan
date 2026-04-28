import { Link } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Avatar, Card, Chip, IconButton, SectionTitle, StatCard } from "@/components/ui-bits";
import { Bell, Clock, ChevronRight, Plus } from "lucide-react";
import { trainerProfile, todaySessions } from "@/data/mock";

const statusChip = {
  active: <Chip tone="success">Aktivno</Chip>,
  confirmed: <Chip tone="info">Potvrđeno</Chip>,
  pending: <Chip tone="warning">Čeka</Chip>,
};

const Dashboard = () => {
  return (
    <>
      <PhoneShell
        hasBottomNav
        eyebrow={`Dobro došao nazad`}
        title={
          <h1 className="font-display text-[34px] leading-[1.05] font-bold tracking-tightest">
            Zdravo, {trainerProfile.name}
            <span className="text-gradient-brand"> 👋</span>
          </h1>
        }
        rightSlot={
          <IconButton aria-label="Notifikacije">
            <Bell className="h-[18px] w-[18px]" strokeWidth={2} />
          </IconButton>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <StatCard tone="brand" value="12" unit="članova" label="Aktivnih" />
          <StatCard tone="warning" value="3" unit="ističu" label="Uskoro" />
        </div>

        <section>
          <SectionTitle action={<button className="text-[12px] font-semibold text-primary">Sve →</button>}>
            Danas, 16. April
          </SectionTitle>

          <ul className="space-y-2">
            {todaySessions.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/trener/vezbaci/${s.id}`}
                  className="flex items-center gap-3 card-premium-hover px-4 py-3.5"
                >
                  <div className="h-11 w-11 rounded-2xl bg-gradient-brand-soft text-primary-soft-foreground flex items-center justify-center">
                    <Clock className="h-[18px] w-[18px]" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-semibold leading-tight tracking-tight">
                      {s.time} · {s.athleteName}
                    </div>
                    <div className="text-[12.5px] text-muted-foreground mt-0.5">{s.workout}</div>
                  </div>
                  {statusChip[s.status]}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <Card className="p-4 bg-gradient-brand-soft border-0">
          <div className="flex items-center gap-3">
            <Avatar initials="MJ" tone="brand" size="md" />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold tracking-tight">{trainerProfile.studio}</div>
              <div className="text-[12px] text-muted-foreground">
                Tvoj invite kod: <span className="font-semibold text-foreground tracking-wider">{trainerProfile.inviteCode}</span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </Card>

        <Link
          to="/trener/program"
          className="flex items-center justify-center gap-2 w-full rounded-2xl border border-dashed border-hairline hover:border-primary/40 hover:bg-primary-soft/40 py-4 text-[14px] font-semibold text-muted-foreground hover:text-primary-soft-foreground transition"
        >
          <Plus className="h-4 w-4" /> Novi program
        </Link>
      </PhoneShell>
      <BottomNav role="trainer" />
    </>
  );
};

export default Dashboard;
