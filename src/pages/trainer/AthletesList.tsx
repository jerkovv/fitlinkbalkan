import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Avatar, Chip } from "@/components/ui-bits";
import { Search, ChevronRight, Loader2, Mail, Loader, Clock, RefreshCw, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { porukaGreske } from "@/lib/errorMessage";
import { toast } from "sonner";
import {
  FullScreenSheet,
  FullScreenSheetScroll,
  FullScreenSheetFooter,
} from "@/components/ui/full-screen-sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { LockMark } from "@/components/pretplata/LockMark";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";

type AthleteRow = {
  id: string;
  goal: string | null;
  joined_at: string;
  profile: { full_name: string | null } | null;
  membership: { plan_name: string; status: string; ends_on: string | null } | null;
};

type PendingInvite = {
  id: string;
  email: string;
  full_name: string | null;
  code: string;
  sent_at: string | null;
  expires_at: string | null;
};

const goalLabel: Record<string, string> = {
  lose_weight: "Mršavljenje",
  gain_muscle: "Masa",
  endurance: "Izdržljivost",
  mobility: "Mobilnost",
  general: "Opšte",
};

const initialsOf = (name: string | null) => {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "??";
};

const statusFromEnds = (endsOn: string | null): "active" | "expiring" | "expired" => {
  if (!endsOn) return "active";
  const days = Math.ceil((new Date(endsOn).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return "expired";
  if (days <= 7) return "expiring";
  return "active";
};

const statusChip = {
  active: <Chip tone="success">Aktivan</Chip>,
  expiring: <Chip tone="warning">Ističe uskoro</Chip>,
  expired: <Chip tone="danger">Istekao</Chip>,
};

// Signal rizika (iz get_athletes_overview): low zeleno, medium amber, high crveno.
const RISK_DOT: Record<string, string> = {
  low: "bg-success-soft-foreground",
  medium: "bg-warning-soft-foreground",
  high: "bg-destructive",
};

const recencyText = (days: number | null) => {
  if (days == null) return "Nije trenirao";
  if (days <= 0) return "Trenirao danas";
  return `Trenirao pre ${days} dana`;
};

const filters: { key: "all" | "active" | "expiring" | "expired"; label: string }[] = [
  { key: "all", label: "Svi" },
  { key: "active", label: "Aktivni" },
  { key: "expiring", label: "Uskoro" },
  { key: "expired", label: "Istekli" },
];

// Racunar: kolone tabele. Svaki red je svoj grid, pa zaglavlje i redovi moraju
// da dele iste sirine - zato fiksne/fr vrednosti, nikad "auto".
const ATHLETE_COLS =
  "grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_128px_16px] items-center gap-4";
const INVITE_COLS =
  "grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_128px_190px] items-center gap-4";
const TABLE_HEAD =
  "border-b border-hairline px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";

const AthletesList = () => {
  const { locked, openLock, guard } = usePretplataLock();
  const { user } = useAuth();
  const desktop = useDesktopWeb();
  const [filter, setFilter] = useState<"all" | "active" | "expiring" | "expired">("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AthleteRow[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [inviteToDelete, setInviteToDelete] = useState<PendingInvite | null>(null);
  const [deletingInvite, setDeletingInvite] = useState(false);
  const [overview, setOverview] = useState<Map<string, { risk: string; days_since_last: number | null }>>(new Map());

  const load = async () => {
    if (!user) return;
    setLoading(true);

    const { data: ath, error } = await supabase
      .from("athletes")
      .select("id, goal, joined_at")
      .eq("trainer_id", user.id)
      .order("joined_at", { ascending: false });

    if (error) {
      toast.error(porukaGreske(error));
      setLoading(false);
      return;
    }

    const ids = (ath ?? []).map((a: any) => a.id);

    const [profilesRes, membershipsRes] = await Promise.all([
      ids.length
        ? supabase.from("profiles").select("id, full_name").in("id", ids)
        : Promise.resolve({ data: [] as any[] }),
      ids.length
        ? supabase
            .from("memberships")
            .select("athlete_id, plan_name, status, ends_on")
            .in("athlete_id", ids)
            .eq("status", "active")
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const pMap = new Map<string, any>((profilesRes.data ?? []).map((p: any) => [p.id, p]));
    const mMap = new Map<string, any>((membershipsRes.data ?? []).map((m: any) => [m.athlete_id, m]));

    const merged: AthleteRow[] = (ath ?? []).map((a: any) => ({
      id: a.id,
      goal: a.goal,
      joined_at: a.joined_at,
      profile: pMap.get(a.id) ?? null,
      membership: mMap.get(a.id) ?? null,
    }));

    setRows(merged);

    // Pending email pozivnice (poslate, čekamo prihvatanje)
    const { data: inv } = await supabase
      .from("invites")
      .select("id, email, full_name, code, sent_at, expires_at")
      .eq("trainer_id", user.id)
      .eq("status", "pending")
      .not("email", "is", null)
      .order("sent_at", { ascending: false });
    setPending(((inv ?? []) as any[]) as PendingInvite[]);

    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  // Signal rizika/aktivnosti po vezbacu (backend racuna sve).
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.rpc("get_athletes_overview");
      const res = data as any;
      if (!res?.success || !Array.isArray(res.athletes)) return;
      const m = new Map<string, { risk: string; days_since_last: number | null }>();
      res.athletes.forEach((a: any) =>
        m.set(a.athlete_id, { risk: a.risk, days_since_last: a.days_since_last }),
      );
      setOverview(m);
    })();
  }, [user]);

  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const status = statusFromEnds(r.membership?.ends_on ?? null);
        const expiresLabel = r.membership?.ends_on
          ? `do ${new Date(r.membership.ends_on).toLocaleDateString("sr-Latn-RS", { day: "2-digit", month: "short" })}`
          : "Bez članarine";
        return { ...r, status, expiresLabel };
      }),
    [rows],
  );

  const filtered = enriched.filter(
    (a) =>
      (filter === "all" || a.status === filter) &&
      (a.profile?.full_name ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  // Racunar: broj po filteru stoji u samom dugmetu, da trener odmah vidi raspodelu.
  const countByFilter: Record<(typeof filters)[number]["key"], number> = {
    all: enriched.length,
    active: enriched.filter((a) => a.status === "active").length,
    expiring: enriched.filter((a) => a.status === "expiring").length,
    expired: enriched.filter((a) => a.status === "expired").length,
  };

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [sending, setSending] = useState(false);

  const sendInvite = async () => {
    if (locked) return openLock();
    const name = inviteName.trim();
    const email = inviteEmail.trim().toLowerCase();
    if (!name) { toast.error("Unesi ime vežbača"); return; }
    if (!email || !email.includes("@")) { toast.error("Unesi validan email"); return; }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-invite", {
        body: { full_name: name, email },
      });

      // Ako je funkcija vratila non-2xx, izvuci pravu poruku iz response body-ja
      if (error) {
        let serverMsg: string | null = null;
        const ctx: any = (error as any).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const j = await ctx.json();
            serverMsg = j?.error ?? null;
          } catch {
            try { serverMsg = await ctx.text(); } catch { /* ignore */ }
          }
        }
        throw new Error(serverMsg || error.message || "Greška pri slanju pozivnice");
      }
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success(`Pozivnica poslata na ${email}`);
      setInviteOpen(false);
      setInviteName("");
      setInviteEmail("");
    } catch (e: any) {
      toast.error(porukaGreske(e));
    } finally {
      setSending(false);
    }
  };

  const resendInvite = async (inv: PendingInvite) => {
    if (locked) return openLock();
    if (!inv.email) return;
    setResendingId(inv.id);
    try {
      // Otkazi stari invite
      await supabase.from("invites").update({ status: "cancelled" }).eq("id", inv.id);

      // Pošalji novi sa istim podacima
      const { data, error } = await supabase.functions.invoke("send-invite", {
        body: { full_name: inv.full_name ?? inv.email, email: inv.email },
      });

      if (error) {
        let serverMsg: string | null = null;
        const ctx: any = (error as any).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const j = await ctx.json();
            serverMsg = j?.error ?? null;
          } catch { /* ignore */ }
        }
        throw new Error(serverMsg || error.message || "Greška pri slanju");
      }
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success(`Pozivnica ponovo poslata na ${inv.email}`);
      await load();
    } catch (e: any) {
      toast.error(porukaGreske(e));
      // Vrati stari invite na pending da se ne izgubi
      await supabase.from("invites").update({ status: "pending" }).eq("id", inv.id);
      await load();
    } finally {
      setResendingId(null);
    }
  };

  const confirmDeleteInvite = async () => {
    if (locked) return openLock();
    if (!inviteToDelete) return;
    setDeletingInvite(true);
    try {
      const { error } = await supabase.from("invites").delete().eq("id", inviteToDelete.id);
      if (error) throw error;
      toast.success("Pozivnica obrisana");
      setInviteToDelete(null);
      await load();
    } catch (e: any) {
      toast.error(porukaGreske(e));
    } finally {
      setDeletingInvite(false);
    }
  };

  return (
    <>
      <PhoneShell
        hasBottomNav
        title="Vežbači"
        eyebrow={`${rows.length} ukupno`}
        desktopWidth="wide"
        // Racunar: poziv je dugme u zaglavlju. Na telefonu je siroko dugme ispod
        // liste, koje bi na sirokom ekranu zavrsilo daleko od pogleda.
        action={
          desktop ? (
            <Button
              onClick={guard(() => setInviteOpen(true))}
              className="h-10 rounded-full px-4 bg-gradient-brand text-white shadow-brand"
            >
              <LockMark className="mr-1.5" />
              <Mail className="h-4 w-4 mr-1.5" />
              Pozovi vežbača
            </Button>
          ) : undefined
        }
      >
        {desktop ? (
          // Racunar: vrh sa krugom aktivnosti, kome da se javis i pozivnicama, pa
          // pretraga i filteri u jednom redu i vezbaci kao tabela sa kolonama.
          <div className="space-y-5">
            {!loading && rows.length > 0 && (
              <VrhVezbaca rows={rows} overview={overview} pending={pending} />
            )}
            <div className="flex items-center justify-between gap-4">
              <div className="flex h-10 w-full max-w-sm items-center gap-2 rounded-full border border-hairline bg-surface px-4 transition focus-within:ring-2 focus-within:ring-primary/40">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Pretraži ime..."
                  className="flex-1 min-w-0 bg-transparent text-[14px] placeholder:text-muted-foreground/70 focus:outline-none"
                />
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-full border border-hairline bg-surface p-1">
                {filters.map((f) => {
                  const aktivan = filter === f.key;
                  return (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      aria-pressed={aktivan}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition",
                        aktivan ? "bg-surface-2 text-foreground shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.1)]" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {f.label}
                      <span className={cn("tnum text-[11.5px] font-bold", aktivan ? "text-primary-soft-foreground" : "text-muted-foreground/70")}>
                        {countByFilter[f.key]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="card-premium overflow-hidden">
                  {filtered.length === 0 ? (
                    <div className="flex flex-col items-center px-6 py-14 text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-brand-soft">
                        <Users className="h-5 w-5 text-primary" strokeWidth={2.25} />
                      </div>
                      <div className="font-display text-[17px] font-bold tracking-tight">
                        {rows.length === 0 ? "Još nemaš vežbača" : "Nema rezultata"}
                      </div>
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        {rows.length === 0
                          ? "Pozovi prvog vežbača emailom i pojaviće se ovde."
                          : "Probaj drugi filter ili drugo ime."}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className={cn(ATHLETE_COLS, TABLE_HEAD)}>
                        <div>Vežbač</div>
                        <div>Članarina</div>
                        <div>Aktivnost</div>
                        <div>Status</div>
                        <div />
                      </div>
                      <ul className="divide-y divide-hairline">
                        {filtered.map((a) => {
                          const ov = overview.get(a.id);
                          return (
                            <li key={a.id}>
                              <Link
                                to={`/trener/vezbaci/${a.id}`}
                                className={cn(ATHLETE_COLS, "px-5 py-3.5 transition hover:bg-surface-2")}
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <Avatar
                                    initials={initialsOf(a.profile?.full_name ?? null)}
                                    tone={a.status === "expiring" ? "athlete" : "brand"}
                                    size="sm"
                                    className="ring-0"
                                  />
                                  <div className="min-w-0">
                                    <div className="text-[14px] font-semibold leading-tight tracking-tight">
                                      {a.profile?.full_name ?? "Bez imena"}
                                    </div>
                                    <div className="truncate text-[12px] text-muted-foreground">
                                      {goalLabel[a.goal ?? "general"] ?? "Opšte"}
                                    </div>
                                  </div>
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[13.5px] font-medium leading-tight">
                                    {a.membership?.plan_name ?? "Bez članarine"}
                                  </div>
                                  {a.membership && (
                                    <div className="truncate text-[12px] text-muted-foreground tnum">
                                      {a.membership.ends_on ? a.expiresLabel : "Bez roka"}
                                    </div>
                                  )}
                                </div>
                                <div className="flex min-w-0 items-center gap-2">
                                  {ov ? (
                                    <>
                                      <span className={cn("h-2 w-2 shrink-0 rounded-full", RISK_DOT[ov.risk] ?? "bg-muted")} />
                                      <span className="truncate text-[13px] text-muted-foreground">
                                        {recencyText(ov.days_since_last)}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-[13px] text-muted-foreground/60">-</span>
                                  )}
                                </div>
                                <div>{statusChip[a.status]}</div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>

                {pending.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-baseline gap-2 px-1">
                      <h2 className="font-display text-[17px] font-bold tracking-tight">Poslate pozivnice</h2>
                      <span className="text-[13px] font-semibold text-muted-foreground tnum">{pending.length}</span>
                    </div>
                    <div className="card-premium overflow-hidden">
                      <div className={cn(INVITE_COLS, TABLE_HEAD)}>
                        <div>Pozvan</div>
                        <div>Poslato</div>
                        <div>Status</div>
                        <div className="text-right">Radnje</div>
                      </div>
                      <ul className="divide-y divide-hairline">
                        {pending.map((p) => {
                          const expired = p.expires_at
                            ? new Date(p.expires_at).getTime() < Date.now()
                            : false;
                          const sentLabel = p.sent_at
                            ? new Date(p.sent_at).toLocaleDateString("sr-Latn-RS", {
                                day: "2-digit", month: "short",
                              })
                            : "-";
                          return (
                            <li key={p.id} className={cn(INVITE_COLS, "px-5 py-3 transition hover:bg-surface-2")}>
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
                                  <Clock className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-[14px] font-semibold tracking-tight">
                                    {p.full_name ?? p.email}
                                  </div>
                                  <div className="truncate text-[12px] text-muted-foreground">{p.email}</div>
                                </div>
                              </div>
                              <div className="text-[13px] text-muted-foreground tnum">{sentLabel}</div>
                              <div>
                                <Chip tone={expired ? "danger" : "warning"}>
                                  {expired ? "Istekla" : "Čeka"}
                                </Chip>
                              </div>
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="outline"
                                  onClick={() => resendInvite(p)}
                                  disabled={resendingId === p.id}
                                  className="h-8 rounded-full px-3 text-[12.5px]"
                                >
                                  {resendingId === p.id ? (
                                    <Loader className="animate-spin" />
                                  ) : (
                                    <RefreshCw />
                                  )}
                                  Pošalji ponovo
                                </Button>
                                <button
                                  onClick={() => setInviteToDelete(p)}
                                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive-soft hover:text-destructive"
                                  title="Obriši pozivnicu"
                                  aria-label="Obriši pozivnicu"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="flex items-center gap-2 card-premium px-4 py-3 focus-within:ring-2 focus-within:ring-primary/40 transition">
              <Search className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={2} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Pretraži ime..."
                className="bg-transparent flex-1 text-[15px] placeholder:text-muted-foreground/70 focus:outline-none"
              />
            </div>

            {/* Filter pills */}
            <div className="flex gap-2 -mx-2 px-2 overflow-x-auto no-scrollbar">
              {filters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "pill px-4 py-2 text-[13px] whitespace-nowrap transition",
                    filter === f.key
                      ? "bg-foreground text-background"
                      : "bg-surface border border-hairline text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <ul className="space-y-2">
                  {filtered.map((a) => (
                    <li key={a.id}>
                      <Link
                        to={`/trener/vezbaci/${a.id}`}
                        className="flex items-center gap-3 card-premium-hover px-4 py-3"
                      >
                        <Avatar
                          initials={initialsOf(a.profile?.full_name ?? null)}
                          tone={a.status === "expiring" ? "athlete" : "brand"}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[15px] font-semibold tracking-tight truncate">
                            {a.profile?.full_name ?? "Bez imena"}
                          </div>
                          <div className="text-[12.5px] text-muted-foreground mt-0.5 truncate">
                            {goalLabel[a.goal ?? "general"] ?? "Opšte"} · {a.expiresLabel}
                          </div>
                          {overview.get(a.id) && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full shrink-0",
                                  RISK_DOT[overview.get(a.id)!.risk] ?? "bg-muted",
                                )}
                              />
                              <span className="text-[11.5px] text-muted-foreground truncate">
                                {recencyText(overview.get(a.id)!.days_since_last)}
                              </span>
                            </div>
                          )}
                        </div>
                        {statusChip[a.status]}
                        <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                      </Link>
                    </li>
                  ))}
                  {filtered.length === 0 && (
                    <li className="text-center text-[13px] text-muted-foreground py-10">
                      {rows.length === 0 ? "Još nemaš vežbača." : "Nema rezultata."}
                    </li>
                  )}
                </ul>

                {/* Pending pozivnice */}
                {pending.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <div className="eyebrow text-muted-foreground px-1">
                      Poslate pozivnice · {pending.length}
                    </div>
                    <ul className="space-y-2">
                      {pending.map((p) => {
                        const expired = p.expires_at
                          ? new Date(p.expires_at).getTime() < Date.now()
                          : false;
                        const sentLabel = p.sent_at
                          ? new Date(p.sent_at).toLocaleDateString("sr-Latn-RS", {
                              day: "2-digit", month: "short",
                            })
                          : "-";
                        return (
                          <li
                            key={p.id}
                            className="flex items-center gap-3 card-premium px-4 py-3"
                          >
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[14.5px] font-semibold tracking-tight truncate">
                                {p.full_name ?? p.email}
                              </div>
                              <div className="text-[12px] text-muted-foreground mt-0.5 truncate">
                                {p.email} · {expired ? "istekla" : `poslato ${sentLabel}`}
                              </div>
                            </div>
                            <Chip tone={expired ? "danger" : "warning"}>
                              {expired ? "Istekla" : "Čeka"}
                            </Chip>
                            <button
                              onClick={() => resendInvite(p)}
                              disabled={resendingId === p.id}
                              className="h-9 w-9 rounded-full bg-primary-soft/60 hover:bg-primary-soft text-primary flex items-center justify-center transition disabled:opacity-50"
                              title="Pošalji ponovo"
                            >
                              {resendingId === p.id ? (
                                <Loader className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              onClick={() => setInviteToDelete(p)}
                              className="h-9 w-9 rounded-full bg-destructive/10 hover:bg-destructive/20 text-destructive flex items-center justify-center transition"
                              title="Obriši pozivnicu"
                              aria-label="Obriši pozivnicu"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <button
                  onClick={guard(() => setInviteOpen(true))}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-brand text-white py-4 text-[14px] font-semibold shadow-brand active:scale-[0.99] transition"
                >
                  <LockMark /><Mail className="h-4 w-4" /> Pozovi vežbača emailom
                </button>
              </>
            )}
          </>
        )}
      </PhoneShell>
      <BottomNav role="trainer" />

      {/* Invite sheet */}
      <FullScreenSheet open={inviteOpen} onClose={() => setInviteOpen(false)} title="Pozovi novog vežbača">
        <FullScreenSheetScroll className="pt-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            Poslaće mu se email sa linkom za pridruživanje. Link važi 7 dana.
          </p>
          <div>
            <Label htmlFor="inv-name">Ime i prezime</Label>
            <Input
              id="inv-name"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="npr. Marko Petrović"
              className="mt-1.5 h-14 text-base rounded-2xl"
              disabled={sending}
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="inv-email">Email</Label>
            <Input
              id="inv-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="marko@email.com"
              className="mt-1.5 h-14 text-base rounded-2xl"
              disabled={sending}
            />
          </div>
        </FullScreenSheetScroll>
        <FullScreenSheetFooter>
          <Button onClick={sendInvite} disabled={sending} className="w-full bg-gradient-brand text-white shadow-brand">
            {sending ? (
              <><Loader className="h-4 w-4 mr-2 animate-spin" /> Šaljem...</>
            ) : (
              <><Mail className="h-4 w-4 mr-2" /> Pošalji pozivnicu</>
            )}
          </Button>
        </FullScreenSheetFooter>
      </FullScreenSheet>

      <AlertDialog open={!!inviteToDelete} onOpenChange={(o) => !o && setInviteToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Obrisati pozivnicu?</AlertDialogTitle>
            <AlertDialogDescription>
              Pozivnica za {inviteToDelete?.full_name ?? inviteToDelete?.email} biće trajno obrisana.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingInvite}>Otkaži</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDeleteInvite(); }}
              disabled={deletingInvite}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingInvite ? "Brisanje..." : "Obriši"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AthletesList;

// ===== Vrh ekrana na racunaru (Ponoc) =====
type Pregled = Map<string, { risk: string; days_since_last: number | null }>;

const PRSTEN = 2 * Math.PI * 46;

const VrhVezbaca = ({ rows, overview, pending }: { rows: AthleteRow[]; overview: Pregled; pending: PendingInvite[] }) => {
  const vrednosti = Array.from(overview.values());
  const redovno = vrednosti.filter((v) => v.risk === "low").length;
  const usporilo = vrednosti.filter((v) => v.risk === "medium").length;
  const nestalo = vrednosti.filter((v) => v.risk === "high").length;
  const ukupno = Math.max(1, redovno + usporilo + nestalo);
  const delovi = [
    { n: redovno, boja: "hsl(var(--success))", ime: "trenira redovno" },
    { n: usporilo, boja: "hsl(var(--warning))", ime: "usporilo" },
    { n: nestalo, boja: "hsl(var(--destructive))", ime: "nestalo" },
  ];
  let pomak = 0;

  // Kome treba da se javis: ko 14 dana i vise nije trenirao, pa oni koji nikad nisu
  // (isto merilo kao prsten, gde su oboje "nestalo"); najvise dvoje u naslovu.
  const imena = new Map(rows.map((r) => [r.id, r.profile?.full_name ?? "Bez imena"]));
  const zaboravili = Array.from(overview.entries())
    .filter(([, v]) => v.days_since_last == null || v.days_since_last >= 14)
    .sort((a, b) => (b[1].days_since_last ?? -1) - (a[1].days_since_last ?? -1));
  const prvaImena = zaboravili.slice(0, 2).map(([id]) => (imena.get(id) ?? "").split(" ")[0]);
  const naslovJavi =
    zaboravili.length === 0
      ? "Svi su trenirali u poslednje dve nedelje"
      : zaboravili.length === 1
        ? `${prvaImena[0]} nije trenirao u poslednje dve nedelje`
        : zaboravili.length === 2
          ? `${prvaImena[0]} i ${prvaImena[1]} nisu trenirali u poslednje dve nedelje`
          : `${prvaImena[0]}, ${prvaImena[1]} i još ${zaboravili.length - 2} nisu trenirali u poslednje dve nedelje`;

  return (
    // Uzi ekran (do 1279 px): pozivnice idu u svoj red ispod, da "Javi se" ne ostane bez mesta.
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-[330px_minmax(0,1fr)_300px]">
      <section className="card-premium flex items-center gap-5 rounded-[26px] px-[22px] py-5">
        <div className="relative shrink-0">
          <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden>
            <circle cx="60" cy="60" r="46" fill="none" stroke="hsl(0 0% 100% / 0.06)" strokeWidth="11" />
            {delovi.map((d) => {
              if (d.n === 0) return null;
              const duzina = (PRSTEN * d.n) / ukupno;
              const el = (
                <circle
                  key={d.ime}
                  cx="60"
                  cy="60"
                  r="46"
                  fill="none"
                  stroke={d.boja}
                  strokeWidth="11"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.max(duzina - 5, 1)} ${PRSTEN}`}
                  strokeDashoffset={-pomak}
                  transform="rotate(-90 60 60)"
                />
              );
              pomak += duzina;
              return el;
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="fig text-[38px] leading-none">{rows.length}</span>
            <span className="text-[10.5px] text-muted-foreground">vežbača</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-[12.5px] text-muted-foreground">
          {delovi.map((d) => (
            <span key={d.ime} className="flex items-baseline">
              <i className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: d.boja }} />
              <b className="fig mr-1.5 text-[17px] text-foreground">{d.n}</b>
              {d.ime}
            </span>
          ))}
        </div>
      </section>

      <section
        className="card-premium flex flex-col justify-between rounded-[26px] px-[22px] py-5"
        style={{ background: zaboravili.length ? "linear-gradient(135deg, hsl(36 100% 64% / 0.12), hsl(var(--card)) 60%)" : undefined }}
      >
        <div>
          <span className={cn("text-[10px] font-semibold uppercase tracking-[0.13em]", zaboravili.length ? "text-warning" : "text-success")}>
            {zaboravili.length ? "Javi se" : "Sve je u redu"}
          </span>
          <h3 className="mt-1.5 font-display text-[19px] font-semibold leading-tight tracking-tight">{naslovJavi}</h3>
        </div>
        {zaboravili.length > 0 && (
          <div className="mt-3 flex items-center justify-between">
            <div className="flex">
              {zaboravili.slice(0, 4).map(([id], i) => (
                <span key={id} className={cn("grid h-[38px] w-[38px] place-items-center rounded-full bg-gradient-brand text-[12px] font-bold text-white shadow-[0_0_0_3px_hsl(var(--card))]", i > 0 && "-ml-2")}>
                  {initialsOf(imena.get(id) ?? null)}
                </span>
              ))}
            </div>
            <Link
              to={`/trener/chat/${zaboravili[0][0]}`}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-full bg-white px-3.5 text-[12px] font-semibold text-background"
            >
              Poruka
            </Link>
          </div>
        )}
      </section>

      <section className="card-premium col-span-2 rounded-[26px] px-[18px] py-4 xl:col-span-1">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display text-[15px] font-semibold">Poslate pozivnice</h3>
          <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold text-primary-soft-foreground">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <p className="mt-2 text-[12px] text-muted-foreground">Nema pozivnica koje čekaju odgovor.</p>
        ) : (
          pending.slice(0, 2).map((p) => {
            const istekla = p.expires_at ? new Date(p.expires_at).getTime() < Date.now() : false;
            return (
              <div key={p.id} className="flex items-center gap-2.5 border-t border-hairline py-2 first-of-type:border-t-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold">{p.full_name ?? p.email}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {p.sent_at ? `poslato ${new Date(p.sent_at).toLocaleDateString("sr-Latn-RS", { day: "numeric", month: "short" })}` : "nije poslato"}
                  </div>
                </div>
                <Chip tone={istekla ? "danger" : "warning"}>{istekla ? "Istekla" : "Čeka"}</Chip>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
};
