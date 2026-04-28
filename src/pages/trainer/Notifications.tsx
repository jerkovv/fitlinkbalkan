import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { NotificationItem } from "@/components/NotificationBell";
import { BroadcastButton } from "@/components/BroadcastButton";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";
import { Bell, Check, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Filter = "all" | "unread";

const Notifications = () => {
  const navigate = useNavigate();
  const { items, loading, unreadCount, markRead, markAllRead, remove } = useNotifications();
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(
    () => (filter === "unread" ? items.filter((n) => !n.is_read) : items),
    [items, filter],
  );

  const handleClick = async (n: AppNotification) => {
    if (!n.is_read) await markRead(n.id);
    if (n.kind === "booking_created" || n.kind === "booking_canceled") {
      navigate("/trener/kalendar");
    } else if (n.kind === "workout_completed" || n.kind === "message") {
      navigate(`/trener/vezbaci/${n.athlete_id}`);
    }
  };

  return (
    <>
      <PhoneShell
        hasBottomNav
        back="/trener"
        eyebrow="Aktivnost"
        title="Notifikacije"
        rightSlot={
          unreadCount > 0 ? (
            <button
              onClick={() => markAllRead()}
              className="text-[12px] font-semibold text-primary inline-flex items-center gap-1 px-3 py-2 rounded-full hover:bg-surface-2 transition"
            >
              <Check className="h-3.5 w-3.5" /> Sve pročitano
            </button>
          ) : undefined
        }
      >
        {/* Filter tabs */}
        <div className="inline-flex p-1 rounded-full bg-surface-2">
          {(["all", "unread"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-4 py-1.5 rounded-full text-[12.5px] font-semibold transition",
                filter === f
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f === "all" ? "Sve" : `Nepročitane${unreadCount > 0 ? ` · ${unreadCount}` : ""}`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center text-[13px] text-muted-foreground">Učitavanje…</div>
        ) : visible.length === 0 ? (
          <div className="py-16 flex flex-col items-center text-center gap-2">
            <div className="h-14 w-14 rounded-2xl bg-surface-2 flex items-center justify-center">
              <Bell className="h-6 w-6 text-muted-foreground" strokeWidth={2} />
            </div>
            <div className="text-[14px] font-semibold">
              {filter === "unread" ? "Sve si pročitao" : "Nema notifikacija"}
            </div>
            <div className="text-[12.5px] text-muted-foreground max-w-[260px]">
              Kad ti vežbač rezerviše, otkaže ili završi trening — ovde ćeš videti.
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map((n) => (
              <li key={n.id} className="relative group">
                <NotificationItem n={n} onClick={() => handleClick(n)} />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(n.id);
                  }}
                  aria-label="Obriši"
                  className="absolute top-2 right-2 h-7 w-7 rounded-full bg-surface-2/80 backdrop-blur opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </PhoneShell>
      <BroadcastButton fab />
      <BottomNav role="trainer" />
    </>
  );
};

export default Notifications;
