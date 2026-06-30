import { useEffect, useMemo, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { SectionTitle } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import { Clock, Users, User, Check, Loader2, X, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useClanarinaLock } from "@/components/clanarina/useClanarinaLock";
import { friendlyDbError } from "@/lib/dbError";
import { useConfirm } from "@/hooks/useConfirm";
import { useAuth } from "@/hooks/useAuth";
import {
  sessionColorClasses, dateToWeekday, toIsoDate, formatTime, addMinutesToTime,
} from "@/lib/session";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const weekdayShort = ["PON", "UTO", "SRE", "ČET", "PET", "SUB", "NED"];

type Slot = {
  session_type_id: string;
  type_name: string;
  type_color: string;
  start_time: string;
  duration_min: number;
  capacity: number;
  booked_count: number;
  is_canceled: boolean;
  template_id: string | null;
  // id MOJE rezervacije (status booked) za ovaj slot, null ako je otkazana ili je nemam.
  // Jedini izvor istine za "Rezervisano" + Otkazi (resava bag sa otkazanim rezervacijama).
  my_booking_id: string | null;
  // Waitlist: koliko ih ceka na ovaj slot + id MOG reda cekanja (null ako nisam na listi).
  waitlist_count: number;
  my_waitlist_id: string | null;
};

const Booking = () => {
  const { user } = useAuth();
  const { hasAccess, guard } = useClanarinaLock();
  const confirm = useConfirm();
  const today = useMemo(() => new Date(), []);
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [trainerName, setTrainerName] = useState<string>("");
  const [hasMembership, setHasMembership] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [showAttendees, setShowAttendees] = useState<boolean>(false);
  const [cancelCutoff, setCancelCutoff] = useState<number>(0);
  const [attendeesSlot, setAttendeesSlot] = useState<Slot | null>(null);
  const [attendees, setAttendees] = useState<{ athlete_id: string; full_name: string; is_me: boolean }[]>([]);
  const [attendeesLoading, setAttendeesLoading] = useState(false);
  // Moja pozicija na listi cekanja, kljuc = my_waitlist_id (lenjo dohvaceno po slotu).
  const [positions, setPositions] = useState<Record<string, number>>({});

  // 7 dana napred (počinjući od danas)
  const days = useMemo(() => {
    return Array.from({ length: 14 }).map((_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, [today]);

  // Učitaj trener + članarinu
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: ath } = await supabase
        .from("athletes")
        .select("trainer_id")
        .eq("id", user.id)
        .maybeSingle();
      const tid = (ath as any)?.trainer_id ?? null;
      setTrainerId(tid);

      if (tid) {
        const [{ data: prof }, { data: mem }, { data: tr }] = await Promise.all([
          supabase.from("profiles").select("full_name").eq("id", tid).maybeSingle(),
          supabase
            .from("memberships")
            .select("status, ends_on")
            .eq("athlete_id", user.id)
            .eq("trainer_id", tid)
            .eq("status", "active")
            .order("ends_on", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.from("trainers").select("show_attendees_to_athletes, cancel_cutoff_hours").eq("id", tid).maybeSingle(),
        ]);
        setShowAttendees(!!(tr as any)?.show_attendees_to_athletes);
        setCancelCutoff(((tr as any)?.cancel_cutoff_hours as number) ?? 0);
        setTrainerName((prof as any)?.full_name ?? "Trener");
        const m: any = mem;
        const todayISO = toIsoDate(today);
        setHasMembership(!!m && (!m.ends_on || m.ends_on >= todayISO));
      }
    })();
  }, [user, today]);

  const loadDay = async () => {
    if (!user || !trainerId) return;
    setLoading(true);
    const dateISO = toIsoDate(selectedDate);
    const { data } = await supabase.rpc("get_day_slots", {
      p_trainer_id: trainerId,
      p_date: dateISO,
    });
    setSlots((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { loadDay(); }, [user, trainerId, selectedDate]);

  // Kljuc slota (React key + actingKey); ne zavisi od rezervacija.
  const slotKey = (s: Slot) =>
    `${formatTime(s.start_time)}__${s.session_type_id}`;

  const book = async (s: Slot) => {
    if (!trainerId) return;
    if (!hasMembership) {
      toast.error("Potrebna ti je aktivna članarina za rezervaciju");
      return;
    }
    const key = slotKey(s);
    setActingKey(key);
    const { error } = await supabase.rpc("book_session", {
      p_trainer_id: trainerId,
      p_date: toIsoDate(selectedDate),
      p_start_time: formatTime(s.start_time),
      p_session_type_id: s.session_type_id,
    });
    setActingKey(null);
    if (error) { toast.error(friendlyDbError(error)); return; }
    toast.success("Termin rezervisan");
    loadDay();
  };

  const cancel = async (s: Slot) => {
    // Izvor istine je my_booking_id iz get_day_slots (samo status booked).
    if (!s.my_booking_id) return;
    if (!(await confirm({ title: "Otkazati rezervaciju?", destructive: true }))) return;
    const key = slotKey(s);
    setActingKey(key);
    const { error } = await supabase.rpc("cancel_session_booking", { p_booking_id: s.my_booking_id });
    setActingKey(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Rezervacija otkazana");
    loadDay();
  };

  // Da li je termin vec prosao (selektovani dan + start_time <= sada).
  const isPast = (s: Slot) => {
    const d = new Date(selectedDate);
    const [hh, mm] = formatTime(s.start_time).split(":").map(Number);
    d.setHours(hh || 0, mm || 0, 0, 0);
    return d.getTime() <= Date.now();
  };

  const joinWaitlist = async (s: Slot) => {
    if (!trainerId) return;
    const key = slotKey(s);
    setActingKey(key);
    // join_waitlist baca greske vec na srpskom -> prikazi error.message direktno.
    const { error } = await supabase.rpc("join_waitlist", {
      p_trainer_id: trainerId,
      p_date: toIsoDate(selectedDate),
      p_start_time: formatTime(s.start_time),
      p_session_type_id: s.session_type_id,
    });
    setActingKey(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Dodat si na listu čekanja");
    loadDay();
  };

  const leaveWaitlist = async (s: Slot) => {
    if (!s.my_waitlist_id) return;
    const key = slotKey(s);
    setActingKey(key);
    const { error } = await supabase.rpc("leave_waitlist", {
      p_waitlist_id: s.my_waitlist_id,
    });
    setActingKey(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Skinut si sa liste čekanja");
    loadDay();
  };

  // Lenjo dohvati moju poziciju za slotove na kojima sam na listi cekanja.
  useEffect(() => {
    if (!user || !trainerId) return;
    const onList = slots.filter((s) => s.my_waitlist_id && !s.is_canceled);
    if (onList.length === 0) { setPositions({}); return; }
    let cancelled = false;
    (async () => {
      const entries: Record<string, number> = {};
      await Promise.all(
        onList.map(async (s) => {
          const { data, error } = await supabase.rpc("get_slot_waitlist", {
            p_trainer_id: trainerId,
            p_date: toIsoDate(selectedDate),
            p_start_time: formatTime(s.start_time),
            p_session_type_id: s.session_type_id,
          });
          if (error || !data) return;
          const mine = (data as any[]).find((r) => r.athlete_id === user.id);
          if (mine && s.my_waitlist_id) entries[s.my_waitlist_id] = mine.queue_position;
        }),
      );
      if (!cancelled) setPositions(entries);
    })();
    return () => { cancelled = true; };
  }, [slots, user, trainerId, selectedDate]);

  const openAttendees = async (s: Slot) => {
    if (!trainerId || !showAttendees) return;
    setAttendeesSlot(s);
    setAttendees([]);
    setAttendeesLoading(true);
    const { data, error } = await supabase.rpc("get_slot_attendees", {
      p_trainer_id: trainerId,
      p_date: toIsoDate(selectedDate),
      p_start_time: formatTime(s.start_time),
      p_session_type_id: s.session_type_id,
    });
    setAttendeesLoading(false);
    if (error) { toast.error(error.message); return; }
    setAttendees((data as any[]) ?? []);
  };

  return (
    <>
      <PhoneShell hasBottomNav title="Rezerviši trening" eyebrow={trainerName ? `Kod ${trainerName}` : "Rezervacije"}>
        {/* Narandzasti "nema clanarine" baner uklonjen: lock sheet sada nosi tu poruku. */}

        {cancelCutoff > 0 && trainerId && (
          <div className="rounded-2xl bg-surface-2 border border-hairline px-4 py-2.5 text-[12px] text-muted-foreground">
            Otkazivanje je moguće najkasnije <span className="font-semibold text-foreground">{cancelCutoff}h</span> pre termina.
          </div>
        )}

        {/* Day picker */}
        <section>
          <SectionTitle>Koji dan?</SectionTitle>
          <div className="flex gap-2 -mx-2 px-2 overflow-x-auto no-scrollbar">
            {days.map((d) => {
              const active = toIsoDate(d) === toIsoDate(selectedDate);
              const wd = weekdayShort[dateToWeekday(d)];
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setSelectedDate(d)}
                  className={cn(
                    "shrink-0 w-[68px] py-3 rounded-2xl overflow-hidden text-center transition border",
                    active
                      ? "bg-gradient-brand text-primary-foreground border-[hsl(268_80%_56%)]"
                      : "bg-surface border-hairline hover:border-primary/30 text-foreground",
                  )}
                >
                  <div className="font-display text-[22px] font-bold tracking-tightest leading-none tnum">
                    {d.getDate()}
                  </div>
                  <div className={cn(
                    "text-[10px] font-semibold mt-1 tracking-wider",
                    active ? "text-primary-foreground/80" : "text-muted-foreground",
                  )}>
                    {wd}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Slots */}
        <section>
          <SectionTitle>U kojem terminu?</SectionTitle>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : slots.length === 0 ? (
            <div className="rounded-2xl bg-surface border border-hairline p-6 text-center text-[13px] text-muted-foreground">
              Nema termina za ovaj dan.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {slots.filter((s) => !s.is_canceled).map((s) => {
                const key = slotKey(s);
                // Odluka iskljucivo iz get_day_slots: my_booking_id je jedini izvor "Rezervisano".
                const booked = !!s.my_booking_id;
                const hasFreeSpot = s.booked_count < s.capacity;
                const colors = sessionColorClasses(s.type_color);
                const endTime = addMinutesToTime(formatTime(s.start_time), s.duration_min);
                const acting = actingKey === key;
                const onWaitlist = !!s.my_waitlist_id;
                const past = isPast(s);
                const myPosition = s.my_waitlist_id ? positions[s.my_waitlist_id] : undefined;

                return (
                  <li key={key} className="rounded-2xl bg-surface border border-hairline overflow-hidden">
                    {/* Header: type name */}
                    <div className={cn("px-4 py-2.5 flex items-center justify-between", colors.bg, colors.fg)}>
                      <div className="font-semibold text-[14px]">{s.type_name}</div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
                        {s.duration_min} min
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-4 text-[13px] text-muted-foreground mb-3">
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          <span className="tnum font-semibold text-foreground">
                            {formatTime(s.start_time)} – {endTime}
                          </span>
                        </span>
                        {showAttendees && s.booked_count > 0 ? (
                          <button
                            type="button"
                            onClick={() => openAttendees(s)}
                            className="flex items-center gap-1.5 hover:text-primary transition"
                          >
                            <Users className="h-3.5 w-3.5" />
                            <span className="tnum font-semibold text-foreground underline-offset-4 hover:underline">
                              {s.booked_count} / {s.capacity}
                            </span>
                          </button>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5" />
                            <span className="tnum font-semibold text-foreground">
                              {s.booked_count} / {s.capacity}
                            </span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground mb-3">
                        <User className="h-3.5 w-3.5" />
                        {trainerName}
                      </div>

                      {/* Diskretno: koliko ih ceka (nealarmantno, muted) */}
                      {s.waitlist_count > 0 && (
                        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground mb-3">
                          <Clock className="h-3.5 w-3.5" />
                          <span className="tnum">{s.waitlist_count}</span> na čekanju
                        </div>
                      )}

                      {past ? (
                        booked ? (
                          // Prosao termin na kom sam rezervisan: samo labela, bez Otkazi
                          // (server ionako odbija otkazivanje proslog termina preko 2h pravila).
                          <span className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-success-soft text-success-soft-foreground text-[12.5px] font-semibold">
                            <Check className="h-3.5 w-3.5" /> Rezervisano
                          </span>
                        ) : (
                          // Prosao termin: onemoguceno, bez ijedne akcije.
                          <Button variant="outline" size="sm" disabled className="w-full">
                            Prošao
                          </Button>
                        )
                      ) : booked ? (
                        // Rezervisano: jedini izvor je my_booking_id. Otkazi -> cancel_session_booking
                        // sa my_booking_id (bez membership guard-a).
                        <div className="flex items-center gap-2">
                          <span className="flex-1 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-success-soft text-success-soft-foreground text-[12.5px] font-semibold">
                            <Check className="h-3.5 w-3.5" /> Rezervisano
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => cancel(s)}
                            disabled={acting}
                            className="text-destructive hover:bg-destructive-soft"
                          >
                            {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                            Otkaži
                          </Button>
                        </div>
                      ) : hasFreeSpot ? (
                        // Ima slobodno mesto -> Rezervisi (isti guard kao i dosad).
                        <Button
                          variant="default"
                          size="sm"
                          disabled={acting}
                          onClick={guard(() => book(s))}
                          className="w-full"
                        >
                          {acting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                          {!hasAccess && <Lock className="h-3.5 w-3.5 mr-1.5" />}
                          Rezerviši
                        </Button>
                      ) : onWaitlist ? (
                        // Pun slot, na listi cekanja: miran violet status + Otkazi (leave_waitlist)
                        <div className="flex items-center gap-2">
                          <span className="flex-1 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-soft text-primary-soft-foreground text-[12.5px] font-semibold">
                            <Clock className="h-3.5 w-3.5" />
                            Na listi čekanja
                            {myPosition != null && (
                              <span className="opacity-80">· Pozicija {myPosition}</span>
                            )}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => leaveWaitlist(s)}
                            disabled={acting}
                            className="text-destructive hover:bg-destructive-soft"
                          >
                            {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                            Otkaži
                          </Button>
                        </div>
                      ) : (
                        // Pun slot, nisam na listi, nije prosao -> ponudi listu cekanja (uz isti membership guard)
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={acting}
                          onClick={guard(() => joinWaitlist(s))}
                          className="w-full"
                        >
                          {acting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                          {!hasAccess && <Lock className="h-3.5 w-3.5 mr-1.5" />}
                          Lista čekanja
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </PhoneShell>
      <BottomNav role="athlete" />

      <Dialog open={!!attendeesSlot} onOpenChange={(o) => !o && setAttendeesSlot(null)}>
        <DialogContent className="max-w-[380px]">
          <DialogHeader>
            <DialogTitle>{attendeesSlot?.type_name ?? "Učesnici"}</DialogTitle>
            <DialogDescription>
              {attendeesSlot
                ? `${formatTime(attendeesSlot.start_time)} · ${attendeesSlot.booked_count} / ${attendeesSlot.capacity}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {attendeesLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : attendees.length === 0 ? (
            <div className="text-center text-[13px] text-muted-foreground py-4">
              Još nema rezervacija.
            </div>
          ) : (
            <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
              {attendees.map((a) => (
                <li
                  key={a.athlete_id}
                  className="flex items-center gap-3 rounded-2xl bg-surface border border-hairline px-3 py-2.5"
                >
                  <div className="h-8 w-8 rounded-full bg-primary-soft text-primary-soft-foreground flex items-center justify-center text-[12px] font-semibold">
                    {a.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 text-[13.5px] font-semibold tracking-tight truncate">
                    {a.full_name}
                  </div>
                  {a.is_me && (
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-primary">
                      Ti
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Booking;
