import { useEffect, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card, Chip } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2, ShieldCheck, Package, Banknote, Receipt, Clock, X, Plus, Copy, Check, Landmark,
} from "lucide-react";
import { toast } from "sonner";

type Membership = {
  id: string;
  plan_name: string;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
  sessions_total: number | null;
  sessions_used: number;
};

type Pkg = {
  id: string;
  name: string;
  sessions_count: number;
  duration_days: number;
  price_rsd: number;
};

type Purchase = {
  id: string;
  package_name: string;
  sessions_count: number;
  duration_days: number;
  price_rsd: number;
  payment_method: "cash" | "bank";
  status: "pending" | "rejected";
  requested_at: string;
};

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("sr-RS", {
    day: "numeric", month: "short", year: "numeric",
  });
};

type BankInfo = {
  recipient: string | null;
  account: string | null;
  bank_name: string | null;
  model: string | null;
  reference: string | null;
  purpose: string | null;
};

const Membership = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [trainerName, setTrainerName] = useState("");
  const [bank, setBank] = useState<BankInfo | null>(null);
  const [active, setActive] = useState<Membership | null>(null);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [recent, setRecent] = useState<Purchase[]>([]);

  // Buy dialog
  const [storeOpen, setStoreOpen] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<Pkg | null>(null);
  const [method, setMethod] = useState<"cash" | "bank">("cash");
  const [buying, setBuying] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);

    const { data: ath } = await supabase
      .from("athletes")
      .select("trainer_id")
      .eq("id", user.id)
      .maybeSingle();
    const tid = (ath as any)?.trainer_id ?? null;
    setTrainerId(tid);

    if (tid) {
      const [profRes, trRes, memRes, pkgRes, purRes] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", tid).maybeSingle(),
        supabase
          .from("trainers")
          .select("bank_recipient, bank_account, bank_name, bank_model, bank_reference, bank_purpose")
          .eq("id", tid)
          .maybeSingle(),
        supabase
          .from("memberships")
          .select("id, plan_name, status, starts_on, ends_on, sessions_total, sessions_used")
          .eq("athlete_id", user.id)
          .eq("trainer_id", tid)
          .eq("status", "active")
          .order("ends_on", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("membership_packages")
          .select("id, name, sessions_count, duration_days, price_rsd")
          .eq("trainer_id", tid)
          .eq("is_active", true)
          .order("price_rsd", { ascending: true }),
        supabase
          .from("membership_purchases")
          .select("id, package_name, sessions_count, duration_days, price_rsd, payment_method, status, requested_at")
          .eq("athlete_id", user.id)
          .in("status", ["pending", "rejected"])
          .order("requested_at", { ascending: false })
          .limit(5),
      ]);

      setTrainerName((profRes.data as any)?.full_name ?? "Trener");
      const tr: any = trRes.data ?? {};
      setBank({
        recipient: tr.bank_recipient ?? null,
        account: tr.bank_account ?? null,
        bank_name: tr.bank_name ?? null,
        model: tr.bank_model ?? null,
        reference: tr.bank_reference ?? null,
        purpose: tr.bank_purpose ?? null,
      });
      setActive((memRes.data as any) ?? null);
      setPackages((pkgRes.data as any[]) ?? []);
      setRecent((purRes.data as any[]) ?? []);
    }

    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const openStore = () => {
    setSelectedPkg(null);
    setMethod("cash");
    setStoreOpen(true);
  };

  const buy = async () => {
    if (!selectedPkg) return;
    setBuying(true);
    const { error } = await supabase.rpc("request_membership_purchase", {
      p_package_id: selectedPkg.id,
      p_payment_method: method,
    });
    setBuying(false);
    if (error) return toast.error(error.message);
    toast.success("Zahtev poslat treneru");
    setStoreOpen(false);
    load();
  };

  const cancelRequest = async (id: string) => {
    if (!window.confirm("Otkazati zahtev?")) return;
    const { error } = await supabase.rpc("cancel_membership_purchase", { p_purchase_id: id });
    if (error) return toast.error(error.message);
    toast.success("Zahtev otkazan");
    load();
  };

  const sessionsLeft =
    active?.sessions_total != null
      ? Math.max(0, active.sessions_total - active.sessions_used)
      : null;
  const expired =
    active?.ends_on ? new Date(active.ends_on) < new Date() : false;
  const noSessionsLeft = sessionsLeft === 0;
  const needsRenewal = !active || expired || noSessionsLeft;

  return (
    <>
      <PhoneShell hasBottomNav title="Tvoja članarina" eyebrow="Pretplata">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {active && !expired && !noSessionsLeft ? (
              <Card className="p-5 bg-gradient-brand text-white border-0 shadow-brand relative overflow-hidden">
                <div className="absolute -bottom-12 -right-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                <div className="relative">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80">
                        Aktivan paket
                      </div>
                      <div className="font-display text-[24px] font-bold tracking-tighter mt-1">
                        {active.plan_name}
                      </div>
                    </div>
                    <Chip tone="success" className="bg-white/15 text-white border-0">
                      <ShieldCheck className="h-3 w-3 mr-1" /> Aktivna
                    </Chip>
                  </div>

                  {active.sessions_total != null && (
                    <>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-display text-[40px] font-bold tracking-tightest tnum">
                          {sessionsLeft}
                        </span>
                        <span className="text-[14px] font-semibold text-white/80">
                          / {active.sessions_total} treninga preostalo
                        </span>
                      </div>
                      <div className="mt-4 h-1.5 bg-white/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white rounded-full"
                          style={{
                            width: `${((sessionsLeft ?? 0) / (active.sessions_total || 1)) * 100}%`,
                          }}
                        />
                      </div>
                    </>
                  )}
                  <div className="text-[12px] text-white/85 mt-3">
                    Važi do {fmtDate(active.ends_on)} · Trener {trainerName.split(" ")[0]}
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="p-5 text-center space-y-3">
                <div className="h-12 w-12 mx-auto rounded-2xl bg-muted flex items-center justify-center">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="font-display text-[20px] font-bold tracking-tight">
                  {expired
                    ? "Članarina je istekla"
                    : noSessionsLeft
                    ? "Iskoristio si sve treninge"
                    : "Nemaš aktivnu članarinu"}
                </div>
                <p className="text-[13px] text-muted-foreground">
                  Izaberi paket da nastaviš sa treninzima.
                </p>
              </Card>
            )}

            <Button
              onClick={openStore}
              size="lg"
              disabled={!trainerId || packages.length === 0}
              className="w-full bg-gradient-brand text-white shadow-brand hover:opacity-95"
            >
              <Plus className="h-4 w-4 mr-2" />
              {needsRenewal ? "Produži članarinu" : "Kupi novi paket"}
            </Button>

            {packages.length === 0 && (
              <p className="text-center text-[12px] text-muted-foreground -mt-2">
                Trener još nije postavio pakete.
              </p>
            )}

            {recent.length > 0 && (
              <section>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-3">
                  Tvoji zahtevi
                </div>
                <div className="space-y-2">
                  {recent.map((p) => (
                    <Card key={p.id} className="p-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-surface-2 text-muted-foreground flex items-center justify-center">
                        {p.status === "pending" ? (
                          <Clock className="h-[18px] w-[18px]" />
                        ) : (
                          <X className="h-[18px] w-[18px]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-semibold tracking-tight truncate">
                          {p.package_name}
                        </div>
                        <div className="text-[12px] text-muted-foreground">
                          {p.price_rsd.toLocaleString("sr-RS")} RSD ·{" "}
                          {p.payment_method === "cash" ? "Keš" : "Račun"}
                        </div>
                      </div>
                      {p.status === "pending" ? (
                        <button
                          onClick={() => cancelRequest(p.id)}
                          className="text-[11px] font-semibold text-destructive"
                        >
                          Otkaži
                        </button>
                      ) : (
                        <Chip tone="warning">Odbijen</Chip>
                      )}
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </PhoneShell>
      <BottomNav role="athlete" />

      <Dialog open={storeOpen} onOpenChange={setStoreOpen}>
        <DialogContent className="max-w-[420px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Izaberi paket</DialogTitle>
            <DialogDescription>
              Trener će potvrditi uplatu pre aktivacije.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {packages.map((pkg) => {
              const sel = selectedPkg?.id === pkg.id;
              return (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPkg(pkg)}
                  className={`w-full text-left p-4 rounded-2xl border transition ${
                    sel
                      ? "border-primary bg-primary-soft/40"
                      : "border-hairline hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold tracking-tight truncate">
                        {pkg.name}
                      </div>
                      <div className="text-[12px] text-muted-foreground">
                        {pkg.sessions_count} treninga · {pkg.duration_days} dana
                      </div>
                    </div>
                    <div className="font-display text-[18px] font-bold tracking-tight text-primary tnum shrink-0">
                      {pkg.price_rsd.toLocaleString("sr-RS")}{" "}
                      <span className="text-[10px] text-muted-foreground">RSD</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedPkg && (
            <div className="space-y-3 pt-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Način plaćanja
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMethod("cash")}
                  className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition ${
                    method === "cash"
                      ? "border-primary bg-primary-soft/40 text-foreground"
                      : "border-hairline text-muted-foreground"
                  }`}
                >
                  <Banknote className="h-5 w-5" />
                  <span className="text-[12.5px] font-semibold">Keš lično</span>
                </button>
                <button
                  onClick={() => setMethod("bank")}
                  className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition ${
                    method === "bank"
                      ? "border-primary bg-primary-soft/40 text-foreground"
                      : "border-hairline text-muted-foreground"
                  }`}
                >
                  <Receipt className="h-5 w-5" />
                  <span className="text-[12.5px] font-semibold">Na račun</span>
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {method === "cash"
                  ? "Predaš novac treneru. Kad on potvrdi, članarina kreće."
                  : "Uplati na trenerov račun. Kad on vidi uplatu i potvrdi, članarina kreće."}
              </p>

              {method === "bank" && (
                <BankSlip bank={bank} amount={selectedPkg.price_rsd} />
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setStoreOpen(false)}>
              Otkaži
            </Button>
            <Button
              onClick={buy}
              disabled={!selectedPkg || buying}
              className="bg-gradient-brand text-white shadow-brand"
            >
              {buying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Pošalji zahtev
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Membership;
