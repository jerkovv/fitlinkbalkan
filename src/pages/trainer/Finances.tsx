import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card, SectionTitle } from "@/components/ui-bits";
import { ArrowUpRight, ArrowDownRight, Loader2, Wallet, Banknote, Landmark, Clock, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { SendMessageToAthlete } from "@/components/SendMessageToAthlete";
import {
  FullScreenSheet,
  FullScreenSheetScroll,
} from "@/components/ui/full-screen-sheet";

type Purchase = {
  id: string;
  athlete_id: string;
  price_rsd: number;
  package_name: string;
  payment_method: "cash" | "bank";
  decided_at: string;
  sessions_count: number | null;
  duration_days: number | null;
  status: string | null;
  payment_marked_at: string | null;
  notes: string | null;
};

type Expiring = {
  athlete_id: string;
  plan_name: string | null;
  ends_on: string;
};

type Period = 3 | 6 | 12;

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

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("sr-Latn-RS", { day: "2-digit", month: "short" });

const fmtFull = (iso: string) =>
  new Date(iso).toLocaleString("sr-Latn-RS", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

const daysUntil = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
};

const statusLabel = (s: string | null) => {
  if (s === "confirmed") return "Potvrđeno";
  if (s === "pending") return "Na čekanju";
  if (s === "rejected") return "Odbijeno";
  return s ?? "-";
};

// Lokalni stat tile (ne dira deljeni StatCard koji koristi i Dashboard).
// Label je uvek u jednom redu; broj je manji u uzem (donjem) redu kartica.
const TONE_TEXT: Record<string, string> = {
  brand: "text-gradient-brand",
  success: "text-success-soft-foreground",
  warning: "text-warning-soft-foreground",
  neutral: "text-foreground",
};

const StatTile = ({
  label,
  value,
  unit,
  tone = "neutral",
  big = false,
  badge,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: keyof typeof TONE_TEXT;
  big?: boolean;
  badge?: ReactNode;
}) => (
  <Card className="p-4">
    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
      {label}
    </div>
    <div className="flex items-baseline gap-1">
      <span
        className={cn(
          "font-display font-bold tracking-tightest leading-none",
          TONE_TEXT[tone],
          big ? "text-[24px]" : "text-[18px]",
        )}
      >
        {value}
      </span>
      {unit && <span className="text-[11px] font-medium text-muted-foreground">{unit}</span>}
      {badge && <span className="ml-auto self-center">{badge}</span>}
    </div>
  </Card>
);

const DetailRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex items-start justify-between gap-4 py-3 border-b border-hairline last:border-0">
    <span className="text-[12.5px] text-muted-foreground shrink-0">{label}</span>
    <span className="text-[13.5px] font-semibold text-right break-words">{value}</span>
  </div>
);

const RevenueTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const v = payload[0].value as number;
  return (
    <div className="rounded-xl border border-hairline bg-background px-3 py-2 shadow-md">
      <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
      <div className="font-display text-[14px] font-bold tnum">
        {v.toLocaleString("sr-Latn-RS")} RSD
      </div>
    </div>
  );
};

