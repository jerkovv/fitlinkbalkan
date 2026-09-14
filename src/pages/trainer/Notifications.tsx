import { useMemo, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { NotificationItem } from "@/components/NotificationBell";
import { NotificationDetail } from "@/components/NotificationDetail";
import { BroadcastButton } from "@/components/BroadcastButton";
import { Button } from "@/components/ui/button";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { Bell, Check, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Filter = "all" | "unread";

// Racunar: grupe po danu, da duga lista ima oslonac za oko.
const grupisiPoDanu = (items: AppNotification[]) => {
  const pocetakDana = new Date();
  pocetakDana.setHours(0, 0, 0, 0);
  const danas = pocetakDana.getTime();
  const juce = danas - 24 * 60 * 60 * 1000;
  const grupe: { label: string; items: AppNotification[] }[] = [
    { label: "Danas", items: [] },
    { label: "Juče", items: [] },
    { label: "Ranije", items: [] },
  ];
  items.forEach((n) => {
    const t = new Date(n.created_at).getTime();
    grupe[t >= danas ? 0 : t >= juce ? 1 : 2].items.push(n);
  });
  return grupe.filter((g) => g.items.length > 0);
};

const Notifications = () => {
  const { items, loading, unreadCount, markRead, markAllRead, remove } = useNotifications();
  const desktop = useDesktopWeb();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<AppNotification | null>(null);

  const visible = useMemo(
    () => (filter === "unread" ? items.filter((n) => !n.is_read) : items),
    [items, filter],
  );

  const handleClick = async (n: AppNotification) => {
    if (!n.is_read) await markRead(n.id);
    setSelected(n);
  };

  const filterTabs = (
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
  );

  const emptyState = (
    <div className="py-16 flex flex-col items-center text-center gap-2">
      <div className="h-14 w-14 rounded-2xl bg-surface-2 flex items-center justify-center">
        <Bell className="h-6 w-6 text-muted-foreground" strokeWidth={2} />
      </div>
      <div className="text-[14px] font-semibold">
        {filter === "unread" ? "Sve si pročitao" : "Nema notifikacija"}
      </div>
      <div className="text-[12.5px] text-muted-foreground max-w-[260px]">
        Kad ti vežbač rezerviše, otkaže ili završi trening - ovde ćeš videti.
      </div>
    </div>
  );

  return (
    <>
      <PhoneShell
        hasBottomNav
        back="/trener"
        eyebrow="Aktivnost"
        title="Notifikacije"
        action={
          desktop ? (
            // Racunar: obe akcije u zaglavlju kao dugmad sa tekstom.
            <>
              {unreadCount > 0 && (
                <Button
                  variant="outline"
                  onClick={() => markAllRead()}
                  className="h-10 rounded-full px-4"
                >
                  <Check className="h-4 w-4 mr-1.5" />
                  Sve pročitano
                </Button>
              )}
              <BroadcastButton
                label="Pošalji obaveštenje"
                className="h-10 rounded-full px-4 bg-gradient-brand text-white shadow-brand"
              />
            </>
          ) : unreadCount > 0 ? (
            <button
              onClick={() => markAllRead()}
              className="text-[12px] font-semibold text-primary inline-flex items-center gap-1 px-3 py-2 rounded-full hover:bg-surface-2 transition"
            >
              <Check className="h-3.5 w-3.5" /> Sve pročitano
            </button>
          ) : undefined
        }
      >
        {desktop ? (
          <>
            {filterTabs}
            {loading ? (
              <div className="card-premium py-16 text-center text-[13px] text-muted-foreground">Učitavanje…</div>
            ) : visible.length === 0 ? (
              <div className="card-premium">{emptyState}</div>
            ) : (
              // Jedna kartica sa podnaslovima po danu; brisanje ima svoju kolonu
              // desno, da na hover ne prekriva vreme i tekst obavestenja.
              <div className="card-premium overflow-hidden">
                {grupisiPoDanu(visible).map((g, gi) => (
                  <section key={g.label}>
                    <div
                      className={cn(
                        "bg-surface-2/50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
                        gi > 0 && "border-t border-hairline",
                      )}
                    >
                      {g.label}
                    </div>
                    <ul className="divide-y divide-hairline border-t border-hairline">
                      {g.items.map((n) => (
                        <li key={n.id} className="group flex items-stretch">
                          <div className="min-w-0 flex-1 [&>button]:h-full group-hover:[&>button]:bg-surface-2">
                            <NotificationItem n={n} onClick={() => handleClick(n)} compact />
                          </div>
                          <div
                            className={cn(
                              "flex w-14 shrink-0 items-center justify-center transition group-hover:bg-surface-2",
                              !n.is_read && "bg-primary/5",
                            )}
                          >
                            <button
                              onClick={() => remove(n.id)}
                              aria-label="Obriši"
                              className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground opacity-0 transition hover:bg-destructive-soft hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Filter tabovi + slanje obavestenja u istom redu: dugme je tako uvek
                vidljivo i ne bori se sa plutajucim tab barom na dnu. */}
            <div className="flex items-center justify-between gap-3">
              {filterTabs}
              <BroadcastButton pill />
            </div>

            {loading ? (
              <div className="py-16 text-center text-[13px] text-muted-foreground">Učitavanje…</div>
            ) : visible.length === 0 ? (
              emptyState
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
          </>
        )}
      </PhoneShell>
      <NotificationDetail
        notification={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
      />
      <BottomNav role="trainer" />
    </>
  );
};

export default Notifications;
