import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Bell, CalendarPlus, CalendarX, Dumbbell, MessageSquare, Check, IdCard, Apple, ClipboardList, AlertTriangle, Megaphone } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotifications, type AppNotification, type NotificationKind } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

const KIND_META: Record<
  NotificationKind,
  { icon: typeof Bell; tone: string }
> = {
  // ka treneru
  booking_created:    { icon: CalendarPlus,  tone: "text-[hsl(var(--session-emerald-fg))] bg-[hsl(var(--session-emerald-bg))]" },
  booking_canceled:   { icon: CalendarX,     tone: "text-[hsl(var(--session-rose-fg))] bg-[hsl(var(--session-rose-bg))]" },
  workout_completed:  { icon: Dumbbell,      tone: "text-[hsl(var(--session-violet-fg))] bg-[hsl(var(--session-violet-bg))]" },
  message:            { icon: MessageSquare, tone: "text-[hsl(var(--session-indigo-fg))] bg-[hsl(var(--session-indigo-bg))]" },
  // ka vežbaču
  program_assigned:     { icon: ClipboardList,  tone: "text-[hsl(var(--session-violet-fg))] bg-[hsl(var(--session-violet-bg))]" },
  nutrition_assigned:   { icon: Apple,          tone: "text-[hsl(var(--session-emerald-fg))] bg-[hsl(var(--session-emerald-bg))]" },
  message_from_trainer: { icon: MessageSquare,  tone: "text-[hsl(var(--session-indigo-fg))] bg-[hsl(var(--session-indigo-bg))]" },
  membership_expiring:  { icon: IdCard,         tone: "text-[hsl(var(--session-amber-fg))] bg-[hsl(var(--session-amber-bg))]" },
  membership_expired:   { icon: AlertTriangle,  tone: "text-[hsl(var(--session-rose-fg))] bg-[hsl(var(--session-rose-bg))]" },
  broadcast:            { icon: Megaphone,      tone: "text-[hsl(var(--session-violet-fg))] bg-[hsl(var(--session-violet-bg))]" },
};

const formatRelative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "sad";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("sr-RS", { day: "2-digit", month: "2-digit" });
};

export const NotificationItem = ({
  n,
  onClick,
  compact = false,
}: {
  n: AppNotification;
  onClick?: () => void;
  compact?: boolean;
}) => {
  const meta = KIND_META[n.kind];
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex gap-3 px-4 py-3 transition active:scale-[0.99]",
        !n.is_read && "bg-primary/5",
        compact ? "hover:bg-surface-2" : "rounded-2xl card-premium-hover",
      )}
    >
      <div className={cn("h-10 w-10 rounded-2xl flex items-center justify-center shrink-0", meta.tone)}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[14px] font-semibold leading-tight tracking-tight truncate">{n.title}</div>
          <div className="text-[11px] text-muted-foreground tnum shrink-0">{formatRelative(n.created_at)}</div>
        </div>
        {n.body && (
          <div className="text-[12.5px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</div>
        )}
      </div>
      {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" aria-label="Nepročitano" />}
    </button>
  );
};

export const NotificationBell = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { items, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);

  const preview = items.slice(0, 6);

  const handleItemClick = async (n: AppNotification) => {
    if (!n.is_read) await markRead(n.id);
    setOpen(false);
    // Trener
    if (n.recipient_role === "trainer") {
      if (n.kind === "booking_created" || n.kind === "booking_canceled") {
        navigate("/trener/kalendar");
      } else if (n.kind === "workout_completed" || n.kind === "message") {
        navigate(`/trener/vezbaci/${n.athlete_id}`);
      }
      return;
    }
    // Vežbač
    if (n.kind === "program_assigned") navigate("/vezbac");
    else if (n.kind === "nutrition_assigned") navigate("/vezbac/ishrana");
    else if (n.kind === "membership_expiring" || n.kind === "membership_expired") navigate("/vezbac/clanarina");
    // message_from_trainer ostaje samo prikaz u listi
  };

  // Detect role iz useAuth
  const fullPagePath = role === "athlete"
    ? "/vezbac/notifikacije"
    : "/trener/notifikacije";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Notifikacije"
          className={cn(
            "relative h-10 w-10 rounded-full flex items-center justify-center",
            "bg-surface-2 text-foreground/80 hover:bg-surface-3 transition active:scale-95",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          )}
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={2.25} />
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full",
                "bg-gradient-brand text-white text-[10px] font-bold tracking-tight",
                "flex items-center justify-center shadow-brand tnum",
              )}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-semibold text-[14px] tracking-tight">Notifikacije</div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead()}
              className="text-[11px] font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              <Check className="h-3 w-3" /> Označi sve
            </button>
          )}
        </div>

        {preview.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
            Nema novih notifikacija
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
            {preview.map((n) => (
              <NotificationItem key={n.id} n={n} onClick={() => handleItemClick(n)} compact />
            ))}
          </div>
        )}

        <div className="border-t border-border">
          <button
            onClick={() => {
              setOpen(false);
              navigate(fullPagePath);
            }}
            className="w-full text-center py-2.5 text-[12.5px] font-semibold text-primary hover:bg-surface-2 transition"
          >
            Vidi sve →
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
