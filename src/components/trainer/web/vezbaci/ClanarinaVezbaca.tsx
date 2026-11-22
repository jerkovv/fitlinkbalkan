import { useState } from "react";
import { Banknote, CreditCard, Hourglass, Infinity as BezRoka, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui-bits";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { LockMark } from "@/components/pretplata/LockMark";
import { OBLASTI } from "@/components/pretplata/oblastiZakljucanja";
import { porukaGreske } from "@/lib/errorMessage";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { danIzTeksta } from "./aktivnost";

export type ClanarinaRed = {
  id: string;
  plan_name: string;
  price: number | null;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
  sessions_total: number | null;
  sessions_used: number;
  purchase_id?: string | null;
  membership_purchases?: { paid_at: string | null } | null;
};

const dana = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "dan" : "dana"}`;
const kratko = (s: string) => danIzTeksta(s).toLocaleDateString("sr-Latn-RS", { day: "numeric", month: "short" });

const opseg = (c: ClanarinaRed) => {
  if (c.starts_on && c.ends_on) return `${kratko(c.starts_on)} - ${kratko(c.ends_on)}`;
  if (c.starts_on) return `od ${kratko(c.starts_on)}, bez roka`;
  if (c.ends_on) return `do ${kratko(c.ends_on)}`;
  return "Bez datuma";
};

const Info = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cn("inline-flex h-[26px] items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-[11.5px] font-medium text-muted-foreground tnum", className)}>
    {children}
  </span>
);

/** Kartica clanarine sa svim radnjama iz menija na telefonu, ovde odmah vidljivim. */
export const ClanarinaVezbaca = ({
  clanarina: c,
  onIzmeni,
  onBonus,
  onNova,
  onPromena,
}: {
  clanarina: ClanarinaRed | null;
  onIzmeni: () => void;
  onBonus: () => void;
  onNova: () => void;
  onPromena: () => void;
}) => {
  const { locked, openLock, guard } = usePretplataLock();
  const [menja, setMenja] = useState<boolean | null>(null);

  const zaglavlje = (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Paket</div>
      <h2 className="font-display text-[19px] font-bold tracking-tight">Članarina</h2>
    </div>
  );

  if (!c) {
    return (
      <section className="card-premium p-5">
        {zaglavlje}
        <div className="mt-3 text-[14px] font-semibold">Nema članarinu</div>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">Dodaj ručno ili sačekaj zahtev vežbača</p>
        <Button variant="outline" onClick={guard(onNova, OBLASTI.naplata)} className="mt-3 h-10 w-full rounded-full">
          <LockMark className="mr-1.5" /><Plus className="mr-1.5 h-4 w-4" /> Dodaj
        </Button>
      </section>
    );
  }

  const doKraja = c.ends_on
    ? Math.round(
        (danIzTeksta(c.ends_on).getTime() -
          new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) /
          86400000,
      )
    : null;
  const istekla = doKraja != null && doKraja < 0;
  const aktivna = c.status === "active" && !istekla;
  const stanje: { tekst: string; ton: "success" | "warning" | "danger" | "muted" } =
    c.status === "paused"
      ? { tekst: "Pauzirana", ton: "warning" }
      : c.status === "cancelled"
        ? { tekst: "Otkazana", ton: "muted" }
        : c.status === "expired" || istekla
          ? { tekst: "Istekla", ton: "danger" }
          : { tekst: "Aktivna", ton: "success" };

  // null: clanarina nije nastala iz zahteva, pa uplata jos nije zabelezena.
  const placeno = c.purchase_id ? c.membership_purchases?.paid_at != null : null;
  const ukupno = c.sessions_total && c.sessions_total > 0 ? c.sessions_total : null;
  const iskorisceno = ukupno ? Math.min(c.sessions_used ?? 0, ukupno) : 0;

  const oznaci = async (p: boolean) => {
    if (locked) return openLock(OBLASTI.naplata);
    setMenja(p);
    const { error } = await supabase.rpc("trainer_set_membership_paid", {
      p_membership_id: c.id,
      p_paid: p,
    });
    setMenja(null);
    if (error) {
      toast.error(porukaGreske(error));
      return;
    }
    toast.success(p ? "Članarina je označena kao plaćena." : "Članarina se vodi kao neplaćena.");
    onPromena();
  };

  const dugmePlaceno = (p: boolean) => (
    <Button
      key={String(p)}
      variant="outline"
      disabled={menja != null}
      onClick={() => void oznaci(p)}
      className="h-9 flex-auto rounded-full px-4 text-[12px]"
    >
      {menja === p && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
      <LockMark className="mr-1" />
      {p ? "Označi kao plaćeno" : "Označi kao neplaćeno"}
    </Button>
  );

  return (
    <section className="card-premium space-y-3.5 p-5">
      <div className="flex items-end justify-between gap-3">
        {zaglavlje}
        <Button variant="outline" onClick={guard(onIzmeni, OBLASTI.naplata)} className="h-8 shrink-0 rounded-full px-3 text-[12.5px]">
          <LockMark className="mr-1" /><Pencil className="mr-1 h-3.5 w-3.5" /> Izmeni članarinu
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-success-soft text-success-soft-foreground">
          <CreditCard className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[16px] font-bold leading-snug tracking-tight">{c.plan_name || "Članarina"}</div>
          <div className="text-[12px] text-muted-foreground tnum">{opseg(c)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip tone={stanje.ton}>{stanje.tekst}</Chip>
        {placeno === false && <Chip tone="warning">Nije plaćeno</Chip>}
      </div>

      {ukupno ? (
        <div>
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="font-semibold tnum">{iskorisceno} od {ukupno} treninga</span>
            <span className="text-muted-foreground tnum">još {Math.max(0, ukupno - iskorisceno)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${(iskorisceno / ukupno) * 100}%` }} />
          </div>
        </div>
      ) : (
        <div className="text-[12px] text-muted-foreground">Bez limita treninga</div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {doKraja == null ? (
          <Info><BezRoka className="h-3 w-3" /> bez roka</Info>
        ) : (
          <Info className={doKraja < 0 ? "text-destructive" : doKraja <= 7 ? "text-warning" : undefined}>
            <Hourglass className="h-3 w-3" />
            {doKraja < 0 ? `istekla pre ${dana(-doKraja)}` : doKraja === 0 ? "ističe danas" : `još ${dana(doKraja)}`}
          </Info>
        )}
        {c.price != null && c.price > 0 && (
          <Info><Banknote className="h-3 w-3" /> {c.price.toLocaleString("sr-Latn-RS")} RSD</Info>
        )}
      </div>

      <div className="space-y-2 border-t border-hairline pt-3">
        <div className="flex flex-wrap gap-2">
          {placeno == null ? [dugmePlaceno(true), dugmePlaceno(false)] : dugmePlaceno(!placeno)}
        </div>
        {/* Natpisi su uvek celi: kad dva dugmeta ne staju, drugo prelazi u novi red. */}
        <div className="flex flex-wrap gap-2">
          {aktivna && (
            <Button variant="outline" onClick={guard(onBonus, OBLASTI.naplata)} className="h-9 flex-auto rounded-full px-4 text-[12px]">
              <LockMark className="mr-1" /><Plus className="mr-1 h-3.5 w-3.5" /> Bonus treninzi
            </Button>
          )}
          <Button variant="outline" onClick={guard(onNova, OBLASTI.naplata)} className="h-9 flex-auto rounded-full px-4 text-[12px]">
            <LockMark className="mr-1" /><Plus className="mr-1 h-3.5 w-3.5" /> Dodaj novu članarinu
          </Button>
        </div>
      </div>
    </section>
  );
};
