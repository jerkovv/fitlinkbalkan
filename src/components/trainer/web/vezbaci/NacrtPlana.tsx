import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PenLine } from "lucide-react";
import { toast } from "sonner";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { LockMark } from "@/components/pretplata/LockMark";
import { OBLASTI } from "@/components/pretplata/oblastiZakljucanja";
import { useConfirm } from "@/hooks/useConfirm";
import { porukaGreske } from "@/lib/errorMessage";
import { supabase } from "@/lib/supabase";

/** Plan koji je trener poceo a nije poslao: vezbac ga jos ne vidi. */
export const NacrtPlana = ({
  vrsta,
  athleteId,
  kljuc,
}: {
  vrsta: "program" | "ishrana";
  athleteId: string;
  /** Menja se kad se nacrt obrise negde drugde, da traka ne ostane sa mrtvim linkom. */
  kljuc: number;
}) => {
  const { locked, openLock } = usePretplataLock();
  const confirm = useConfirm();
  const [nacrt, setNacrt] = useState<{ id: string; name: string | null } | null>(null);
  const [brise, setBrise] = useState(false);
  const tabela = vrsta === "program" ? "assigned_programs" : "assigned_nutrition_plans";

  useEffect(() => {
    let vazi = true;
    (async () => {
      let upit = supabase.from(tabela).select("id, name").eq("athlete_id", athleteId).is("published_at", null);
      if (vrsta === "program") upit = upit.is("source_template_id", null);
      const { data, error } = await upit.order("assigned_at", { ascending: false }).limit(1);
      if (!vazi) return;
      if (error) {
        toast.error(porukaGreske(error));
        return;
      }
      setNacrt(((data ?? [])[0] as { id: string; name: string | null } | undefined) ?? null);
    })();
    return () => {
      vazi = false;
    };
  }, [tabela, vrsta, athleteId, kljuc]);

  if (!nacrt) return null;
  const naziv = nacrt.name ?? (vrsta === "program" ? "Novi plan" : "Novi plan ishrane");

  const odbaci = async () => {
    if (locked) return openLock(vrsta === "program" ? OBLASTI.programi : OBLASTI.ishrana);
    const da = await confirm({
      title: "Odbaciti započet plan?",
      description: `Plan ${naziv} se briše i ne može da se vrati.`,
      confirmLabel: "Odbaci",
      destructive: true,
    });
    if (!da) return;
    setBrise(true);
    const { error } = await supabase.from(tabela).delete().eq("id", nacrt.id).is("published_at", null);
    setBrise(false);
    if (error) {
      toast.error(porukaGreske(error));
      return;
    }
    setNacrt(null);
    toast.success("Započet plan je odbačen.");
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-warning/40 bg-warning/[0.08] px-3.5 py-2.5">
      <PenLine className="h-4 w-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold leading-snug">Imaš započet plan: {naziv}</div>
        <div className="text-[11.5px] text-muted-foreground">Vežbač ga vidi tek kada ga pošalješ</div>
      </div>
      <button
        type="button"
        onClick={() => void odbaci()}
        disabled={brise}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      >
        <LockMark />
        Odbaci
      </button>
      <Link
        to={`/trener/vezbaci/${athleteId}/${vrsta}/${nacrt.id}`}
        className="inline-flex h-8 shrink-0 items-center rounded-full bg-warning/15 px-3 text-[12.5px] font-semibold text-warning transition hover:bg-warning/25"
      >
        Nastavi
      </Link>
    </div>
  );
};
