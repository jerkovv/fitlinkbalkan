import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card, Chip, SectionTitle } from "@/components/ui-bits";
import { athleteProfile } from "@/data/mock";
import { QrCode, Receipt, MapPin, ShieldCheck } from "lucide-react";

const Membership = () => {
  const used = athleteProfile.daysTotal - athleteProfile.daysLeft;
  const pct = Math.round((athleteProfile.daysLeft / athleteProfile.daysTotal) * 100);

  return (
    <>
      <PhoneShell hasBottomNav title="Tvoja članarina" eyebrow="Pretplata">
        {/* Hero card */}
        <Card className="p-5 bg-gradient-brand text-white border-0 shadow-brand relative overflow-hidden">
          <div className="absolute -bottom-12 -right-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80">
                  Aktivan paket
                </div>
                <div className="font-display text-[24px] font-bold tracking-tighter mt-1">
                  {athleteProfile.planName}
                </div>
              </div>
              <Chip tone="success" className="bg-white/15 text-white border-0">
                <ShieldCheck className="h-3 w-3 mr-1" /> Aktivna
              </Chip>
            </div>

            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-[32px] font-bold tracking-tightest tnum">
                {athleteProfile.planPrice.toLocaleString()}
              </span>
              <span className="text-[14px] font-semibold text-white/80">RSD / mesečno</span>
            </div>

            <div className="mt-5 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between mt-1.5 text-[11px] text-white/80">
              <span>{used} / {athleteProfile.daysTotal} dana iskorišćeno</span>
              <span>ističe {athleteProfile.expiresOn}</span>
            </div>
          </div>
        </Card>

        {/* Trener info */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-trainer-soft text-trainer-soft-foreground flex items-center justify-center">
              <MapPin className="h-[18px] w-[18px]" />
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-semibold tracking-tight">{athleteProfile.trainerName}</div>
              <div className="text-[12px] text-muted-foreground">Iron Lab Studio · Beograd</div>
            </div>
          </div>
        </Card>

        {/* Pay options */}
        <section>
          <SectionTitle>Uplati sledeću</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <button className="card-premium-hover p-5 text-left">
              <div className="h-10 w-10 rounded-2xl bg-primary-soft text-primary-soft-foreground flex items-center justify-center mb-3">
                <QrCode className="h-5 w-5" />
              </div>
              <div className="text-[14px] font-semibold tracking-tight">QR kod</div>
              <div className="text-[12px] text-muted-foreground mt-0.5">Mobilno bankarstvo</div>
            </button>
            <button className="card-premium-hover p-5 text-left">
              <div className="h-10 w-10 rounded-2xl bg-trainer-soft text-trainer-soft-foreground flex items-center justify-center mb-3">
                <Receipt className="h-5 w-5" />
              </div>
              <div className="text-[14px] font-semibold tracking-tight">Uplatnica</div>
              <div className="text-[12px] text-muted-foreground mt-0.5">PDF za banku</div>
            </button>
          </div>
        </section>

        <Card className="p-4 bg-gradient-brand-soft border-0">
          <div className="text-[12.5px] text-foreground/70">
            💡 Trener će dobiti notifikaciju čim potvrdi uplatu i automatski produžiti članarinu.
          </div>
        </Card>
      </PhoneShell>
      <BottomNav role="athlete" />
    </>
  );
};

export default Membership;
