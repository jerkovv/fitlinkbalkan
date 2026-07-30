import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { porukaGreske } from "@/lib/errorMessage";
import { cn } from "@/lib/utils";
import {
  FullScreenSheet,
  FullScreenSheetScroll,
  FullScreenSheetFooter,
} from "@/components/ui/full-screen-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type MembershipStatus = "active" | "paused" | "expired" | "cancelled";

type MembershipRow = {
  id: string;
  plan_name: string | null;
  price: number | null;
  status: MembershipStatus;
  starts_on: string | null;
  ends_on: string | null;
  sessions_total: number | null;
  sessions_used: number | null;
};

type FormState = {
  plan_name: string;
  price: string;
  status: MembershipStatus;
  starts_on: string;
  ends_on: string;
  sessions_total: string;
  sessions_used: string;
};

const emptyForm: FormState = {
  plan_name: "",
  price: "",
  status: "active",
  starts_on: "",
  ends_on: "",
  sessions_total: "",
  sessions_used: "",
};

const STATUS_OPTIONS: { value: MembershipStatus; label: string }[] = [
  { value: "active", label: "Aktivna" },
  { value: "paused", label: "Pauzirana" },
  { value: "expired", label: "Istekla" },
  { value: "cancelled", label: "Otkazana" },
];

// Datum -> "YYYY-MM-DD" za <input type="date">. Kolona moze biti date ili
// timestamp, uzmi samo deo pre "T" da input uvek dobije ispravan format.
const toDateInputValue = (value: string | null): string => (value ? value.split("T")[0] : "");

const todayDateInputValue = (): string => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const addDaysToDateStr = (dateStr: string, days: number): string => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

interface MembershipEditSheetProps {
  open: boolean;
  onClose: () => void;
  membershipId: string | null;
  onSaved: () => void;
}