const Finances = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [athleteNames, setAthleteNames] = useState<Map<string, string>>(new Map());
  const [activeAthletes, setActiveAthletes] = useState<number>(0);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [pendingAmount, setPendingAmount] = useState<number>(0);
  const [expiring, setExpiring] = useState<Expiring[]>([]);
  const [runRate, setRunRate] = useState<number>(0);
  const [period, setPeriod] = useState<Period>(6);
  const [selected, setSelected] = useState<Purchase | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);

      const now = new Date();
      // Uvek povuci poslednjih 12 meseci potvrdjenih uplata; period (3/6/12) se
      // bira klijentski, bez ponovnog upita.
      const since12 = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 11, 1)).toISOString();
      const todayISO = new Date().toISOString().slice(0, 10);
      const in14 = new Date(); in14.setDate(in14.getDate() + 14);
      const in14ISO = in14.toISOString().slice(0, 10);

      const [purRes, pendRes, expRes, activeMemRes, athRes] = await Promise.all([
        supabase
          .from("membership_purchases")
          .select("id, athlete_id, price_rsd, package_name, payment_method, decided_at, sessions_count, duration_days, status, payment_marked_at, notes")
          .eq("trainer_id", user.id)
          .eq("status", "confirmed")
          .gte("decided_at", since12)
          .order("decided_at", { ascending: false }),
        supabase
          .from("membership_purchases")
          .select("id, price_rsd")
          .eq("trainer_id", user.id)
          .eq("status", "pending"),
        supabase
          .from("memberships")
          .select("athlete_id, plan_name, ends_on")
          .eq("trainer_id", user.id)
          .eq("status", "active")
          .gte("ends_on", todayISO)
          .lte("ends_on", in14ISO)
          .order("ends_on", { ascending: true }),
        supabase
          .from("memberships")
          .select("price, starts_on, ends_on")
          .eq("trainer_id", user.id)
          .eq("status", "active"),
        supabase
          .from("athletes")
          .select("id", { count: "exact", head: true })
          .eq("trainer_id", user.id),
      ]);

      const rows = (purRes.data as any[]) ?? [];
      setPurchases(rows as Purchase[]);
      setActiveAthletes(athRes.count ?? 0);

      const pendRows = (pendRes.data as any[]) ?? [];
      setPendingCount(pendRows.length);
      setPendingAmount(pendRows.reduce((s, r) => s + (r.price_rsd ?? 0), 0));

      const expRows = ((expRes.data as any[]) ?? []) as Expiring[];
      setExpiring(expRows);

      // Run-rate: mesecna vrednost svake aktivne clanarine = price / (trajanje_u_danima / 30).
      // Preskoci ako trajanje nije validno (0/null) da ne delimo nulom.
      const activeMems = (activeMemRes.data as any[]) ?? [];
      let rr = 0;
      for (const m of activeMems) {
        if (!m.price || !m.starts_on || !m.ends_on) continue;
        const days = (new Date(m.ends_on).getTime() - new Date(m.starts_on).getTime()) / 86_400_000;
        if (!days || days <= 0) continue;
        rr += m.price / (days / 30);
      }
      setRunRate(Math.round(rr));

      // Imena za uplate + clanarine na isteku
      const ids = Array.from(
        new Set([...rows.map((r: any) => r.athlete_id), ...expRows.map((e) => e.athlete_id)]),
      );
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

  const months = useMemo(() => monthsBack(period), [period]);

  // Uplate unutar izabranog perioda
  const periodPurchases = useMemo(
    () => purchases.filter((p) => new Date(p.decided_at) >= months[0]),
    [purchases, months],
  );

  // Suma po mesecu (za grafikon)
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

  const chartData = useMemo(
    () => months.map((m, i) => ({
      label: MONTH_LABELS[m.getMonth()],
      sum: byMonth[i],
      isLast: i === months.length - 1,
    })),
    [months, byMonth],
  );

  const thisMonth = byMonth[byMonth.length - 1] ?? 0;
  const prevMonth = byMonth[byMonth.length - 2] ?? 0;
  const trend = prevMonth > 0 ? Math.round(((thisMonth - prevMonth) / prevMonth) * 100) : (thisMonth > 0 ? 100 : 0);
  const trendUp = trend >= 0;

  const periodTotal = useMemo(() => byMonth.reduce((a, b) => a + b, 0), [byMonth]);
  // Prosek po AKTIVNIM mesecima (oni sa prihodom > 0), da prazni meseci ne lazu prosek.
  const avgMonthly = useMemo(() => {
    const activeMonths = byMonth.filter((v) => v > 0).length;
    return activeMonths ? Math.round(periodTotal / activeMonths) : 0;
  }, [byMonth, periodTotal]);

  // Promena ovog meseca vs prosli
  const monthBadge: ReactNode = prevMonth > 0 ? (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[11px] font-bold",
      trendUp ? "text-success-soft-foreground" : "text-destructive-soft-foreground",
    )}>
      {trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {trendUp ? "+" : ""}{trend}%
    </span>
  ) : (thisMonth > 0 ? (
    <span className="text-[11px] font-bold text-success-soft-foreground">novo</span>
  ) : null);

  // Koliko razlicitih vezbaca je platilo OVOG meseca
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

  // Top platioci u periodu
  const topPayers = useMemo(() => {
    const totals = new Map<string, number>();
    for (const p of periodPurchases) {
      totals.set(p.athlete_id, (totals.get(p.athlete_id) ?? 0) + (p.price_rsd ?? 0));
    }
    return Array.from(totals.entries())
      .map(([id, total]) => ({ id, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [periodPurchases]);

  // Raspodela po paketima u periodu
  const byPackage = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of periodPurchases) {
      m.set(p.package_name, (m.get(p.package_name) ?? 0) + (p.price_rsd ?? 0));
    }
    return Array.from(m.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [periodPurchases]);

  const recent = purchases.slice(0, 8);

  return (
    <>
      <PhoneShell hasBottomNav title="Finansije" eyebrow="Pregled prihoda">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Filter perioda */}
            <div className="flex items-center gap-1.5">
              {([3, 6, 12] as Period[]).map((n) => (
                <button
                  key={n}
                  onClick={() => setPeriod(n)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition",
                    period === n
                      ? "bg-gradient-brand text-white"
                      : "bg-surface-2 text-muted-foreground hover:bg-surface-3",
                  )}
                >
                  {n}m
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <StatTile
                big
                tone="brand"
                value={fmtRSD(thisMonth)}
                unit="RSD"
                label="Ovaj mesec"
                badge={monthBadge}
              />
              <StatTile
                big
                tone="success"
                value={String(paidThisMonth)}
                unit={activeAthletes > 0 ? `/ ${activeAthletes}` : undefined}
                label="Uplatilo"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <StatTile tone="brand" value={fmtRSD(periodTotal)} unit="RSD" label={`Ukupno ${period}m`} />
              <StatTile tone="neutral" value={fmtRSD(avgMonthly)} unit="RSD" label="Prosek/akt" />
              <StatTile
                tone="warning"
                value={String(pendingCount)}
                unit={pendingAmount > 0 ? `${fmtRSD(pendingAmount)} RSD` : undefined}
                label="Na čekanju"
              />
            </div>

            {/* Run-rate aktivnih clanarina */}
            <StatTile
              big
              tone="brand"
              value={fmtRSD(runRate)}
              unit="RSD/mes"
              label="Aktivni prihod/mes"
            />

            {/* Chart */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Trend ({period}m)
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

              <div className="h-40 -mx-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontWeight: 600 }}
                    />
                    <Tooltip cursor={{ fill: "hsl(268 60% 96%)" }} content={<RevenueTooltip />} />
                    <Bar dataKey="sum" radius={[6, 6, 0, 0]} maxBarSize={38}>
                      {chartData.map((d, i) => (
                        <Cell key={i} fill={d.isLast ? "hsl(268 80% 56%)" : "hsl(268 45% 88%)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Raspodela po paketima */}
            {byPackage.length > 0 && (
              <section>
                <SectionTitle>Raspodela po paketima ({period}m)</SectionTitle>
                <Card className="p-4 space-y-3">
                  {byPackage.map((pk) => {
                    const pct = periodTotal > 0 ? Math.round((pk.total / periodTotal) * 100) : 0;
                    return (
                      <div key={pk.name}>
                        <div className="flex items-baseline justify-between gap-3 mb-1.5">
                          <span className="text-[13px] font-semibold tracking-tight truncate">{pk.name}</span>
                          <span className="text-[12.5px] font-bold tnum shrink-0">
                            {pk.total.toLocaleString("sr-Latn-RS")}{" "}
                            <span className="text-[11px] text-muted-foreground font-semibold">RSD</span>
                            <span className="text-[11px] text-muted-foreground font-semibold"> · {pct}%</span>
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-brand"
                            style={{ width: `${Math.max(2, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </section>
            )}

            {/* Clanarine na isteku */}
            {expiring.length > 0 && (
              <section>
                <SectionTitle>Članarine na isteku</SectionTitle>
                <ul className="space-y-2">
                  {expiring.map((e) => {
                    const d = daysUntil(e.ends_on);
                    return (
                      <li key={e.athlete_id} className="flex items-center gap-3 card-premium px-4 py-3">
                        <div className="h-11 w-11 rounded-2xl bg-warning-soft text-warning-soft-foreground flex items-center justify-center shrink-0">
                          <Clock className="h-[18px] w-[18px]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-semibold tracking-tight truncate">
                            {athleteNames.get(e.athlete_id) ?? "Vežbač"}
                          </div>
                          <div className="text-[12px] text-muted-foreground truncate">
                            Ističe {fmtDay(e.ends_on)} · {d <= 0 ? "danas" : `za ${d} d`}
                          </div>
                        </div>
                        <SendMessageToAthlete
                          athleteId={e.athlete_id}
                          athleteName={athleteNames.get(e.athlete_id)}
                          variant="icon"
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Top platioci */}
            {topPayers.length > 0 && (
              <section>
                <SectionTitle>Top klijenti ({period}m)</SectionTitle>
                <ul className="space-y-2">
                  {topPayers.map((t, i) => (
                    <li key={t.id} className="flex items-center gap-3 card-premium px-4 py-3">
                      <div className={cn(
                        "h-9 w-9 rounded-full flex items-center justify-center shrink-0 font-display font-bold text-[13px]",
                        i === 0
                          ? "bg-gradient-brand text-white"
                          : "bg-surface-2 text-muted-foreground",
                      )}>
                        {i === 0 ? <Trophy className="h-[16px] w-[16px]" /> : i + 1}
                      </div>
                      <div className="flex-1 min-w-0 text-[14px] font-semibold tracking-tight truncate">
                        {athleteNames.get(t.id) ?? "Vežbač"}
                      </div>
                      <div className="text-[15px] font-bold tracking-tight tnum shrink-0">
                        {t.total.toLocaleString("sr-Latn-RS")}{" "}
                        <span className="text-[11px] text-muted-foreground font-semibold">RSD</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

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
                      <li key={p.id}>
                        <button
                          onClick={() => setSelected(p)}
                          className="w-full text-left flex items-center gap-3 card-premium px-4 py-3 hover:bg-surface-2 transition active:scale-[0.99]"
                        >
                          <div className="h-11 w-11 rounded-2xl bg-success-soft text-success-soft-foreground flex items-center justify-center shrink-0">
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
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </PhoneShell>
      <BottomNav role="trainer" />

      {/* Detalj uplate */}
      <FullScreenSheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Detalj uplate"
      >
        <FullScreenSheetScroll className="pt-5">
          {selected && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-2xl bg-success-soft text-success-soft-foreground flex items-center justify-center shrink-0">
                  {selected.payment_method === "cash"
                    ? <Banknote className="h-5 w-5" />
                    : <Landmark className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <div className="font-display text-[18px] font-bold tracking-tight truncate">
                    {athleteNames.get(selected.athlete_id) ?? "Vežbač"}
                  </div>
                  <div className="text-[13px] text-muted-foreground">
                    {selected.price_rsd.toLocaleString("sr-Latn-RS")} RSD
                  </div>
                </div>
              </div>

              <Card className="px-4 py-1">
                <DetailRow label="Vežbač" value={athleteNames.get(selected.athlete_id) ?? "Vežbač"} />
                <DetailRow label="Paket" value={selected.package_name} />
                <DetailRow
                  label="Iznos"
                  value={`${selected.price_rsd.toLocaleString("sr-Latn-RS")} RSD`}
                />
                {selected.sessions_count != null && (
                  <DetailRow label="Broj sesija" value={String(selected.sessions_count)} />
                )}
                {selected.duration_days != null && (
                  <DetailRow label="Trajanje" value={`${selected.duration_days} dana`} />
                )}
                <DetailRow label="Status" value={statusLabel(selected.status)} />
                <DetailRow label="Način plaćanja" value={selected.payment_method === "cash" ? "Keš" : "Račun"} />
                <DetailRow label="Datum uplate" value={fmtFull(selected.decided_at)} />
                {selected.payment_marked_at && (
                  <DetailRow label="Označeno plaćeno" value={fmtFull(selected.payment_marked_at)} />
                )}
                {selected.notes && (
                  <DetailRow label="Napomena" value={selected.notes} />
                )}
              </Card>
            </>
          )}
        </FullScreenSheetScroll>
      </FullScreenSheet>
    </>
  );
};

export default Finances;
