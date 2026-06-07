import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Bell, CalendarPlus, CalendarX, Dumbbell, MessageSquare, Check,
  IdCard, Apple, ClipboardList, AlertTriangle, Megaphone, ArrowRight,
} from "lucide-react";
import type { AppNotification, NotificationKind } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { sessionColorClasses, formatTime } from "@/lib/session";

const KIND_META: Record<
  NotificationKind,
  { icon: typeof Bell; tone: string; label: string }
> = {
  booking_created:      { icon: CalendarPlus,  tone: "text-[hsl(var(--session-emerald-fg))] bg-[hsl(var(--session-emerald-bg))]", label: "Rezervacija" },
  booking_canceled:     { icon: CalendarX,     tone: "text-[hsl(var(--session-rose-fg))] bg-[hsl(var(--session-rose-bg))]",       label: "Otkazivanje" },
  workout_completed:    { icon: Dumbbell,      tone: "text-[hsl(var(--session-violet-fg))] bg-[hsl(var(--session-violet-bg))]",   label: "Završen trening" },
  pr_set:               { icon: Dumbbell,      tone: "text-[hsl(var(--session-amber-fg))] bg-[hsl(var(--session-amber-bg))]",     label: "Lični rekord 🏆" },
  message:              { icon: MessageSquare, tone: "text-[hsl(var(--session-indigo-fg))] bg-[hsl(var(--session-indigo-bg))]",   label: "Poruka vežbača" },
  payment_request:      { icon: IdCard,        tone: "text-[hsl(var(--session-amber-fg))] bg-[hsl(var(--session-amber-bg))]",     label: "Zahtev za članarinu" },
  payment_marked:       { icon: Check,         tone: "text-[hsl(var(--session-emerald-fg))] bg-[hsl(var(--session-emerald-bg))]", label: "Vežbač potvrdio uplatu" },
  program_assigned:     { icon: ClipboardList, tone: "text-[hsl(var(--session-violet-fg))] bg-[hsl(var(--session-violet-bg))]",   label: "Nov program" },
  nutrition_assigned:   { icon: Apple,         tone: "text-[hsl(var(--session-emerald-fg))] bg-[hsl(var(--session-emerald-bg))]", label: "Plan ishrane" },
  message_from_trainer: { icon: MessageSquare, tone: "text-[hsl(var(--session-indigo-fg))] bg-[hsl(var(--session-indigo-bg))]",   label: "Poruka trenera" },
  membership_expiring:  { icon: IdCard,        tone: "text-[hsl(var(--session-amber-fg))] bg-[hsl(var(--session-amber-bg))]",     label: "Članarina ističe" },
  membership_expired:   { icon: AlertTriangle, tone: "text-[hsl(var(--session-rose-fg))] bg-[hsl(var(--session-rose-bg))]",       label: "Članarina istekla" },
  membership_activated: { icon: Check,         tone: "text-[hsl(var(--session-emerald-fg))] bg-[hsl(var(--session-emerald-bg))]", label: "Članarina aktivirana" },
  membership_rejected:  { icon: AlertTriangle, tone: "text-[hsl(var(--session-rose-fg))] bg-[hsl(var(--session-rose-bg))]",       label: "Zahtev odbijen" },
  broadcast:            { icon: Megaphone,     tone: "text-[hsl(var(--session-violet-fg))] bg-[hsl(var(--session-violet-bg))]",   label: "Obaveštenje" },
};

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("sr-Latn-RS", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

// "2026-06-08" -> "08.06.2026." ; ako format nije ocekivan, vrati ulaz.
const formatSlotDate = (raw: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  return `${m[3]}.${m[2]}.${m[1]}.`;
};

// 0=Nedelja ... 6=Subota (getDay() vraca isti redosled).
const WEEKDAYS_SR = ["Nedelja", "Ponedeljak", "Utorak", "Sreda", "Cetvrtak", "Petak", "Subota"];

// Dan u nedelji iz "2026-06-08", parsiran kao LOKALNI datum (bez UTC pomeraja).
const weekdayFromSlotDate = (raw: string): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : WEEKDAYS_SR[d.getDay()];
};

interface ActionTarget {
  path: string;
  label: string;
}

