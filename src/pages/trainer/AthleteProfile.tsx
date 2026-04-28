import { Link, useParams } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { Avatar, Chip, ProgressBar } from "@/components/ui-bits";
import { ClipboardList, Wallet } from "lucide-react";
import { athletes } from "@/data/mock";

const AthleteProfile = () => {
  const { id } = useParams();
  const athlete = athletes.find((a) => a.id === id) ?? athletes[0];

  return (
    <PhoneShell title={athlete.name} back="/trener/vezbaci" variant="trainer">
      <div className="flex items-center gap-3 mb-5">
        <Avatar initials={athlete.initials} tone="trainer" size="lg" />
        <div>
          <div className="text-base font-bold">{athlete.name}</div>
          <div className="flex gap-1.5 mt-1">
            <Chip tone="success">Aktivan</Chip>
            <Chip tone="info">{athlete.program}</Chip>
          </div>
        </div>
      </div>

      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
        Personal Records
      </div>
      <div className="space-y-3 rounded-xl bg-surface border border-border/60 p-4 mb-5">
        {athlete.prs.map((pr) => (
          <ProgressBar
            key={pr.lift}
            label={pr.lift}
            trailing={<>🔥 {pr.weight}kg PR</>}
            value={pr.progress}
            tone="trainer"
          />
        ))}
      </div>

      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Akcije</div>
      <div className="grid grid-cols-2 gap-2">
        <Link
          to="/trener/program"
          className="rounded-xl bg-primary-soft text-primary-soft-foreground py-3 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary/30 transition"
        >
          <ClipboardList className="h-4 w-4" /> Program
        </Link>
        <Link
          to={`/trener/uplata/${athlete.id}`}
          className="rounded-xl bg-success-soft text-success-soft-foreground py-3 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-success/25 transition"
        >
          <Wallet className="h-4 w-4" /> Uplata
        </Link>
      </div>
    </PhoneShell>
  );
};

export default AthleteProfile;
