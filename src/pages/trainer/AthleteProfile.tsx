import { Link, useParams } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { Avatar, Card, Chip, ProgressBar, SectionTitle } from "@/components/ui-bits";
import { ClipboardList, Wallet, MessageSquare, Phone } from "lucide-react";
import { athletes } from "@/data/mock";

const AthleteProfile = () => {
  const { id } = useParams();
  const athlete = athletes.find((a) => a.id === id) ?? athletes[0];

  return (
    <PhoneShell
      back="/trener/vezbaci"
      title={
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
            Profil vežbača
          </div>
          <h1 className="font-display text-[28px] leading-[1.1] font-bold tracking-tightest">{athlete.name}</h1>
        </div>
      }
    >
      {/* Hero */}
      <Card className="p-5 bg-gradient-brand-soft border-0">
        <div className="flex items-center gap-4">
          <Avatar initials={athlete.initials} tone="brand" size="xl" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              <Chip tone="success">Aktivan</Chip>
              <Chip tone="info">{athlete.program}</Chip>
            </div>
            <div className="text-[13px] text-muted-foreground">{athlete.expiresLabel}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-5">
          <button className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-surface/80 backdrop-blur hover:bg-surface transition">
            <MessageSquare className="h-4 w-4 text-foreground" strokeWidth={2} />
            <span className="text-[11px] font-semibold">Poruka</span>
          </button>
          <button className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-surface/80 backdrop-blur hover:bg-surface transition">
            <Phone className="h-4 w-4 text-foreground" strokeWidth={2} />
            <span className="text-[11px] font-semibold">Pozovi</span>
          </button>
          <Link
            to="/trener/program"
            className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-surface/80 backdrop-blur hover:bg-surface transition"
          >
            <ClipboardList className="h-4 w-4 text-foreground" strokeWidth={2} />
            <span className="text-[11px] font-semibold">Program</span>
          </Link>
        </div>
      </Card>

      {/* PRs */}
      <section>
        <SectionTitle>Personal Records</SectionTitle>
        <Card className="p-5 space-y-4">
          {athlete.prs.map((pr) => (
            <ProgressBar
              key={pr.lift}
              label={pr.lift}
              trailing={<>🔥 {pr.weight} kg</>}
              value={pr.progress}
              tone="brand"
            />
          ))}
        </Card>
      </section>

      {/* Action */}
      <Link
        to={`/trener/uplata/${athlete.id}`}
        className="flex items-center justify-between card-premium-hover px-5 py-4"
      >
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-success-soft text-success-soft-foreground flex items-center justify-center">
            <Wallet className="h-[18px] w-[18px]" strokeWidth={2} />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight">Evidentiraj uplatu</div>
            <div className="text-[12.5px] text-muted-foreground">Mesečna · 5.000 RSD</div>
          </div>
        </div>
        <span className="text-muted-foreground">→</span>
      </Link>
    </PhoneShell>
  );
};

export default AthleteProfile;
