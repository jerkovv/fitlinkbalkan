import { useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { NotificationItem } from "@/components/NotificationBell";
import { NotificationDetail } from "@/components/NotificationDetail";
import { useNotifications, useNoveDokJeOtvoreno, type AppNotification } from "@/hooks/useNotifications";
import { Bell, Trash2 } from "lucide-react";

const Notifications = () => {
  const notif = useNotifications();
  const { items, loading, markRead, remove } = notif;
  // Otvorena stranica = procitano (bez dugmeta "Sve procitano"); nove ostaju
  // istaknute dok je stranica otvorena.
  const nove = useNoveDokJeOtvoreno(notif, true);
  const [selected, setSelected] = useState<AppNotification | null>(null);

  const handleClick = async (n: AppNotification) => {
    if (!n.is_read) await markRead(n.id);
    setSelected(n);
  };

  return (
    <>
      <PhoneShell hasBottomNav back="/vezbac" eyebrow="Aktivnost" title="Notifikacije">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-muted-foreground">Učitavanje…</div>
        ) : items.length === 0 ? (
          <div className="py-16 flex flex-col items-center text-center gap-2">
            <div className="h-14 w-14 rounded-2xl bg-surface-2 flex items-center justify-center">
              <Bell className="h-6 w-6 text-muted-foreground" strokeWidth={2} />
            </div>
            <div className="text-[14px] font-semibold">Nema notifikacija</div>
            <div className="text-[12.5px] text-muted-foreground max-w-[260px]">
              Tu će ti stizati podsetnici za članarinu, novi programi i poruke od trenera.
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((n) => (
              <li key={n.id} className="relative group">
                <NotificationItem n={n} nova={nove.has(n.id)} onClick={() => handleClick(n)} />
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
      <NotificationDetail
        notification={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
      />
      <BottomNav role="athlete" />
    </>
  );
};

export default Notifications;
