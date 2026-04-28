import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Avatar, Chip } from "@/components/ui-bits";
import { Search, Plus, ChevronRight, Loader2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type AthleteRow = {
  id: string;
  goal: string | null;
  joined_at: string;
  profile: { full_name: string | null } | null;
  membership: { plan_name: string; status: string; ends_on: string | null } | null;
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

  const copyInvite = async () => {
    if (!inviteCode) {
      toast.error("Nemaš invite kod. Idi na onboarding.");
      return;
    }
    const url = `${window.location.origin}/invite/${inviteCode}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link kopiran");
    } catch {
      toast.error("Ne mogu da kopiram");
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
              onClick={copyInvite}
              className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline hover:border-primary/40 hover:bg-primary-soft/40 py-4 text-[14px] font-semibold text-muted-foreground hover:text-primary-soft-foreground transition"
            >
              <UserPlus className="h-4 w-4" /> Pošalji invite link
            </button>
          </>
        )}
      </PhoneShell>
      <BottomNav role="trainer" />
    </>
  );
};

export default AthletesList;
