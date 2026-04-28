import { Link } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card, IconButton, ProgressBar, SectionTitle, StatCard } from "@/components/ui-bits";
import { Bell, Play, CalendarPlus, Apple } from "lucide-react";
import { athleteProfile, athleteWorkout } from "@/data/mock";

const Home = () => {
  return (
    <>
      <PhoneShell
        hasBottomNav
        eyebrow="Dobro došao nazad"
        title={
          <h1 className="font-display text-[34px] leading-[1.05] font-bold tracking-tightest">
            Zdravo, {athleteProfile.name}
            <span className="text-gradient-brand"> 💪</span>
          </h1>
        }
        rightSlot={
          <IconButton aria-label="Notifikacije">
            <Bell className="h-[18px] w-[18px]" />
          </IconButton>
        }
      >
        {/* Hero — sledeći trening */}
        <Link to="/vezbac/trening" className="block">
          <Card className="p-5 bg-gradient-brand text-white border-0 shadow-brand relative overflow-hidden">
            <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="relative">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80 mb-2">
                Sledeći trening
              </div>
              <div className="font-display text-[26px] font-bold tracking-tighter leading-tight">
                {athleteWorkout.title}
              </div>
              <div className="text-[13px] text-white/85 mt-1.5">
                Danas u 10:00 · Trener {athleteProfile.trainerName.split(" ")[0]}
              </div>

              <div className="mt-4">
                <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-white rounded-full" style={{ width: `${athleteWorkout.progressPct}%` }} />
                </div>
                <div className="flex justify-between mt-1.5 text-[11px] text-white/80">
                  <span>{athleteWorkout.progressLabel}</span>
                  <span>{athleteWorkout.progressPct}%</span>
                </div>
              </div>

              <div className="mt-5 inline-flex items-center gap-2 bg-white text-foreground rounded-full px-4 py-2 text-[13px] font-bold shadow-soft">
                <Play className="h-3.5 w-3.5 fill-foreground" /> Počni trening
              </div>
            </div>
          </Card>
        </Link>

        <div className="grid grid-cols-2 gap-3">
          <StatCard tone="brand" value="8" unit="treninga" label="Ovog meseca" />
          <StatCard tone="success" value={athleteProfile.daysLeft} unit="dana" label="Do isteka" />
        </div>

        {/* PR teaser */}
        <section>
          <SectionTitle action={<Link to="/vezbac/napredak" className="text-[12px] font-semibold text-primary">Napredak →</Link>}>
            Tvoji rekordi
          </SectionTitle>
          <Card className="p-5 space-y-4">
            <ProgressBar label="Bench Press" trailing={<>🔥 95 kg</>} value={72} tone="brand" />
            <ProgressBar label="Squat" trailing={<>🔥 120 kg</>} value={85} tone="brand" />
            <ProgressBar label="Deadlift" trailing={<>🔥 145 kg</>} value={92} tone="brand" />
          </Card>
        </section>

        <Link
          to="/vezbac/ishrana"
          className="flex items-center gap-3 card-premium-hover px-5 py-4"
        >
          <div className="h-11 w-11 rounded-2xl bg-gradient-brand-soft text-primary flex items-center justify-center">
            <Apple className="h-[18px] w-[18px]" />
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-semibold tracking-tight">Plan ishrane</div>
            <div className="text-[12.5px] text-muted-foreground">Današnji obroci i log</div>
          </div>
          <span className="text-muted-foreground">→</span>
        </Link>

        <Link
          to="/vezbac/rezervacija"
          className="flex items-center gap-3 card-premium-hover px-5 py-4"
        >
          <div className="h-11 w-11 rounded-2xl bg-trainer-soft text-trainer-soft-foreground flex items-center justify-center">
            <CalendarPlus className="h-[18px] w-[18px]" />
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-semibold tracking-tight">Rezerviši termin</div>
            <div className="text-[12.5px] text-muted-foreground">Pogledaj dostupne slotove</div>
          </div>
          <span className="text-muted-foreground">→</span>
        </Link>
      </PhoneShell>
      <BottomNav role="athlete" />
    </>
  );
};

export default Home;
