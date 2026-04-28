import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card, Chip } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, ChevronRight, Loader2, Users, Clock, Settings, X, Ban, Plus, Calendar as CalIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  sessionColorClasses, dateToWeekday, toIsoDate, formatTime, addMinutesToTime, weekdayLabelsShort,
} from "@/lib/session";

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

type Booking = {
  id: string;
  athlete_id: string;
  date: string;
  start_time: string;
  session_type_id: string;
  status: string;
};

type AthleteOpt = { id: string; full_name: string | null };

const monthNames = [
  "Januar", "Februar", "Mart", "April", "Maj", "Jun",
  "Jul", "Avgust", "Septembar", "Oktobar", "Novembar", "Decembar",
];

const Calendar = () => {
  const { user } = useAuth();
  const today = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [athletes, setAthletes] = useState<AthleteOpt[]>([]);
  const [loading, setLoading] = useState(true);

  // Slot detail dialog
  const [openSlot, setOpenSlot] = useState<Slot | null>(null);

  // 14 dana napred + 7 nazad da trener može da gleda istoriju
  const days = useMemo(() => {
    return Array.from({ length: 21 }).map((_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i - 7);
      return d;
    });
  }, [today]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const dateISO = toIsoDate(selectedDate);

    const [slotsRes, bookRes, athRes] = await Promise.all([
      supabase.rpc("get_day_slots", {
        p_trainer_id: user.id,
        p_date: dateISO,
      }),
      supabase
        .from("session_bookings")
        .select("id, athlete_id, date, start_time, session_type_id, status")
        .eq("trainer_id", user.id)
        .eq("date", dateISO),
      supabase.from("athletes").select("id").eq("trainer_id", user.id),
    ]);

    setSlots((slotsRes.data as any) ?? []);
    setBookings((bookRes.data as any) ?? []);

    const ids = ((athRes.data as any[]) ?? []).map((a) => a.id);
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      setAthletes(((profs as any[]) ?? []).map((p) => ({ id: p.id, full_name: p.full_name })));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [user, selectedDate]);

  const athleteName = (id: string) =>
    athletes.find((a) => a.id === id)?.full_name ?? "Vežbač";

  const slotKey = (s: Slot) => `${formatTime(s.start_time)}__${s.session_type_id}`;

  const bookingsForSlot = (s: Slot) =>
    bookings.filter(
      (b) => formatTime(b.start_time) === formatTime(s.start_time)
        && b.session_type_id === s.session_type_id
        && b.status === "booked",
    );

  const cancelSlot = async (s: Slot) => {
    if (!user || !s.template_id) return;
    if (!confirm(`Otkazati ${s.type_name} u ${formatTime(s.start_time)} za ovaj dan?`)) return;
    const { error } = await supabase.from("session_slot_overrides").insert({
      trainer_id: user.id,
      date: toIsoDate(selectedDate),
      template_id: s.template_id,
      is_canceled: true,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Termin otkazan za ovaj dan");
    setOpenSlot(null);
    load();
  };

  const removeBooking = async (id: string) => {
    if (!confirm("Ukloniti ovog vežbača iz termina?")) return;
    const { error } = await supabase.from("session_bookings").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Rezervacija uklonjena");
    load();
    if (openSlot) {
      setBookings((prev) => prev.filter((b) => b.id !== id));
    }
  };

  const monthLabel = `${monthNames[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;
  const isToday = toIsoDate(selectedDate) === toIsoDate(today);

  return (
    <>
      <PhoneShell
        hasBottomNav
        title="Kalendar"
        eyebrow={monthLabel}
        rightSlot={
          <Link
            to="/trener/termini"
            className="h-10 w-10 rounded-full bg-surface border border-hairline flex items-center justify-center hover:border-primary/30 active:scale-95 transition"
            title="Podešavanja termina"
          >
            <Settings className="h-4 w-4" strokeWidth={2} />
          </Link>
        }
      >
        {/* Day strip */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); }}
              className="h-8 w-8 rounded-full hover:bg-surface-2 flex items-center justify-center"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSelectedDate(today)}
              className={cn(
                "text-[12px] font-semibold px-3 py-1 rounded-full transition",
                isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-2",
              )}
            >
              Danas
            </button>
            <button
              onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); }}
              className="h-8 w-8 rounded-full hover:bg-surface-2 flex items-center justify-center"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-2 -mx-2 px-2 overflow-x-auto no-scrollbar pb-1">
            {days.map((d) => {
              const active = toIsoDate(d) === toIsoDate(selectedDate);
              const wd = weekdayLabelsShort[dateToWeekday(d)];
              const isT = toIsoDate(d) === toIsoDate(today);
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setSelectedDate(d)}
                  className={cn(
                    "shrink-0 w-[60px] py-2.5 rounded-2xl text-center transition border",
                    active
                      ? "bg-gradient-brand text-primary-foreground shadow-brand border-transparent"
                      : "bg-surface border-hairline hover:border-primary/30 text-foreground",
                  )}
                >
                  <div className={cn(
                    "text-[10px] font-semibold tracking-wider mb-0.5",
                    active ? "text-primary-foreground/80" : "text-muted-foreground",
                  )}>
                    {wd}
                  </div>
                  <div className="font-display text-[19px] font-bold tracking-tightest leading-none tnum">
                    {d.getDate()}
                  </div>
                  {isT && !active && (
                    <div className="h-1 w-1 rounded-full bg-primary mx-auto mt-1" />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Header */}
        <div className="flex items-baseline justify-between">
          <div>
            <div className="eyebrow text-muted-foreground">
              {isToday ? "Danas" : selectedDate.toLocaleDateString("sr-RS", { weekday: "long" })}
            </div>
            <div className="font-display text-xl font-bold">
              {selectedDate.toLocaleDateString("sr-RS", { day: "numeric", month: "long" })}
            </div>
          </div>
          {slots.length > 0 && (
            <div className="text-[12px] text-muted-foreground">
              {bookings.filter((b) => b.status === "booked").length} rezervacija
            </div>
          )}
        </div>

        {/* Slots list */}
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : slots.length === 0 ? (
          <Card className="p-8 text-center">
            <CalIcon className="h-7 w-7 mx-auto mb-2 text-muted-foreground/40" />
            <div className="text-[14px] font-semibold mb-1">Nema termina za ovaj dan</div>
            <div className="text-[12.5px] text-muted-foreground mb-4">
              Postavi nedeljni raspored u Podešavanjima termina.
            </div>
            <Link to="/trener/termini">
              <Button variant="outline" size="sm">
                <Settings className="h-3.5 w-3.5 mr-1.5" /> Otvori podešavanja
              </Button>
            </Link>
          </Card>
        ) : (
          <ul className="space-y-2">
            {slots.map((s) => {
              const slotBookings = bookingsForSlot(s);
              const colors = sessionColorClasses(s.type_color);
              const endTime = addMinutesToTime(formatTime(s.start_time), s.duration_min);
              const full = slotBookings.length >= s.capacity;
              return (
                <li key={slotKey(s)}>
                  <button
                    onClick={() => setOpenSlot(s)}
                    className={cn(
                      "w-full text-left rounded-2xl bg-surface border border-hairline overflow-hidden hover:border-primary/30 transition",
                      s.is_canceled && "opacity-50",
                    )}
                  >
                    <div className="flex">
                      {/* Time column */}
                      <div className={cn("w-20 shrink-0 flex flex-col items-center justify-center py-3", colors.bg, colors.fg)}>
                        <div className="font-display text-[18px] font-bold tracking-tighter tnum leading-none">
                          {formatTime(s.start_time)}
                        </div>
                        <div className="text-[10px] opacity-70 mt-0.5">{endTime}</div>
                      </div>
                      {/* Body */}
                      <div className="flex-1 p-3 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="font-semibold text-[14px] truncate">{s.type_name}</div>
                          {s.is_canceled ? (
                            <Chip tone="warning">Otkazano</Chip>
                          ) : full ? (
                            <Chip tone="success">Pun</Chip>
                          ) : (
                            <Chip tone="info">{s.capacity - slotBookings.length} slob.</Chip>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            <span className="tnum font-semibold text-foreground">
                              {slotBookings.length} / {s.capacity}
                            </span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {s.duration_min}min
                          </span>
                        </div>
                        {slotBookings.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {slotBookings.slice(0, 3).map((b) => (
                              <span
                                key={b.id}
                                className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md bg-surface-2 text-foreground"
                              >
                                {athleteName(b.athlete_id)}
                              </span>
                            ))}
                            {slotBookings.length > 3 && (
                              <span className="text-[10.5px] text-muted-foreground">
                                +{slotBookings.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PhoneShell>
      <BottomNav role="trainer" />

      {/* Slot detail dialog */}
      <Dialog open={!!openSlot} onOpenChange={(v) => !v && setOpenSlot(null)}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {openSlot && (
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    sessionColorClasses(openSlot.type_color).dot,
                  )}
                />
              )}
              {openSlot?.type_name}
            </DialogTitle>
          </DialogHeader>

          {openSlot && (() => {
            const slotBookings = bookingsForSlot(openSlot);
            const endTime = addMinutesToTime(formatTime(openSlot.start_time), openSlot.duration_min);
            return (
              <div className="space-y-4 overflow-y-auto">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-surface-2 rounded-xl p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Vreme</div>
                    <div className="font-display font-bold text-[14px] tnum">{formatTime(openSlot.start_time)}–{endTime}</div>
                  </div>
                  <div className="bg-surface-2 rounded-xl p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Učesnika</div>
                    <div className="font-display font-bold text-[14px] tnum">{slotBookings.length}/{openSlot.capacity}</div>
                  </div>
                  <div className="bg-surface-2 rounded-xl p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Trajanje</div>
                    <div className="font-display font-bold text-[14px] tnum">{openSlot.duration_min}m</div>
                  </div>
                </div>

                <div>
                  <div className="eyebrow text-muted-foreground mb-2">Ko vežba</div>
                  {slotBookings.length === 0 ? (
                    <div className="text-[13px] text-muted-foreground bg-surface-2 rounded-xl p-4 text-center">
                      Još niko nije rezervisao.
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {slotBookings.map((b) => (
                        <li
                          key={b.id}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-surface-2"
                        >
                          <Link
                            to={`/trener/vezbac/${b.athlete_id}`}
                            className="flex items-center gap-2.5 flex-1 min-w-0 hover:text-primary transition"
                          >
                            <div className="h-8 w-8 rounded-full bg-gradient-brand-soft flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                              {(athleteName(b.athlete_id)[0] ?? "?").toUpperCase()}
                            </div>
                            <span className="font-semibold text-[13px] truncate">
                              {athleteName(b.athlete_id)}
                            </span>
                          </Link>
                          <button
                            onClick={() => removeBooking(b.id)}
                            className="h-7 w-7 rounded-full hover:bg-destructive-soft flex items-center justify-center text-destructive"
                            title="Ukloni"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {!openSlot.is_canceled && openSlot.template_id && (
                  <Button
                    variant="outline"
                    className="w-full text-destructive hover:bg-destructive-soft"
                    onClick={() => cancelSlot(openSlot)}
                  >
                    <Ban className="h-3.5 w-3.5 mr-1.5" /> Otkaži termin za ovaj dan
                  </Button>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Calendar;
