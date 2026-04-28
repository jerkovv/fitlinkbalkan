import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Avatar, Chip } from "@/components/ui-bits";
import { Search, ChevronRight, Loader2, UserPlus, Mail, Loader, Clock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  expiring: <Chip tone="warning">Uskoro</Chip>,
  expired: <Chip tone="danger">Istekao</Chip>,
};

const filters: { key: "all" | "active" | "expiring" | "expired"; label: string }[] = [
  { key: "all", label: "Svi" },
  { key: "active", label: "Aktivni" },
  { key: "expiring", label: "Uskoro" },
  { key: "expired", label: "Istekli" },
];

const AthletesList = () => {
  const { user } = useAuth();
  const [filter, setFilter] = useState<"all" | "active" | "expiring" | "expired">("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AthleteRow[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);

    const { data: ath, error } = await supabase
      .from("athletes")
      .select("id, goal, joined_at")
      .eq("trainer_id", user.id)
      .order("joined_at", { ascending: false });

    if (error) {
      toast.error(error.message);
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

    // Trainer invite code (za "dodaj vežbača")
    const { data: tr } = await supabase
      .from("trainers")
      .select("invite_code")
      .eq("id", user.id)
      .maybeSingle();
    setInviteCode((tr as any)?.invite_code ?? null);

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

  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const status = statusFromEnds(r.membership?.ends_on ?? null);
        const expiresLabel = r.membership?.ends_on
          ? `do ${new Date(r.membership.ends_on).toLocaleDateString("sr-RS", { day: "2-digit", month: "short" })}`
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

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [sending, setSending] = useState(false);

  const sendInvite = async () => {
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
      toast.error(e.message ?? "Greška pri slanju pozivnice");
    } finally {
      setSending(false);
    }
  };

  const copyInviteLink = async () => {
    if (!inviteCode) {
      toast.error("Nemaš lični invite link.");
      return;
    }
    const url = `${window.location.origin}/invite/${inviteCode}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link kopiran");
    } catch {
      toast.error("Ne mogu da kopiram");
    }
  };

  const resendInvite = async (inv: PendingInvite) => {
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
      toast.error(e.message ?? "Greška pri ponovnom slanju");
      // Vrati stari invite na pending da se ne izgubi
      await supabase.from("invites").update({ status: "pending" }).eq("id", inv.id);
      await load();
    } finally {
      setResendingId(null);
    }
  };

  return (
    <>
      <PhoneShell hasBottomNav title="Vežbači" eyebrow={`${rows.length} ukupno`}>
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

            <button
              onClick={() => setInviteOpen(true)}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-brand text-white py-4 text-[14px] font-semibold shadow-brand active:scale-[0.99] transition"
            >
              <Mail className="h-4 w-4" /> Pozovi vežbača emailom
            </button>
            <button
              onClick={copyInviteLink}
              className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline hover:border-primary/40 hover:bg-primary-soft/40 py-3 text-[13px] font-semibold text-muted-foreground hover:text-primary-soft-foreground transition mt-2"
            >
              <UserPlus className="h-4 w-4" /> ili kopiraj lični link
            </button>
          </>
        )}
      </PhoneShell>
      <BottomNav role="trainer" />

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pozovi novog vežbača</DialogTitle>
            <DialogDescription>
              Poslaće mu se email sa linkom za pridruživanje. Link važi 7 dana.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label htmlFor="inv-name">Ime i prezime</Label>
              <Input
                id="inv-name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="npr. Marko Petrović"
                className="mt-1.5"
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
                className="mt-1.5"
                disabled={sending}
              />
            </div>
            <Button
              onClick={sendInvite}
              disabled={sending}
              className="w-full mt-4"
            >
              {sending ? (
                <><Loader className="h-4 w-4 mr-2 animate-spin" /> Šaljem...</>
              ) : (
                <><Mail className="h-4 w-4 mr-2" /> Pošalji pozivnicu</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AthletesList;