export const MembershipEditSheet = ({ open, onClose, membershipId, onSaved }: MembershipEditSheetProps) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  // Originalni status pri otvaranju, da znamo da li korisnik MENJA u active
  // (upozorenje o mejlu se prikazuje samo za tu tranziciju, ne za cist datum).
  const [originalStatus, setOriginalStatus] = useState<MembershipStatus | null>(null);

  useEffect(() => {
    if (!open || !membershipId) return;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("id, plan_name, price, status, starts_on, ends_on, sessions_total, sessions_used")
        .eq("id", membershipId)
        .maybeSingle();
      setLoading(false);
      if (error || !data) {
        toast.error(porukaGreske(error));
        onClose();
        return;
      }
      const row = data as MembershipRow;
      setOriginalStatus(row.status);
      setForm({
        plan_name: row.plan_name ?? "",
        price: row.price != null ? String(row.price) : "",
        status: row.status,
        starts_on: toDateInputValue(row.starts_on),
        ends_on: toDateInputValue(row.ends_on),
        sessions_total: row.sessions_total != null ? String(row.sessions_total) : "",
        sessions_used: row.sessions_used != null ? String(row.sessions_used) : "0",
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [open, membershipId]);

  const bumpEndsOn = (days: number) => {
    const today = todayDateInputValue();
    const base = form.ends_on && form.ends_on >= today ? form.ends_on : today;
    setForm((f) => ({ ...f, ends_on: addDaysToDateStr(base, days) }));
  };

  const showActivateWarning = originalStatus != null && originalStatus !== "active" && form.status === "active";

  const save = async () => {
    if (!membershipId) return;
    const name = form.plan_name.trim();
    if (!name) return toast.error("Naziv plana je obavezan");

    if (form.price.trim() && !Number.isFinite(parseFloat(form.price))) {
      return toast.error("Cena mora biti broj");
    }
    if (form.sessions_total.trim() && !Number.isFinite(parseInt(form.sessions_total, 10))) {
      return toast.error("Broj treninga mora biti broj");
    }
    if (form.sessions_used.trim() && !Number.isFinite(parseInt(form.sessions_used, 10))) {
      return toast.error("Iskorišćeno treninga mora biti broj");
    }
    if (form.starts_on && form.ends_on && form.ends_on < form.starts_on) {
      return toast.error("Datum isteka ne sme biti pre datuma početka");
    }

    const sessionsTotal = form.sessions_total.trim() ? parseInt(form.sessions_total, 10) : null;
    const sessionsUsed = form.sessions_used.trim() ? parseInt(form.sessions_used, 10) : 0;
    if (sessionsTotal != null && sessionsUsed > sessionsTotal) {
      return toast.error("Iskorišćeno ne sme biti veće od ukupnog broja treninga");
    }

    setSaving(true);
    const { error } = await supabase
      .from("memberships")
      .update({
        plan_name: name,
        price: form.price.trim() ? parseFloat(form.price) : null,
        status: form.status,
        starts_on: form.starts_on || null,
        ends_on: form.ends_on || null,
        sessions_total: sessionsTotal,
        sessions_used: sessionsUsed,
      })
      .eq("id", membershipId);
    setSaving(false);
    if (error) return toast.error(porukaGreske(error));
    toast.success("Članarina sačuvana");
    onSaved();
    onClose();
  };

  return (
    <FullScreenSheet open={open} onClose={onClose} title="Izmeni članarinu">
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <FullScreenSheetScroll className="pt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mem-name">Naziv plana</Label>
              <Input
                id="mem-name"
                value={form.plan_name}
                onChange={(e) => setForm((f) => ({ ...f, plan_name: e.target.value }))}
                className="h-14 text-base rounded-2xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mem-price">Cena (RSD)</Label>
              <Input
                id="mem-price"
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                className="h-14 text-base rounded-2xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, status: opt.value }))}
                    className={cn(
                      "h-11 rounded-2xl text-[13px] font-semibold border transition",
                      form.status === opt.value
                        ? "bg-foreground text-background border-foreground"
                        : "bg-surface border-hairline text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mem-starts">Početak</Label>
              <Input
                id="mem-starts"
                type="date"
                value={form.starts_on}
                onChange={(e) => setForm((f) => ({ ...f, starts_on: e.target.value }))}
                className="h-14 text-base rounded-2xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Brza izmena isteka</Label>
              <div className="flex gap-2">
                {[7, 30, 90].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => bumpEndsOn(days)}
                    className="flex-1 h-10 rounded-xl border border-hairline bg-surface text-[12.5px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition"
                  >
                    +{days} dana
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mem-ends">Ističe</Label>
              <Input
                id="mem-ends"
                type="date"
                value={form.ends_on}
                onChange={(e) => setForm((f) => ({ ...f, ends_on: e.target.value }))}
                className="h-14 text-base rounded-2xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mem-total">Ukupno treninga</Label>
                <Input
                  id="mem-total"
                  type="number"
                  min={0}
                  value={form.sessions_total}
                  onChange={(e) => setForm((f) => ({ ...f, sessions_total: e.target.value }))}
                  className="h-14 text-base rounded-2xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mem-used">Iskorišćeno</Label>
                <Input
                  id="mem-used"
                  type="number"
                  min={0}
                  value={form.sessions_used}
                  onChange={(e) => setForm((f) => ({ ...f, sessions_used: e.target.value }))}
                  className="h-14 text-base rounded-2xl"
                />
              </div>
            </div>

            {showActivateWarning && (
              <p className="text-[12.5px] font-medium text-warning-soft-foreground bg-warning-soft rounded-2xl px-3.5 py-3">
                Vezbac ce dobiti mejl o aktiviranoj clanarini.
              </p>
            )}
          </FullScreenSheetScroll>
          <FullScreenSheetFooter>
            <Button
              onClick={save}
              disabled={saving}
              className="w-full bg-gradient-brand text-white shadow-brand"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sačuvaj
            </Button>
          </FullScreenSheetFooter>
        </>
      )}
    </FullScreenSheet>
  );
};

export default MembershipEditSheet;
