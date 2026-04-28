import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Avatar, Card, Chip, SectionTitle, StatCard } from "@/components/ui-bits";
import {
  Clock, ChevronRight, ClipboardList, Apple, Package, Wallet,
  Calendar as CalIcon, Users, Settings,
} from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type SessionRow = {
  id: string;
  start_time: string;
  type_name: string;
  type_color: string;
  status: string;
  athlete_id: string;
  athlete_name: string | null;
};

const monthNames = [
  "Januar", "Februar", "Mart", "April", "Maj", "Jun",
  "Jul", "Avgust", "Septembar", "Oktobar", "Novembar", "Decembar",
];

const fmtTime = (t: string) => t?.slice(0, 5) ?? "";

const Dashboard = () => {
  const { user } = useAuth();
  const today = useMemo(() => new Date(), []);
  const todayISO = useMemo(() => today.toISOString().slice(0, 10), [today]);

  const [trainerName, setTrainerName] = useState<string>("");
  const [studio, setStudio] = useState<string>("");

  const [activeAthletes, setActiveAthletes] = useState(0);
  const [expiringSoon, setExpiringSoon] = useState(0);
  const [pendingPayments, setPendingPayments] = useState(0);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let alive = true;

    (async () => {
      setLoading(true);

      // Trener profil
      const [{ data: profile }, { data: trainer }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
        supabase.from("trainers").select("studio_name").eq("id", user.id).maybeSingle(),
      ]);

      if (!alive) return;
      setTrainerName((profile as any)?.full_name?.split(" ")[0] ?? "treneru");
      setStudio((trainer as any)?.studio_name ?? "Tvoj studio");

      // Vežbači
      const { data: ath } = await supabase
        .from("athletes")
        .select("id")
        .eq("trainer_id", user.id);
      const athleteIds = (ath ?? []).map((a: any) => a.id);

      // Članarine
      const in14 = new Date();
      in14.setDate(in14.getDate() + 14);
      const in14ISO = in14.toISOString().slice(0, 10);

      const [{ count: activeCount }, { count: expCount }, { count: pendCount }] = await Promise.all([
        supabase
          .from("memberships")
          .select("id", { count: "exact", head: true })
          .in("athlete_id", athleteIds.length ? athleteIds : ["00000000-0000-0000-0000-000000000000"])
          .eq("status", "active"),
        supabase
          .from("memberships")
          .select("id", { count: "exact", head: true })
          .in("athlete_id", athleteIds.length ? athleteIds : ["00000000-0000-0000-0000-000000000000"])
          .eq("status", "active")
          .lte("ends_on", in14ISO)
          .gte("ends_on", todayISO),
        supabase
          .from("membership_purchases")
          .select("id", { count: "exact", head: true })
          .eq("trainer_id", user.id)
          .eq("status", "pending"),
      ]);

      if (!alive) return;
      setActiveAthletes(activeCount ?? 0);
      setExpiringSoon(expCount ?? 0);
      setPendingPayments(pendCount ?? 0);

      // Današnje sesije
      const { data: book } = await supabase
        .from("session_bookings")
        .select("id, start_time, type_name, type_color, status, athlete_id")
        .eq("trainer_id", user.id)
        .eq("date", todayISO)
        .neq("status", "canceled")
        .order("start_time", { ascending: true });

      const bookings = (book ?? []) as any[];
      const aIds = Array.from(new Set(bookings.map((b) => b.athlete_id)));
      const { data: profs } = aIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", aIds)
        : { data: [] as any[] };
      const nameMap = new Map<string, string | null>(
        (profs ?? []).map((p: any) => [p.id, p.full_name])
      );

      if (!alive) return;
      setSessions(
        bookings.map((b) => ({
          id: b.id,
          start_time: b.start_time,
          type_name: b.type_name,
          type_color: b.type_color,
          status: b.status,
          athlete_id: b.athlete_id,
          athlete_name: nameMap.get(b.athlete_id) ?? "Vežbač",
        }))
      );
      setLoading(false);
    })();

    return () => { alive = false; };
  }, [user, todayISO]);

  const copyInvite = async () => {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    toast.success("Invite kod kopiran");
    setTimeout(() => setCopied(false), 1500);
  };

  const todayLabel = `${today.getDate()}. ${monthNames[today.getMonth()]}`;

  return (
    <>
      <PhoneShell
        hasBottomNav
        eyebrow="Dobro došao nazad"
        title={
          <h1 className="font-display text-[34px] leading-[1.05] font-bold tracking-tightest">
            Zdravo, {trainerName}
            <span className="text-gradient-brand"> 👋</span>
          </h1>
        }
        rightSlot={
          <div className="flex items-center gap-2">
            <NotificationBell />
            <UserMenu />
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <StatCard tone="brand" value={String(activeAthletes)} unit="članova" label="Aktivnih" />
          <StatCard tone="warning" value={String(expiringSoon)} unit="ističu" label="≤ 14 dana" />
        </div>

        {/* Today */}
        <section>
          <SectionTitle
            action={
              <Link to="/trener/kalendar" className="text-[12px] font-semibold text-primary">
                Kalendar →
              </Link>
            }
          >
            Danas, {todayLabel}
          </SectionTitle>

          {loading ? (
            <Card className="p-6 text-center text-[13px] text-muted-foreground">Učitavanje…</Card>
          ) : sessions.length === 0 ? (
            <Card className="p-6 text-center">
              <CalIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" strokeWidth={1.5} />
              <div className="text-[13.5px] font-medium">Danas nema zakazanih treninga</div>
              <div className="text-[12px] text-muted-foreground mt-0.5">
                Vežbači mogu da rezervišu termine iz kalendara
              </div>
            </Card>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/trener/vezbaci/${s.athlete_id}`}
                    className="flex items-center gap-3 card-premium-hover px-4 py-3.5"
                  >
                    <div
                      className="h-11 w-11 rounded-2xl flex items-center justify-center"
                      style={{ background: `${s.type_color}22`, color: s.type_color }}
                    >
                      <Clock className="h-[18px] w-[18px]" strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-semibold leading-tight tracking-tight truncate">
                        {fmtTime(s.start_time)} · {s.athlete_name}
                      </div>
                      <div className="text-[12.5px] text-muted-foreground mt-0.5 truncate">
                        {s.type_name}
                      </div>
                    </div>
                    <Chip tone="info">Zakazano</Chip>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Studio */}
        <Card className="p-4 bg-gradient-brand-soft border-0">
          <div className="flex items-center gap-3">
            <Avatar
              initials={(studio || "S").slice(0, 2).toUpperCase()}
              tone="brand"
              size="md"
            />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold tracking-tight truncate">{studio}</div>
              <div className="text-[12px] text-muted-foreground">Tvoj studio</div>
            </div>
          </div>
        </Card>

        {/* Quick actions */}
        <SectionTitle>Brze akcije</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/trener/vezbaci" className="card-premium-hover p-4 flex flex-col gap-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-brand-soft flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" strokeWidth={2.25} />
            </div>
            <div>
              <div className="font-semibold text-sm tracking-tight">Vežbači</div>
              <div className="text-[11px] text-muted-foreground">Lista i pozivi</div>
            </div>
          </Link>
          <Link to="/trener/programi" className="card-premium-hover p-4 flex flex-col gap-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-brand-soft flex items-center justify-center">
              <ClipboardList className="h-5 w-5 text-primary" strokeWidth={2.25} />
            </div>
            <div>
              <div className="font-semibold text-sm tracking-tight">Programi</div>
              <div className="text-[11px] text-muted-foreground">Treninzi</div>
            </div>
          </Link>
          <Link to="/trener/ishrana" className="card-premium-hover p-4 flex flex-col gap-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-brand-soft flex items-center justify-center">
              <Apple className="h-5 w-5 text-primary" strokeWidth={2.25} />
            </div>
            <div>
              <div className="font-semibold text-sm tracking-tight">Ishrana</div>
              <div className="text-[11px] text-muted-foreground">Planovi</div>
            </div>
          </Link>
          <Link to="/trener/paketi" className="card-premium-hover p-4 flex flex-col gap-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-brand-soft flex items-center justify-center">
              <Package className="h-5 w-5 text-primary" strokeWidth={2.25} />
            </div>
            <div>
              <div className="font-semibold text-sm tracking-tight">Paketi</div>
              <div className="text-[11px] text-muted-foreground">Članarine</div>
            </div>
          </Link>
          <Link to="/trener/uplate" className="card-premium-hover p-4 flex flex-col gap-2 relative">
            <div className="h-10 w-10 rounded-xl bg-gradient-brand-soft flex items-center justify-center">
              <Wallet className="h-5 w-5 text-primary" strokeWidth={2.25} />
            </div>
            <div>
              <div className="font-semibold text-sm tracking-tight">Uplate</div>
              <div className="text-[11px] text-muted-foreground">
                {pendingPayments > 0 ? `${pendingPayments} na čekanju` : "Zahtevi"}
              </div>
            </div>
            {pendingPayments > 0 && (
              <span className="absolute top-3 right-3 min-w-[20px] h-5 px-1.5 rounded-full bg-gradient-brand text-white text-[10px] font-bold flex items-center justify-center shadow-brand">
                {pendingPayments}
              </span>
            )}
          </Link>
          <Link to="/trener/termini" className="card-premium-hover p-4 flex flex-col gap-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-brand-soft flex items-center justify-center">
              <Settings className="h-5 w-5 text-primary" strokeWidth={2.25} />
            </div>
            <div>
              <div className="font-semibold text-sm tracking-tight">Termini</div>
              <div className="text-[11px] text-muted-foreground">Podešavanja</div>
            </div>
          </Link>
        </div>

        <Link
          to="/trener/profil"
          className="flex items-center justify-between rounded-2xl border border-hairline px-4 py-3 hover:border-primary/40 hover:bg-primary-soft/40 transition"
        >
          <div>
            <div className="text-[13.5px] font-semibold tracking-tight">Tvoj profil</div>
            <div className="text-[11.5px] text-muted-foreground">Studio, kontakt, naplata</div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </PhoneShell>
      <BottomNav role="trainer" />
    </>
  );
};

export default Dashboard;
