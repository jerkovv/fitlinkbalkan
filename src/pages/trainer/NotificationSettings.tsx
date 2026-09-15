import { useEffect, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card } from "@/components/ui-bits";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { porukaGreske } from "@/lib/errorMessage";
import { toast } from "sonner";
import {
  CalendarPlus,
  CalendarX,
  Clock,
  Dumbbell,
  Trophy,
  MessageCircle,
  IdCard,
  Wallet,
  Loader2,
} from "lucide-react";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";

type Vrsta = {
  kind: string;
  icon: typeof CalendarPlus;
  title: string;
  desc: string;
};

// Svaka vrsta obavestenja koja stize treneru, po odeljcima. Kljuc je notifications.kind;
// iskljucene vrste server ne upisuje (trg_notifications_trainer_prefs), pa ne ide ni push.
const ODELJCI: { naslov: string; vrste: Vrsta[] }[] = [
  {
    naslov: "Termini",
    vrste: [
      { kind: "booking_created", icon: CalendarPlus, title: "Nova rezervacija", desc: "Kad vežbač rezerviše termin" },
      { kind: "booking_canceled", icon: CalendarX, title: "Otkazan termin", desc: "Kad vežbač otkaže termin" },
      { kind: "waitlist_joined", icon: Clock, title: "Lista čekanja", desc: "Kad se vežbač prijavi na listu čekanja" },
    ],
  },
  {
    naslov: "Treninzi",
    vrste: [
      { kind: "workout_completed", icon: Dumbbell, title: "Završen trening", desc: "Kad vežbač završi trening" },
      { kind: "pr_set", icon: Trophy, title: "Novi lični rekord", desc: "Kad vežbač obori svoj rekord" },
    ],
  },
  {
    naslov: "Poruke",
    vrste: [
      { kind: "message", icon: MessageCircle, title: "Nova poruka", desc: "Direktne poruke od vežbača" },
    ],
  },
  {
    naslov: "Članarine",
    vrste: [
      { kind: "payment_request", icon: IdCard, title: "Zahtev za članarinu", desc: "Kad vežbač zatraži paket" },
      { kind: "payment_marked", icon: Wallet, title: "Potvrđena uplata", desc: "Kad vežbač označi da je platio" },
    ],
  },
];

const NotificationSettings = () => {
  const { locked, openLock } = usePretplataLock();
  const { user } = useAuth();
  const desktop = useDesktopWeb();
  // Iskljucene vrste; prazno = sve stize.
  const [utisane, setUtisane] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("trainer_notification_prefs")
        .select("muted_kinds")
        .eq("trainer_id", user.id)
        .maybeSingle();
      const muted = (data as { muted_kinds?: string[] | null } | null)?.muted_kinds ?? [];
      setUtisane(new Set(muted));
      setLoading(false);
    })();
  }, [user]);

  const toggle = async (kind: string) => {
    if (locked) return openLock();
    if (!user) return;
    const prethodne = utisane;
    const sledece = new Set(utisane);
    const ukljucujem = sledece.has(kind);
    if (ukljucujem) sledece.delete(kind);
    else sledece.add(kind);
    setUtisane(sledece);
    setSaving(kind);
    const { error } = await supabase
      .from("trainer_notification_prefs")
      .upsert(
        { trainer_id: user.id, muted_kinds: [...sledece], updated_at: new Date().toISOString() } as any,
        { onConflict: "trainer_id" },
      );
    setSaving(null);
    if (error) {
      console.error("[notif prefs upsert]", error);
      setUtisane(prethodne);
      toast.error(porukaGreske(error));
    } else {
      toast.success(ukljucujem ? "Uključeno" : "Isključeno");
    }
  };

  const prekidac = ({ kind, title }: Vrsta) =>
    saving === kind ? (
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    ) : (
      <Switch checked={!utisane.has(kind)} onCheckedChange={() => toggle(kind)} aria-label={title} />
    );

  const opis = "Izaberi koja obaveštenja želiš da dobijaš. Isključena ne stižu ni u aplikaciju ni kao push.";

  return (
    <PhoneShell title="Obaveštenja" eyebrow="Podešavanja" back="/trener/profil">
      {desktop ? (
        <section className="card-premium overflow-hidden">
          <div className="border-b border-hairline px-6 py-5">
            <h2 className="font-display text-[17px] font-bold tracking-tight">Šta ti stiže</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{opis}</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6 p-6">
              {ODELJCI.map((o) => (
                <div key={o.naslov}>
                  <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {o.naslov}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {o.vrste.map((v) => {
                      const Icon = v.icon;
                      return (
                        <div
                          key={v.kind}
                          className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface p-4"
                        >
                          <div className="h-10 w-10 rounded-xl bg-primary-soft text-primary-soft-foreground flex items-center justify-center shrink-0">
                            <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-[14px] leading-tight">{v.title}</div>
                            <div className="text-[12.5px] text-muted-foreground mt-1 leading-snug">{v.desc}</div>
                          </div>
                          <div className="shrink-0 flex h-10 items-center">{prekidac(v)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className="space-y-5 pb-24">
          <p className="text-[13px] text-muted-foreground px-1">{opis}</p>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            ODELJCI.map((o) => (
              <section key={o.naslov} className="space-y-2">
                <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {o.naslov}
                </div>
                <Card className="divide-y divide-hairline overflow-hidden p-0">
                  {o.vrste.map((v) => {
                    const Icon = v.icon;
                    return (
                      <div key={v.kind} className="flex items-center gap-3 px-4 py-3.5">
                        <div className="h-10 w-10 rounded-xl bg-primary-soft text-primary-soft-foreground flex items-center justify-center shrink-0">
                          <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[14px] leading-tight">{v.title}</div>
                          <div className="text-[12px] text-muted-foreground mt-0.5">{v.desc}</div>
                        </div>
                        <div className="shrink-0">{prekidac(v)}</div>
                      </div>
                    );
                  })}
                </Card>
              </section>
            ))
          )}
        </div>
      )}
      <BottomNav role="trainer" />
    </PhoneShell>
  );
};

export default NotificationSettings;