const getActionTarget = (
  n: AppNotification,
): ActionTarget | null => {
  if (n.recipient_role === "trainer") {
    if (n.kind === "booking_created" || n.kind === "booking_canceled") {
      const slotDate = n.meta?.slot_date as string | undefined;
      const path = slotDate
        ? `/trener/kalendar?date=${slotDate}`
        : "/trener/kalendar";
      return { path, label: "Otvori kalendar" };
    }
    if (n.kind === "payment_request" || n.kind === "payment_marked")
      return { path: "/trener/uplate", label: "Otvori uplate" };
    if (n.kind === "workout_completed" || n.kind === "message")
      return { path: `/trener/vezbaci/${n.athlete_id}`, label: "Otvori profil vežbača" };
    return null;
  }
  // athlete
  if (n.kind === "program_assigned") return { path: "/vezbac", label: "Otvori program" };
  if (n.kind === "nutrition_assigned") return { path: "/vezbac/ishrana", label: "Otvori plan ishrane" };
  if (n.kind === "membership_expiring" || n.kind === "membership_expired"
      || n.kind === "membership_activated" || n.kind === "membership_rejected")
    return { path: "/vezbac/clanarina", label: "Otvori članarinu" };
  return null;
};

interface Props {
  notification: AppNotification | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NotificationDetail = ({ notification, open, onOpenChange }: Props) => {
  const navigate = useNavigate();
  if (!notification) return null;
  const meta = KIND_META[notification.kind];
  const Icon = meta.icon;
  const action = getActionTarget(notification);

  // Bogati podaci za booking notifikacije (postoje samo kad ih meta nosi).
  const slotDate = notification.meta?.slot_date as string | undefined;
  const startTime = notification.meta?.start_time as string | undefined;
  const sessionName = notification.meta?.session_name as string | undefined;
  const sessionColor = notification.meta?.session_color as string | undefined;
  const hasBookingMeta = Boolean(slotDate);

  // Akcenat u boji sesije; fallback na fiksni meta.tone ako boje nema.
  const colors = sessionColor ? sessionColorClasses(sessionColor) : null;
  const iconTone = colors ? cn(colors.bg, colors.fg) : meta.tone;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="text-left">
          <div className="flex items-center gap-3 mb-1">
            <div className={cn("h-11 w-11 rounded-2xl flex items-center justify-center shrink-0", iconTone)}>
              <Icon className="h-[20px] w-[20px]" strokeWidth={2.25} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {meta.label}
              </div>
              <DialogTitle className="font-display text-[17px] leading-tight tracking-tight">
                {notification.title}
              </DialogTitle>
            </div>
          </div>
          {hasBookingMeta ? (
            <DialogDescription className="sr-only">
              {sessionName ?? "Termin"} {formatSlotDate(slotDate!)}
            </DialogDescription>
          ) : (
            <DialogDescription className="text-[11px] tnum">
              {formatDateTime(notification.created_at)}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Istaknuti termin (samo booking notifikacije sa meta) */}
        {hasBookingMeta && (
          <div
            className={cn(
              "rounded-2xl border p-3.5 flex items-center gap-3",
              colors ? cn(colors.bg, colors.border) : "bg-surface-2 border-hairline",
            )}
          >
            <div className={cn("h-9 w-9 rounded-xl bg-background/70 flex items-center justify-center shrink-0", colors?.fg)}>
              <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              {sessionName && (
                <div className={cn("text-[10.5px] font-bold uppercase tracking-[0.12em] leading-tight truncate", colors?.fg)}>
                  {sessionName}
                </div>
              )}
              <div className="font-display text-[18px] font-bold tracking-tight leading-tight mt-0.5">
                {weekdayFromSlotDate(slotDate!) ? `${weekdayFromSlotDate(slotDate!)}, ` : ""}
                {formatSlotDate(slotDate!)}
              </div>
              {startTime && (
                <div className="text-[13px] text-muted-foreground tnum mt-0.5">
                  {formatTime(startTime)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Body samo kad NEMA istaknutog termin bloka (inace dupla informacija) */}
        {!hasBookingMeta && notification.body && (
          <div className="text-[14px] leading-relaxed text-foreground whitespace-pre-wrap break-words">
            {notification.body}
          </div>
        )}

        {/* Vreme akcije, sekundarno (samo booking; ostali ga vec imaju gore) */}
        {hasBookingMeta && (
          <div className="text-[11px] text-muted-foreground tnum">
            {notification.kind === "booking_canceled"
              ? "Otkazano: "
              : notification.kind === "booking_created"
                ? "Rezervisano: "
                : ""}
            {formatDateTime(notification.created_at)}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
          >
            Zatvori
          </Button>
          {action && (
            <Button
              onClick={() => {
                onOpenChange(false);
                navigate(action.path);
              }}
            >
              {action.label} <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
