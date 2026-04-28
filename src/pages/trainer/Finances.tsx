import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { StatCard } from "@/components/ui-bits";
import { Wallet } from "lucide-react";
import { monthlyRevenueBars, recentPayments } from "@/data/mock";
import { cn } from "@/lib/utils";

const Finances = () => {
  return (
    <>
      <PhoneShell title="📊 Prihodi" variant="trainer">
        <div className="grid grid-cols-2 gap-3 mb-5">
          <StatCard tone="trainer" value="60.000" label="RSD ovaj mesec" />
          <StatCard tone="success" value="12/15" label="članova platilo" />
        </div>

        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Mesečni trend
        </div>
        <div className="rounded-xl bg-surface border border-border/60 p-4 mb-5">
          <div className="flex items-end gap-2 h-24">
            {monthlyRevenueBars.map((h, i) => (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-t-md transition-all",
                  i === monthlyRevenueBars.length - 1 ? "bg-gradient-trainer" : "bg-primary-soft",
                )}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
            <span>Dec</span><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span>
          </div>
        </div>

        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Poslednje uplate
        </div>
        <ul className="space-y-2">
          {recentPayments.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl bg-surface border border-border/60 p-3">
              <div className="h-9 w-9 rounded-lg bg-success-soft flex items-center justify-center text-success-soft-foreground">
                <Wallet className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{p.name} — {p.amount.toLocaleString()} RSD</div>
                <div className="text-xs text-muted-foreground">{p.when} · {p.method}</div>
              </div>
            </li>
          ))}
        </ul>
      </PhoneShell>
      <BottomNav role="trainer" />
    </>
  );
};

export default Finances;
