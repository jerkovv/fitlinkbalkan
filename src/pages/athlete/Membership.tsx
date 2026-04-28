import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { athleteProfile } from "@/data/mock";

const Membership = () => {
  const pct = Math.round((athleteProfile.daysLeft / athleteProfile.daysTotal) * 100);
  const used = athleteProfile.daysTotal - athleteProfile.daysLeft;

  return (
    <>
      <PhoneShell title="💳 Članarina" variant="athlete">
        <div className="rounded-2xl bg-gradient-card-success border border-success/30 p-5 mb-5 shadow-success">
          <div className="text-[10px] uppercase tracking-widest text-success-soft-foreground mb-1">
            Aktivan paket
          </div>
          <div className="text-lg font-bold text-white">
            {athleteProfile.planName} — {athleteProfile.planPrice.toLocaleString()} RSD
          </div>
          <div className="text-xs text-success-soft-foreground mt-1">
            Trener: {athleteProfile.trainerName}
          </div>
          <div className="text-xs text-success font-semibold mt-2">
            ističe: {athleteProfile.expiresOn}
          </div>
          <div className="h-2 bg-white/10 rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-success rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[10px] text-success-soft-foreground mt-1.5">
            {used} / {athleteProfile.daysTotal} dana
          </div>
        </div>

        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
          Uplati sledeću
        </div>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <button className="rounded-xl bg-surface border border-border/60 hover:border-accent/50 transition p-5 text-center">
            <div className="text-3xl mb-2">📱</div>
            <div className="text-sm font-semibold">QR kod</div>
            <div className="text-[10px] text-muted-foreground mt-1">Mobilno bankarstvo</div>
          </button>
          <button className="rounded-xl bg-surface border border-border/60 hover:border-accent/50 transition p-5 text-center">
            <div className="text-3xl mb-2">🏦</div>
            <div className="text-sm font-semibold">Uplatnica</div>
            <div className="text-[10px] text-muted-foreground mt-1">PDF za banku</div>
          </button>
        </div>

        <div className="rounded-xl bg-surface-3 p-4 text-xs text-muted-foreground">
          💡 Trener će automatski dobiti notifikaciju kada izvršiš uplatu.
        </div>
      </PhoneShell>
      <BottomNav role="athlete" />
    </>
  );
};

export default Membership;
