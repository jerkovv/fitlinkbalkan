import { useEffect, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card, Chip } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Banknote, Receipt, Check, X, Inbox } from "lucide-react";
import { toast } from "sonner";

type Purchase = {
  id: string;
  athlete_id: string;
  package_name: string;
  sessions_count: number;
  duration_days: number;
  price_rsd: number;
  payment_method: "cash" | "bank";
  status: string;
  requested_at: string;
  athlete_name?: string;
};

const Payments = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Purchase[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("membership_purchases")
      .select("*")
      .eq("trainer_id", user.id)
      .eq("status", "pending")
      .order("requested_at", { ascending: false });

    const rows = (data as any[]) ?? [];
    const ids = Array.from(new Set(rows.map((r) => r.athlete_id)));
    const profMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      (profs as any[] | null)?.forEach((p) => profMap.set(p.id, p.full_name ?? ""));
    }

    setPending(rows.map((r) => ({ ...r, athlete_name: profMap.get(r.athlete_id) ?? "Vežbač" })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const confirmPurchase = async (p: Purchase) => {
    setBusyId(p.id);
    const { error } = await supabase.rpc("confirm_membership_purchase", {
      p_purchase_id: p.id,
      p_starts_on: new Date().toISOString().split("T")[0],
    });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success("Uplata potvrđena, članarina aktivirana");
    load();
  };

  const rejectPurchase = async (p: Purchase) => {
    if (!window.confirm(`Odbiti zahtev "${p.package_name}"?`)) return;
    setBusyId(p.id);
    const { error } = await supabase.rpc("reject_membership_purchase", {
      p_purchase_id: p.id,
      p_notes: null,
    });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success("Zahtev odbijen");
    load();
  };

  return (
    <>
      <PhoneShell
        hasBottomNav
        back="/trener"
        eyebrow="Naplata"
        title={
          <h1 className="font-display text-[28px] leading-[1.05] font-bold tracking-tightest">
            Zahtevi za uplatu
          </h1>
        }
      >
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : pending.length === 0 ? (
          <Card className="p-6 text-center space-y-3">
            <div className="h-12 w-12 mx-auto rounded-2xl bg-muted flex items-center justify-center">
              <Inbox className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="font-display text-[18px] font-bold tracking-tight">
              Nema zahteva
            </div>
            <p className="text-[13px] text-muted-foreground">
              Kad vežbač izabere paket, pojaviće se ovde.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {pending.map((p) => (
              <Card key={p.id} className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 rounded-2xl bg-gradient-brand-soft text-primary flex items-center justify-center shrink-0">
                    {p.payment_method === "cash" ? (
                      <Banknote className="h-[18px] w-[18px]" />
                    ) : (
                      <Receipt className="h-[18px] w-[18px]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-semibold tracking-tight truncate">
                      {p.athlete_name}
                    </div>
                    <div className="text-[12.5px] text-muted-foreground">
                      {p.package_name}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="font-display text-[16px] font-bold tracking-tight text-primary tnum">
                        {p.price_rsd.toLocaleString("sr-RS")} RSD
                      </span>
                      <Chip tone={p.payment_method === "cash" ? "warning" : "info"}>
                        {p.payment_method === "cash" ? "Keš" : "Račun"}
                      </Chip>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {p.sessions_count} treninga · {p.duration_days} dana
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => reject(p)}
                    disabled={busyId === p.id}
                  >
                    <X className="h-4 w-4 mr-1.5" /> Odbij
                  </Button>
                  <Button
                    onClick={() => confirm(p)}
                    disabled={busyId === p.id}
                    className="bg-gradient-brand text-white shadow-brand"
                  >
                    {busyId === p.id ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-1.5" />
                    )}
                    Potvrdi
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </PhoneShell>
      <BottomNav role="trainer" />
    </>
  );
};

export default Payments;
