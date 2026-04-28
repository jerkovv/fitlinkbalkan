import { useEffect, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card } from "@/components/ui-bits";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Calendar, CreditCard, Dumbbell, MessageCircle, Loader2 } from "lucide-react";

type Prefs = {
  bookings: boolean;
  payments: boolean;
  workouts: boolean;
  messages: boolean;
};

const DEFAULTS: Prefs = { bookings: true, payments: true, workouts: true, messages: true };

const ROWS: { key: keyof Prefs; icon: any; title: string; desc: string }[] = [
  { key: "bookings", icon: Calendar, title: "Termini", desc: "Rezervacije i otkazivanja od vežbača" },
  { key: "payments", icon: CreditCard, title: "Članarine", desc: "Kad vežbač potvrdi uplatu ili istekne članarina" },
  { key: "workouts", icon: Dumbbell, title: "Završeni treninzi", desc: "Kad vežbač završi zadati trening" },
  { key: "messages", icon: MessageCircle, title: "Poruke", desc: "Direktne poruke od vežbača" },
];

const NotificationSettings = () => {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof Prefs | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("trainer_notification_prefs")
        .select("bookings, payments, workouts, messages")
        .eq("trainer_id", user.id)
        .maybeSingle();
      if (data) setPrefs(data as Prefs);
      setLoading(false);
    })();
  }, [user]);

  const toggle = async (key: keyof Prefs) => {
    if (!user) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(key);
    const { error } = await supabase
      .from("trainer_notification_prefs")
      .upsert({ trainer_id: user.id, ...next, updated_at: new Date().toISOString() });
    setSaving(null);
    if (error) {
      setPrefs(prefs); // rollback
      toast.error("Greška pri snimanju");
    } else {
      toast.success(next[key] ? "Uključeno" : "Isključeno");
    }
  };

  return (
    <PhoneShell title="Obaveštenja" eyebrow="Podešavanja" back="/trener/profil">
      <div className="space-y-3 pb-24">
        <p className="text-[13px] text-muted-foreground px-1">
          Izaberi šta želiš da te obaveštava. Isključene grupe se neće slati ni u app, ni kao push.
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          ROWS.map(({ key, icon: Icon, title, desc }) => (
            <Card key={key} className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary-soft text-primary-soft-foreground flex items-center justify-center shrink-0">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14px] leading-tight">{title}</div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">{desc}</div>
                </div>
                <div className="shrink-0">
                  {saving === key ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Switch checked={prefs[key]} onCheckedChange={() => toggle(key)} />
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
      <BottomNav role="trainer" />
    </PhoneShell>
  );
};

export default NotificationSettings;
