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

interface ActionTarget {
  path: string;
  label: string;
}

const getActionTarget = (
  n: AppNotification,
): ActionTarget | null => {
  if (n.recipient_role === "trainer") {
    if (n.kind === "booking_created" || n.kind === "booking_canceled")
      return { path: "/trener/kalendar", label: "Otvori kalendar" };
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className={cn("h-11 w-11 rounded-2xl flex items-center justify-center shrink-0", meta.tone)}>
              <Icon className="h-[20px] w-[20px]" strokeWidth={2.25} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {meta.label}
              </div>
              <DialogTitle className="text-[17px] leading-tight tracking-tight">
                {notification.title}
              </DialogTitle>
            </div>
          </div>
          <DialogDescription className="text-[11px] tnum">
            {formatDateTime(notification.created_at)}
          </DialogDescription>
        </DialogHeader>

        {notification.body && (
          <div className="text-[14px] leading-relaxed text-foreground whitespace-pre-wrap break-words">
            {notification.body}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
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
