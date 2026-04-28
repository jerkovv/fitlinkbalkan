import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card, SectionTitle, StatCard } from "@/components/ui-bits";
import { ArrowUpRight } from "lucide-react";
import { monthlyRevenueBars, recentPayments } from "@/data/mock";
import { cn } from "@/lib/utils";

const months = ["Dec", "Jan", "Feb", "Mar", "Apr"];

const Finances = () => {
  return (
    <>
      <PhoneShell hasBottomNav title="Finansije" eyebrow="Mesečni pregled">
        <div className="grid grid-cols-2 gap-3">
          <StatCard tone="brand" value="60K" unit="RSD" label="Ovaj mesec" />
          <StatCard tone="success" value="12" unit="/ 15" label="Uplatilo" />
        </div>

        {/* Chart */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Trend
              </div>
              <div className="font-display text-[22px] font-bold tracking-tighter">+18%</div>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-success-soft text-success-soft-foreground text-[12px] font-semibold">
              <ArrowUpRight className="h-3 w-3" /> rast
            </span>
          </div>

          <div className="flex items-end gap-2.5 h-32">
            {monthlyRevenueBars.map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex-1 flex items-end">
                  <div
                    className={cn(
                      "w-full rounded-t-lg transition-all",
                      i === monthlyRevenueBars.length - 1
                        ? "bg-gradient-brand shadow-brand"
                        : "bg-surface-3",
                    )}
                    style={{ height: `${h}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground">{months[i]}</span>
              </div>
            ))}
          </div>
        </Card>

        <section>
          <SectionTitle action={<button className="text-[12px] font-semibold text-primary">Sve →</button>}>
            Poslednje uplate
          </SectionTitle>
          <ul className="space-y-2">
            {recentPayments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 card-premium px-4 py-3">
                <div className="h-11 w-11 rounded-2xl bg-success-soft text-success-soft-foreground flex items-center justify-center font-bold text-[13px]">
                  +
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold tracking-tight">{p.name}</div>
                  <div className="text-[12px] text-muted-foreground">{p.when} · {p.method}</div>
                </div>
                <div className="text-[15px] font-bold tracking-tight tnum">
                  {p.amount.toLocaleString()} <span className="text-[11px] text-muted-foreground font-semibold">RSD</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </PhoneShell>
      <BottomNav role="trainer" />
    </>
  );
};

export default Finances;
