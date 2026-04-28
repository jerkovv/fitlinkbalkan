import { useEffect, useMemo, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { SectionTitle } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import { Clock, Users, User, Check, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
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
};

type MyBooking = {
  id: string;
  date: string;
  start_time: string;
  session_type_id: string;
};

const Booking = () => {
  const { user } = useAuth();
  const today = useMemo(() => new Date(), []);
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [trainerName, setTrainerName] = useState<string>("");
  const [hasMembership, setHasMembership] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [myBookings, setMyBookings] = useState<MyBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [showAttendees, setShowAttendees] = useState<boolean>(false);
  const [attendeesSlot, setAttendeesSlot] = useState<Slot | null>(null);
  const [attendees, setAttendees] = useState<{ athlete_id: string; full_name: string; is_me: boolean }[]>([]);
  const [attendeesLoading, setAttendeesLoading] = useState(false);

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
          supabase.from("trainers").select("show_attendees_to_athletes").eq("id", tid).maybeSingle(),
        ]);
        setShowAttendees(!!(tr as any)?.show_attendees_to_athletes);
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
    const [slotsRes, bookRes] = await Promise.all([
      supabase.rpc("get_day_slots", {
        p_trainer_id: trainerId,
        p_date: dateISO,
      }),
      supabase
        .from("session_bookings")
        .select("id, date, start_time, session_type_id")
        .eq("athlete_id", user.id)
        .eq("date", dateISO),
    ]);
    setSlots((slotsRes.data as any) ?? []);
    setMyBookings((bookRes.data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { loadDay(); }, [user, trainerId, selectedDate]);

  const isMineKey = (s: Slot) =>
    `${formatTime(s.start_time)}__${s.session_type_id}`;

  const myKeys = new Set(
    myBookings.map((b) => `${formatTime(b.start_time)}__${b.session_type_id}`),
  );

  const book = async (s: Slot) => {
    if (!trainerId) return;
    if (!hasMembership) {
      toast.error("Potrebna ti je aktivna članarina za rezervaciju");
      return;
    }
    const key = isMineKey(s);
    setActingKey(key);
    const { error } = await supabase.rpc("book_session", {
      p_trainer_id: trainerId,
      p_date: toIsoDate(selectedDate),
      p_start_time: formatTime(s.start_time),
      p_session_type_id: s.session_type_id,
    });
    setActingKey(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Termin rezervisan");
    loadDay();
  };

  const cancel = async (s: Slot) => {
    if (!user) return;
    const myBook = myBookings.find(
      (b) => formatTime(b.start_time) === formatTime(s.start_time)
        && b.session_type_id === s.session_type_id,
    );
    if (!myBook) return;
    if (!confirm("Otkazati rezervaciju?")) return;
    const key = isMineKey(s);
    setActingKey(key);
    const { error } = await supabase.from("session_bookings").delete().eq("id", myBook.id);
    setActingKey(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Rezervacija otkazana");
    loadDay();
  };

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
        {!hasMembership && trainerId && (
          <div className="rounded-2xl bg-warning-soft text-warning-soft-foreground border border-warning/20 px-4 py-3 text-[13px]">
            Potrebna ti je aktivna članarina da bi rezervisao termin.
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
                    "shrink-0 w-[68px] py-3 rounded-2xl text-center transition border",
                    active
                      ? "bg-gradient-brand text-primary-foreground shadow-brand border-transparent"
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
                const key = isMineKey(s);
                const mine = myKeys.has(key);
                const full = s.booked_count >= s.capacity && !mine;
                const colors = sessionColorClasses(s.type_color);
                const endTime = addMinutesToTime(formatTime(s.start_time), s.duration_min);
                const acting = actingKey === key;

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
                        <span className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          <span className="tnum font-semibold text-foreground">
                            {s.booked_count} / {s.capacity}
                          </span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground mb-3">
                        <User className="h-3.5 w-3.5" />
                        {trainerName}
                      </div>

                      {mine ? (
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
                      ) : (
                        <Button
                          variant={full ? "outline" : "default"}
                          size="sm"
                          disabled={full || acting || !hasMembership}
                          onClick={() => book(s)}
                          className="w-full"
                        >
                          {acting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                          {full ? "Popunjeno" : "Rezerviši"}
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
    </>
  );
};

export default Booking;
