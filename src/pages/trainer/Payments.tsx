import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card, Chip, Avatar } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/hooks/useConfirm";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { cn } from "@/lib/utils";
import { Loader2, Banknote, Receipt, Check, X, Inbox, ChevronRight, IdCard, ArrowDown } from "lucide-react";
import { porukaGreske } from "@/lib/errorMessage";
import { toast } from "sonner";
import { MembershipEditSheet } from "@/components/trainer/MembershipEditSheet";
import { LockMark } from "@/components/pretplata/LockMark";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import type { ReactNode } from "react";

type Purchase = {
  id: string;
  athlete_id: string;
  package_name: string;
  sessions_count: number;
  duration_days: number;
  price_rsd: number;
  payment_method: "cash" | "bank";
  status: string;
  requested_at: string;
  athlete_name?: string;
};

type MembershipOverviewRow = {
  membership_id: string | null;
  athlete_id: string;
  athlete_name: string;
  avatar_url: string | null;
  plan_name: string | null;
  price: number | null;
  status: string | null;
  starts_on: string | null;
  ends_on: string | null;
  days_left: number | null;
  sessions_total: number | null;
  sessions_used: number | null;
  sessions_left: number | null;
  memberships_count: number | null;
  last_workout_at: string | null;
  days_since_last: number | null;
  workouts_30d: number | null;
  risk: string | null;
};

type OverviewCategory = "active" | "expiringSoon" | "expired" | "none";
type OverviewFilter = "all" | OverviewCategory;
type SortKey = "expiry" | "name" | "activity";

const initialsOf = (name: string | null) => {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "??";
};

// Bez roka na isteku (ends_on null) ne znaci istekla - nista u bazi automatski
// ne prebacuje status, zato badz racunamo IZ days_left (server ga vec racuna).
const daysLeftBadge = (daysLeft: number | null): { label: string; tone: "success" | "warning" | "danger" | "muted" } => {
  if (daysLeft == null) return { label: "Bez roka", tone: "muted" };
  if (daysLeft < 0) return { label: "Istekla", tone: "danger" };
  if (daysLeft <= 7) return { label: "Ističe uskoro", tone: "warning" };
  return { label: "Aktivna", tone: "success" };
};

const categoryOf = (m: MembershipOverviewRow): OverviewCategory => {
  if (m.membership_id == null) return "none";
  const dl = m.days_left;
  if (dl != null && dl < 0) return "expired";
  if (dl != null && dl <= 7) return "expiringSoon";
  return "active";
};

const RISK_DOT: Record<string, string> = {
  low: "bg-success-soft-foreground",
  medium: "bg-warning-soft-foreground",
  high: "bg-destructive",
};

const OV_FILTERS: { key: OverviewFilter; label: string }[] = [
  { key: "all", label: "Sve" },
  { key: "active", label: "Aktivne" },
  { key: "expiringSoon", label: "Ističe uskoro" },
  { key: "expired", label: "Istekle" },
  { key: "none", label: "Bez članarine" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "expiry", label: "Po isteku" },
  { key: "name", label: "Po imenu" },
  { key: "activity", label: "Po aktivnosti" },
];

const StatTile = ({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex flex-col items-center justify-center gap-0.5 rounded-2xl border py-3 transition",
      active ? "border-primary bg-primary-soft" : "border-hairline bg-surface hover:bg-surface-2",
    )}
  >
    <span className="font-display text-[20px] font-bold tracking-tightest tnum">{value}</span>
    <span className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-center leading-tight">
      {label}
    </span>
  </button>
);

// ---- Racunar ----
// Kolone tabele clanarina; zaglavlje i redovi dele isti sablon da se poravnaju.
const OV_GRID = "grid grid-cols-[minmax(0,1fr)_128px_132px_150px_132px_16px] items-center gap-4 px-5";

const OV_DOT: Record<OverviewCategory, string> = {
  active: "bg-success-soft-foreground",
  expiringSoon: "bg-warning-soft-foreground",
  expired: "bg-destructive",
  none: "bg-muted-foreground/40",
};

const fmtDatum = (iso: string, withYear = true) =>
  new Date(iso).toLocaleDateString("sr-Latn-RS", {
    day: "2-digit",
    month: "short",
    ...(withYear ? { year: "numeric" as const } : {}),
  });

