import { useEffect, useMemo, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card, SectionTitle, StatCard } from "@/components/ui-bits";
import { ArrowUpRight, ArrowDownRight, Loader2, Wallet, Banknote, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

type Purchase = {
  id: string;
  athlete_id: string;
  price_rsd: number;
  package_name: string;
  payment_method: "cash" | "bank";
  decided_at: string;
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Avg", "Sep", "Okt", "Nov", "Dec"];

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const monthsBack = (n: number) => {
  const arr: Date[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    arr.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }
  return arr;
};

const fmtRSD = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (n >= 1_000) return Math.round(n / 1_000) + "K";
  return String(n);
};

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return `Danas, ${d.toLocaleTimeString("sr-Latn-RS", { hour: "2-digit", minute: "2-digit" })}`;
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Juče";
  return d.toLocaleDateString("sr-Latn-RS", { day: "2-digit", month: "short" });
};

const Finances = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [athleteNames, setAthleteNames] = useState<Map<string, string>>(new Map());
  const [activeAthletes, setActiveAthletes] = useState<number>(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);

      // Poslednjih 6 meseci potvrđenih uplata
      const sinceISO = startOfMonth(new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1)).toISOString();

      const [purRes, athRes] = await Promise.all([
        supabase
          .from("membership_purchases")
          .select("id, athlete_id, price_rsd, package_name, payment_method, decided_at")
          .eq("trainer_id", user.id)
          .eq("status", "confirmed")
          .gte("decided_at", sinceISO)
          .order("decided_at", { ascending: false }),
        supabase
          .from("athletes")
          .select("id", { count: "exact", head: true })
          .eq("trainer_id", user.id),
      ]);

      const rows = (purRes.data as any[]) ?? [];
      setPurchases(rows as Purchase[]);
      setActiveAthletes(athRes.count ?? 0);

      const ids = Array.from(new Set(rows.map((r: any) => r.athlete_id)));
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        const map = new Map<string, string>();
        (profs as any[] ?? []).forEach((p) => map.set(p.id, p.full_name ?? "Vežbač"));
        setAthleteNames(map);
      } else {
        setAthleteNames(new Map());
      }

      setLoading(false);
    })();
  }, [user]);

  const months = useMemo(() => monthsBack(6), []);

  // Sumirano po mesecu
  const byMonth = useMemo(() => {
    const sums = months.map(() => 0);
    for (const p of purchases) {
      const d = new Date(p.decided_at);
      const idx = months.findIndex(
        (m) => m.getFullYear() === d.getFullYear() && m.getMonth() === d.getMonth(),
      );
      if (idx >= 0) sums[idx] += p.price_rsd ?? 0;
    }
    return sums;
  }, [purchases, months]);

  const maxBar = Math.max(...byMonth, 1);
  const thisMonth = byMonth[byMonth.length - 1] ?? 0;
  const prevMonth = byMonth[byMonth.length - 2] ?? 0;
  const trend = prevMonth > 0 ? Math.round(((thisMonth - prevMonth) / prevMonth) * 100) : (thisMonth > 0 ? 100 : 0);
  const trendUp = trend >= 0;

  // Koliko različitih vežbača je platilo OVOG meseca
  const paidThisMonth = useMemo(() => {
    const m = months[months.length - 1];
    const set = new Set<string>();
    for (const p of purchases) {
      const d = new Date(p.decided_at);
      if (d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth()) {
        set.add(p.athlete_id);
      }
    }
    return set.size;
  }, [purchases, months]);

  const recent = purchases.slice(0, 8);

  return (
    <>
      <PhoneShell hasBottomNav title="Finansije" eyebrow="Mesečni pregled">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                tone="brand"
                value={fmtRSD(thisMonth)}
                unit="RSD"
                label="Ovaj mesec"
              />
              <StatCard
                tone="success"
                value={String(paidThisMonth)}
                unit={activeAthletes > 0 ? `/ ${activeAthletes}` : undefined}
                label="Uplatilo"
              />
            </div>

            {/* Chart */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Trend (6m)
                  </div>
                  <div className="font-display text-[22px] font-bold tracking-tighter">
                    {trendUp ? "+" : ""}{trend}%
                  </div>
                </div>
                <span className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold",
                  trendUp
                    ? "bg-success-soft text-success-soft-foreground"
                    : "bg-destructive-soft text-destructive-soft-foreground",
                )}>
                  {trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {trendUp ? "rast" : "pad"}
                </span>
              </div>

              <div className="flex items-end gap-2.5 h-32">
                {byMonth.map((sum, i) => {
                  const m = months[i];
                  const h = Math.max(4, Math.round((sum / maxBar) * 100));
                  const isLast = i === byMonth.length - 1;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                      <div className="w-full flex-1 flex items-end">
                        <div
                          className={cn(
                            "w-full rounded-t-lg transition-all",
                            isLast ? "bg-gradient-brand shadow-brand" : "bg-surface-3",
                          )}
                          style={{ height: `${h}%` }}
                          title={`${sum.toLocaleString("sr-Latn-RS")} RSD`}
                        />
                      </div>
                      <span className={cn(
                        "text-[10px] font-semibold",
                        isLast ? "text-foreground" : "text-muted-foreground",
                      )}>
                        {MONTH_LABELS[m.getMonth()]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <section>
              <SectionTitle>Poslednje uplate</SectionTitle>
              {recent.length === 0 ? (
                <Card className="p-6 text-center">
                  <div className="mx-auto h-12 w-12 rounded-2xl bg-surface-2 flex items-center justify-center mb-3">
                    <Wallet className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="text-[14px] font-semibold tracking-tight mb-1">
                    Još nema potvrđenih uplata
                  </div>
                  <p className="text-[12.5px] text-muted-foreground">
                    Kad potvrdiš zahtev za članarinu u "Uplate", uplata će se pojaviti ovde.
                  </p>
                </Card>
              ) : (
                <ul className="space-y-2">
                  {recent.map((p) => {
                    const isCash = p.payment_method === "cash";
                    const Icon = isCash ? Banknote : Landmark;
                    return (
                      <li key={p.id} className="flex items-center gap-3 card-premium px-4 py-3">
                        <div className="h-11 w-11 rounded-2xl bg-success-soft text-success-soft-foreground flex items-center justify-center">
                          <Icon className="h-[18px] w-[18px]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-semibold tracking-tight truncate">
                            {athleteNames.get(p.athlete_id) ?? "Vežbač"}
                          </div>
                          <div className="text-[12px] text-muted-foreground truncate">
                            {p.package_name} · {fmtWhen(p.decided_at)} · {isCash ? "Keš" : "Račun"}
                          </div>
                        </div>
                        <div className="text-[15px] font-bold tracking-tight tnum shrink-0">
                          {p.price_rsd.toLocaleString("sr-Latn-RS")}{" "}
                          <span className="text-[11px] text-muted-foreground font-semibold">RSD</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </PhoneShell>
      <BottomNav role="trainer" />
    </>
  );
};

export default Finances;