const rokTekst = (dl: number) => (dl < 0 ? `pre ${-dl} d` : dl === 0 ? "danas" : `za ${dl} d`);

const DesktopFilterTile = ({
  label,
  value,
  dot,
  active,
  onClick,
}: {
  label: string;
  value: number;
  dot: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      "flex flex-col items-start rounded-2xl border p-4 text-left transition",
      active ? "border-primary/25 bg-primary-soft shadow-sm" : "border-hairline bg-surface hover:bg-surface-2",
    )}
  >
    <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />
      {label}
    </span>
    <span className="mt-2.5 font-display text-[28px] font-bold leading-none tracking-tightest tnum">{value}</span>
  </button>
);

const SortHead = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "inline-flex items-center gap-1 text-left text-[11px] font-semibold uppercase tracking-[0.14em] transition hover:text-foreground",
      active ? "text-foreground" : "text-muted-foreground",
    )}
  >
    {children}
    {active && <ArrowDown className="h-3 w-3" />}
  </button>
);

const Segmented = <K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
}) => (
  <div className="inline-flex items-center gap-1 rounded-full bg-surface-2 p-1">
    {options.map((o) => (
      <button
        key={o.key}
        type="button"
        onClick={() => onChange(o.key)}
        className={cn(
          "h-8 whitespace-nowrap rounded-full px-3.5 text-[12px] font-semibold transition",
          value === o.key ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const Payments = () => {
  const { locked, openLock } = usePretplataLock();
  const { user } = useAuth();
  const confirm = useConfirm();
  const desktop = useDesktopWeb();

  // Tab 1 - zahtevi na cekanju (postojeci tok, netaknut)
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Purchase[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("membership_purchases")
      .select("*")
      .eq("trainer_id", user.id)
      .eq("status", "pending")
      .order("requested_at", { ascending: false });

    const rows = (data as any[]) ?? [];
    const ids = Array.from(new Set(rows.map((r) => r.athlete_id)));
    const profMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      (profs as any[] | null)?.forEach((p) => profMap.set(p.id, p.full_name ?? ""));
    }

    setPending(rows.map((r) => ({ ...r, athlete_name: profMap.get(r.athlete_id) ?? "Vežbač" })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const confirmPurchase = async (p: Purchase) => {
    if (locked) return openLock();
    setBusyId(p.id);
    const { error } = await supabase.rpc("confirm_membership_purchase", {
      p_purchase_id: p.id,
      p_starts_on: new Date().toISOString().split("T")[0],
    });
    setBusyId(null);
    if (error) return toast.error(porukaGreske(error));
    toast.success("Uplata potvrđena, članarina aktivirana");
    load();
    loadOverview();
  };

  const rejectPurchase = async (p: Purchase) => {
    if (locked) return openLock();
    if (!(await confirm({ title: `Odbiti zahtev "${p.package_name}"?`, destructive: true }))) return;
    setBusyId(p.id);
    const { error } = await supabase.rpc("reject_membership_purchase", {
      p_purchase_id: p.id,
      p_notes: null,
    });
    setBusyId(null);
    if (error) return toast.error(porukaGreske(error));
    toast.success("Zahtev odbijen");
    load();
  };

  // Tab 2 - pregled svih clanarina
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overview, setOverview] = useState<MembershipOverviewRow[]>([]);
  const [ovFilter, setOvFilter] = useState<OverviewFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("expiry");
  const [editMembershipId, setEditMembershipId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const loadOverview = async () => {
    setOverviewLoading(true);
    const { data, error } = await supabase.rpc("trainer_memberships_overview");
    setOverviewLoading(false);
    if (error) { toast.error(porukaGreske(error)); return; }
    const res = data as any;
    if (!res?.success || !Array.isArray(res.memberships)) { setOverview([]); return; }
    setOverview(res.memberships as MembershipOverviewRow[]);
  };

  useEffect(() => { loadOverview(); }, [user]);

  const counts = useMemo(() => {
    let active = 0, expiringSoon = 0, expired = 0, none = 0;
    overview.forEach((m) => {
      const cat = categoryOf(m);
      if (cat === "active") active++;
      else if (cat === "expiringSoon") expiringSoon++;
      else if (cat === "expired") expired++;
      else none++;
    });
    return { active, expiringSoon, expired, none };
  }, [overview]);

  const sortedOverview = useMemo(() => {
    const filtered = overview.filter((m) => ovFilter === "all" || categoryOf(m) === ovFilter);
    const arr = filtered.slice();
    if (sortKey === "name") {
      arr.sort((a, b) => (a.athlete_name ?? "").localeCompare(b.athlete_name ?? ""));
    } else if (sortKey === "activity") {
      arr.sort((a, b) => (b.workouts_30d ?? 0) - (a.workouts_30d ?? 0));
    } else {
      arr.sort((a, b) => {
        const ad = a.days_left;
        const bd = b.days_left;
        if (ad == null && bd == null) return 0;
        if (ad == null) return 1;
        if (bd == null) return -1;
        return ad - bd;
      });
    }
    return arr;
  }, [overview, ovFilter, sortKey]);

  const openEdit = (membershipId: string) => {
    if (locked) return openLock();
    setEditMembershipId(membershipId);
    setEditOpen(true);
  };

  return (
    <>
      <PhoneShell
        hasBottomNav
        back="/trener"
        eyebrow="Naplata"
        desktopWidth="wide"
        title={
          desktop ? (
            "Uplate i članarine"
          ) : (
            <h1 className="font-display text-[28px] leading-[1.05] font-bold tracking-tightest">
              Uplate i članarine
            </h1>
          )
        }
      >
        {desktop ? (
          // Racunar: bez tabova. Zahtevi su stvar za akciju pa idu gore kao kartice,
          // a ispod je pregled clanarina kao prava tabela preko cele sirine. Oba
          // skupa podataka se ionako ucitavaju odmah, nezavisno od taba.
          <div className="space-y-10">
            <section>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="font-display text-[17px] font-bold tracking-tight">Zahtevi na čekanju</h2>
                {pending.length > 0 && (
                  <span className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-1 text-[11.5px] font-semibold text-primary tnum">
                    {pending.length}
                  </span>
                )}
              </div>

              {loading ? (
                <div className="card-premium flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : pending.length === 0 ? (
                <div className="card-premium flex items-center gap-4 px-5 py-4">
                  <div className="h-11 w-11 shrink-0 rounded-xl bg-surface-2 flex items-center justify-center">
                    <Inbox className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold tracking-tight">Nema zahteva</div>
                    <p className="text-[12.5px] text-muted-foreground">
                      Kad vežbač izabere paket, pojaviće se ovde.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                  {pending.map((p) => (
                    <div key={p.id} className="card-premium flex flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="h-11 w-11 rounded-xl bg-gradient-brand-soft text-primary flex items-center justify-center">
                          {p.payment_method === "cash" ? (
                            <Banknote className="h-5 w-5" />
                          ) : (
                            <Receipt className="h-5 w-5" />
                          )}
                        </div>
                        <Chip tone={p.payment_method === "cash" ? "warning" : "info"}>
                          {p.payment_method === "cash" ? "Keš" : "Račun"}
                        </Chip>
                      </div>
                      <div className="mt-4 font-display text-[17px] font-bold leading-snug tracking-tight truncate">
                        {p.athlete_name}
                      </div>
                      <div className="text-[13px] text-muted-foreground truncate">{p.package_name}</div>
                      <div className="mt-3 flex items-baseline gap-1.5">
                        <span className="font-display text-[24px] font-bold leading-none tracking-tightest text-primary tnum">
                          {p.price_rsd.toLocaleString("sr-Latn-RS")}
                        </span>
                        <span className="text-[12px] font-semibold text-muted-foreground">RSD</span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground tnum">
                          {p.sessions_count} treninga
                        </span>
                        <span className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground tnum">
                          {p.duration_days} dana
                        </span>
                        {p.requested_at && (
                          <span className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground tnum">
                            {fmtDatum(p.requested_at, false)}
                          </span>
                        )}
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          onClick={() => rejectPurchase(p)}
                          disabled={busyId === p.id}
                          className="h-10 rounded-full"
                        >
                          <LockMark className="mr-1.5" /><X className="h-4 w-4 mr-1.5" /> Odbij
                        </Button>
                        <Button
                          onClick={() => confirmPurchase(p)}
                          disabled={busyId === p.id}
                          className="h-10 rounded-full bg-gradient-brand text-white shadow-brand"
                        >
                          {busyId === p.id ? (
                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4 mr-1.5" />
                          )}
                          <LockMark className="mr-1.5" />
                          Potvrdi
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 font-display text-[17px] font-bold tracking-tight">Članarine</h2>
              {overviewLoading ? (
                <div className="card-premium flex justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <DesktopFilterTile
                      label="Aktivnih"
                      value={counts.active}
                      dot={OV_DOT.active}
                      active={ovFilter === "active"}
                      onClick={() => setOvFilter(ovFilter === "active" ? "all" : "active")}
                    />
                    <DesktopFilterTile
                      label="Ističe u 7 dana"
                      value={counts.expiringSoon}
                      dot={OV_DOT.expiringSoon}
                      active={ovFilter === "expiringSoon"}
                      onClick={() => setOvFilter(ovFilter === "expiringSoon" ? "all" : "expiringSoon")}
                    />
                    <DesktopFilterTile
                      label="Isteklih"
                      value={counts.expired}
                      dot={OV_DOT.expired}
                      active={ovFilter === "expired"}
                      onClick={() => setOvFilter(ovFilter === "expired" ? "all" : "expired")}
                    />
                    <DesktopFilterTile
                      label="Bez članarine"
                      value={counts.none}
                      dot={OV_DOT.none}
                      active={ovFilter === "none"}
                      onClick={() => setOvFilter(ovFilter === "none" ? "all" : "none")}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Segmented options={OV_FILTERS} value={ovFilter} onChange={(k) => setOvFilter(k)} />
                    <Segmented options={SORT_OPTIONS} value={sortKey} onChange={(k) => setSortKey(k)} />
                  </div>

                  <div className="card-premium overflow-hidden">
                    <div className={cn(OV_GRID, "border-b border-hairline bg-surface-2/60 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground")}>
                      <SortHead active={sortKey === "name"} onClick={() => setSortKey("name")}>Vežbač</SortHead>
                      <span>Status</span>
                      <SortHead active={sortKey === "expiry"} onClick={() => setSortKey("expiry")}>Ističe</SortHead>
                      <span>Treninzi</span>
                      <SortHead active={sortKey === "activity"} onClick={() => setSortKey("activity")}>Aktivnost 30 d</SortHead>
                      <span />
                    </div>

                    {sortedOverview.length === 0 ? (
                      <div className="flex flex-col items-center gap-3 py-12 text-center">
                        <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
                          <IdCard className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-[13px] text-muted-foreground">Nema vežbača za ovaj filter.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-hairline">
                        {sortedOverview.map((m) => {
                          const noMembership = m.membership_id == null;
                          const badge = daysLeftBadge(m.days_left);
                          const total = m.sessions_total ?? 0;
                          const cells = (
                            <>
                              <div className="flex min-w-0 items-center gap-3">
                                <Avatar initials={initialsOf(m.athlete_name)} tone="brand" size="sm" className="ring-0" />
                                <div className="min-w-0">
                                  <div className="truncate text-[14px] font-semibold tracking-tight">{m.athlete_name}</div>
                                  {!noMembership && m.plan_name && (
                                    <div className="truncate text-[12px] text-muted-foreground">{m.plan_name}</div>
                                  )}
                                </div>
                              </div>

                              <div>
                                {noMembership ? (
                                  <Chip tone="muted">Bez članarine</Chip>
                                ) : (
                                  <Chip tone={badge.tone}>{badge.label}</Chip>
                                )}
                              </div>

                              <div className="min-w-0">
                                {!noMembership && m.ends_on ? (
                                  <>
                                    <div className="text-[13px] font-semibold tnum">{fmtDatum(m.ends_on)}</div>
                                    {m.days_left != null && (
                                      <div
                                        className={cn(
                                          "text-[11.5px] tnum",
                                          m.days_left < 0
                                            ? "text-destructive-soft-foreground"
                                            : m.days_left <= 7
                                              ? "text-warning-soft-foreground"
                                              : "text-muted-foreground",
                                        )}
                                      >
                                        {rokTekst(m.days_left)}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-[13px] text-muted-foreground">-</span>
                                )}
                              </div>

                              <div className="min-w-0">
                                {!noMembership && total > 0 ? (
                                  <>
                                    <div className="text-[13px] font-semibold tnum">
                                      {m.sessions_used ?? 0}
                                      <span className="font-medium text-muted-foreground"> / {total}</span>
                                    </div>
                                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                                      <div
                                        className="h-full rounded-full bg-gradient-brand"
                                        style={{ width: `${Math.min(100, ((m.sessions_used ?? 0) / total) * 100)}%` }}
                                      />
                                    </div>
                                  </>
                                ) : (
                                  <span className="text-[13px] text-muted-foreground">-</span>
                                )}
                              </div>

                              <div className="min-w-0">
                                {noMembership ? (
                                  <span className="text-[13px] text-muted-foreground">-</span>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span className={cn("h-2 w-2 shrink-0 rounded-full", RISK_DOT[m.risk ?? ""] ?? "bg-muted")} />
                                    <span className="text-[13px] font-semibold tnum">{m.workouts_30d ?? 0}</span>
                                    <span className="text-[12px] text-muted-foreground">treninga</span>
                                  </div>
                                )}
                              </div>

                              <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                            </>
                          );

                          return noMembership ? (
                            <Link
                              key={m.athlete_id}
                              to={`/trener/vezbaci/${m.athlete_id}`}
                              className={cn(OV_GRID, "py-3 transition hover:bg-surface-2")}
                            >
                              {cells}
                            </Link>
                          ) : (
                            <button
                              key={m.athlete_id}
                              type="button"
                              onClick={() => openEdit(m.membership_id!)}
                              className={cn(OV_GRID, "w-full py-3 text-left transition hover:bg-surface-2")}
                            >
                              {cells}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : (
        <Tabs defaultValue="zahtevi" className="w-full">
          <TabsList className="grid grid-cols-2 w-full mb-1">
            <TabsTrigger
              value="zahtevi"
              className="data-[state=active]:bg-gradient-brand data-[state=active]:text-white data-[state=active]:shadow-brand"
            >
              Zahtevi{pending.length > 0 ? ` (${pending.length})` : ""}
            </TabsTrigger>
            <TabsTrigger
              value="clanarine"
              className="data-[state=active]:bg-gradient-brand data-[state=active]:text-white data-[state=active]:shadow-brand"
            >
              Članarine
            </TabsTrigger>
          </TabsList>

          <TabsContent value="zahtevi" className="space-y-2 pt-3">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : pending.length === 0 ? (
              <Card className="p-6 text-center space-y-3">
                <div className="h-12 w-12 mx-auto rounded-2xl bg-muted flex items-center justify-center">
                  <Inbox className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="font-display text-[18px] font-bold tracking-tight">
                  Nema zahteva
                </div>
                <p className="text-[13px] text-muted-foreground">
                  Kad vežbač izabere paket, pojaviće se ovde.
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {pending.map((p) => (
                  <Card key={p.id} className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="h-11 w-11 rounded-2xl bg-gradient-brand-soft text-primary flex items-center justify-center shrink-0">
                        {p.payment_method === "cash" ? (
                          <Banknote className="h-[18px] w-[18px]" />
                        ) : (
                          <Receipt className="h-[18px] w-[18px]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-semibold tracking-tight truncate">
                          {p.athlete_name}
                        </div>
                        <div className="text-[12.5px] text-muted-foreground">
                          {p.package_name}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="font-display text-[16px] font-bold tracking-tight text-primary tnum">
                            {p.price_rsd.toLocaleString("sr-Latn-RS")} RSD
                          </span>
                          <Chip tone={p.payment_method === "cash" ? "warning" : "info"}>
                            {p.payment_method === "cash" ? "Keš" : "Račun"}
                          </Chip>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          {p.sessions_count} treninga · {p.duration_days} dana
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        onClick={() => rejectPurchase(p)}
                        disabled={busyId === p.id}
                      >
                        <LockMark className="mr-1.5" /><X className="h-4 w-4 mr-1.5" /> Odbij
                      </Button>
                      <Button
                        onClick={() => confirmPurchase(p)}
                        disabled={busyId === p.id}
                        className="bg-gradient-brand text-white shadow-brand"
                      >
                        {busyId === p.id ? (
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 mr-1.5" />
                        )}
                        <LockMark className="mr-1.5" />
                        Potvrdi
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="clanarine" className="space-y-3 pt-3">
            {overviewLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2">
                  <StatTile
                    label="Aktivnih"
                    value={counts.active}
                    active={ovFilter === "active"}
                    onClick={() => setOvFilter(ovFilter === "active" ? "all" : "active")}
                  />
                  <StatTile
                    label="Ističe u 7 dana"
                    value={counts.expiringSoon}
                    active={ovFilter === "expiringSoon"}
                    onClick={() => setOvFilter(ovFilter === "expiringSoon" ? "all" : "expiringSoon")}
                  />
                  <StatTile
                    label="Isteklih"
                    value={counts.expired}
                    active={ovFilter === "expired"}
                    onClick={() => setOvFilter(ovFilter === "expired" ? "all" : "expired")}
                  />
                  <StatTile
                    label="Bez članarine"
                    value={counts.none}
                    active={ovFilter === "none"}
                    onClick={() => setOvFilter(ovFilter === "none" ? "all" : "none")}
                  />
                </div>

                <div className="flex gap-2 -mx-2 px-2 overflow-x-auto no-scrollbar">
                  {OV_FILTERS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setOvFilter(f.key)}
                      className={cn(
                        "pill px-4 py-2 text-[12.5px] whitespace-nowrap transition",
                        ovFilter === f.key
                          ? "bg-foreground text-background"
                          : "bg-surface border border-hairline text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 -mx-2 px-2 overflow-x-auto no-scrollbar">
                  {SORT_OPTIONS.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setSortKey(s.key)}
                      className={cn(
                        "pill px-3.5 py-1.5 text-[11.5px] font-semibold whitespace-nowrap transition",
                        sortKey === s.key
                          ? "bg-primary-soft text-primary-soft-foreground"
                          : "bg-surface-2 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  {sortedOverview.map((m) => {
                    const noMembership = m.membership_id == null;
                    const badge = daysLeftBadge(m.days_left);
                    const rowContent = (
                      <>
                        <Avatar initials={initialsOf(m.athlete_name)} tone="brand" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[14.5px] font-semibold tracking-tight truncate">
                            {m.athlete_name}
                          </div>
                          {noMembership ? (
                            <div className="text-[12px] text-muted-foreground mt-0.5">Bez članarine</div>
                          ) : (
                            <>
                              <div className="text-[12px] text-muted-foreground truncate">
                                {m.plan_name}
                              </div>
                              {m.sessions_total != null && (
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1.5 max-w-[140px]">
                                  <div
                                    className="h-full bg-gradient-brand rounded-full"
                                    style={{
                                      width: `${Math.min(100, ((m.sessions_used ?? 0) / m.sessions_total) * 100)}%`,
                                    }}
                                  />
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 mt-1">
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 rounded-full shrink-0",
                                    RISK_DOT[m.risk ?? ""] ?? "bg-muted",
                                  )}
                                />
                                <span className="text-[11px] text-muted-foreground truncate">
                                  {m.workouts_30d ?? 0} treninga / 30 dana
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                        {!noMembership && <Chip tone={badge.tone}>{badge.label}</Chip>}
                        <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                      </>
                    );

                    return noMembership ? (
                      <Link
                        key={m.athlete_id}
                        to={`/trener/vezbaci/${m.athlete_id}`}
                        className="flex items-center gap-3 card-premium-hover px-4 py-3"
                      >
                        {rowContent}
                      </Link>
                    ) : (
                      <button
                        key={m.athlete_id}
                        type="button"
                        onClick={() => openEdit(m.membership_id!)}
                        className="w-full flex items-center gap-3 card-premium-hover px-4 py-3 text-left"
                      >
                        {rowContent}
                      </button>
                    );
                  })}
                  {sortedOverview.length === 0 && (
                    <Card className="p-6 text-center space-y-3">
                      <div className="h-12 w-12 mx-auto rounded-2xl bg-muted flex items-center justify-center">
                        <IdCard className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-[13px] text-muted-foreground">
                        Nema vežbača za ovaj filter.
                      </p>
                    </Card>
                  )}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
        )}
      </PhoneShell>
      <BottomNav role="trainer" />

      <MembershipEditSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        membershipId={editMembershipId}
        onSaved={loadOverview}
      />
    </>
  );
};

export default Payments;
