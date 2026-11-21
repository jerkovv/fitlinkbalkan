import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { porukaGreske } from "@/lib/errorMessage";
import { useAuth } from "@/hooks/useAuth";

// Brojke i opisi iza plocica "Tvoj studio", isti upiti kao TrenerStudioModel u iOS-u.
// Upit koji ne prodje ostavlja null: plocica tada pise crticu, a ne izmisljenu nulu.

export type StudioPregled = {
  naCekanjuRsd: number | null;
  meseci: { oznaka: string; iznos: number }[] | null;
  vezbaca: number | null;
  pozivnica: number | null;
  programa: number | null;
  poslednjiProgram: string | null;
  opisPrograma: string | null;
  planova: number | null;
  poslednjiPlan: string | null;
  kcal: number | null;
  paketa: number | null;
  poTreningu: number | null;
  terminaNedeljno: number | null;
  mesta: number | null;
  vrsta: number | null;
  vezbi: number | null;
};

const MESECI_KRATKO = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Avg", "Sep", "Okt", "Nov", "Dec"];

const jedan = (n: number) => n % 10 === 1 && n % 100 !== 11;
const malo = (n: number) => n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14);

export const reci = {
  plana: (n: number) => (jedan(n) ? "plan" : malo(n) ? "plana" : "planova"),
  programa: (n: number) => (jedan(n) ? "program" : "programa"),
  vezbaca: (n: number) => (jedan(n) ? "vežbač" : "vežbača"),
  vrsta: (n: number) => (malo(n) ? "vrste" : "vrsta"),
  dana: (n: number) => `${n} ${jedan(n) ? "dan" : "dana"}`,
  vezbe: (n: number) => `${n} ${jedan(n) ? "vežba" : malo(n) ? "vežbe" : "vežbi"}`,
  pozivnice: (n: number) =>
    n === 0
      ? "Lista i pozivi"
      : malo(n)
        ? `${n} pozivnice čekaju`
        : `${n} pozivnica čeka`,
};

type RedPrograma = {
  name: string;
  program_template_days: { program_template_exercises: { position: number | null }[] | null }[] | null;
};

export function useStudioPregled(): StudioPregled | null {
  const { user } = useAuth();
  const [d, setD] = useState<StudioPregled | null>(null);

  useEffect(() => {
    if (!user) return;
    let ziv = true;
    (async () => {
      const uid = user.id;
      const sad = new Date();
      const od = new Date(sad.getFullYear(), sad.getMonth() - 5, 1);
      const [pend, potv, ath, poz, progBroj, prog, plan, pak, vrste, slot, vezbe] = await Promise.all([
        supabase.from("membership_purchases").select("price_rsd").eq("trainer_id", uid).eq("status", "pending"),
        // Prihod broji samo placeno, po datumu uplate.
        supabase
          .from("membership_purchases")
          .select("price_rsd, paid_at")
          .eq("trainer_id", uid)
          .eq("status", "confirmed")
          .not("paid_at", "is", null)
          .gte("paid_at", od.toISOString()),
        supabase.from("athletes").select("id", { count: "exact", head: true }).eq("trainer_id", uid),
        supabase
          .from("invites")
          .select("id", { count: "exact", head: true })
          .eq("trainer_id", uid)
          .eq("status", "pending")
          .not("email", "is", null),
        supabase.from("program_templates").select("id", { count: "exact", head: true }).eq("trainer_id", uid),
        supabase
          .from("program_templates")
          .select("name, program_template_days(program_template_exercises(position))")
          .eq("trainer_id", uid)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("nutrition_plan_templates")
          .select("name, target_kcal")
          .eq("trainer_id", uid)
          .order("created_at", { ascending: false }),
        supabase.from("membership_packages").select("price_rsd, sessions_count").eq("trainer_id", uid).eq("is_active", true),
        supabase.from("session_types").select("id, capacity").eq("trainer_id", uid).eq("is_archived", false),
        supabase.from("session_slot_templates").select("session_type_id").eq("trainer_id", uid).eq("is_active", true),
        supabase
          .from("exercises")
          .select("id", { count: "exact", head: true })
          .or(`is_global.eq.true,created_by.eq.${uid}`),
      ]);
      if (!ziv) return;

      const prva = [pend, potv, ath, poz, progBroj, prog, plan, pak, vrste, slot, vezbe].find((r) => r.error);
      if (prva?.error) toast.error(porukaGreske(prva.error));

      let meseci: StudioPregled["meseci"] = null;
      if (!potv.error) {
        const m = Array.from({ length: 6 }, (_, i) => {
          const x = new Date(sad.getFullYear(), sad.getMonth() - 5 + i, 1);
          return { god: x.getFullYear(), mes: x.getMonth(), oznaka: MESECI_KRATKO[x.getMonth()], iznos: 0 };
        });
        for (const r of (potv.data as { price_rsd: number | null; paid_at: string | null }[]) ?? []) {
          if (!r.paid_at) continue;
          const dt = new Date(r.paid_at);
          const red = m.find((x) => x.god === dt.getFullYear() && x.mes === dt.getMonth());
          if (red) red.iznos += r.price_rsd ?? 0;
        }
        meseci = m.map(({ oznaka, iznos }) => ({ oznaka, iznos }));
      }

      // Tek napravljen prazan program nema sta da pokaze: uzima se najnoviji koji ima vezbe.
      const programi = (prog.data as unknown as RedPrograma[]) ?? [];
      const brojVezbi = (p: RedPrograma) =>
        (p.program_template_days ?? []).reduce((s, x) => s + (x.program_template_exercises?.length ?? 0), 0);
      const izabran = programi.find((p) => brojVezbi(p) > 0) ?? programi[0] ?? null;
      const danaPrograma = izabran?.program_template_days?.length ?? 0;
      const vezbiPrograma = izabran ? brojVezbi(izabran) : 0;
      const opisPrograma =
        [danaPrograma > 0 ? reci.dana(danaPrograma) : null, vezbiPrograma > 0 ? reci.vezbe(vezbiPrograma) : null]
          .filter(Boolean)
          .join(" · ") || null;

      const planovi = (plan.data as { name: string; target_kcal: number | null }[]) ?? [];
      const paketi = (pak.data as { price_rsd: number; sessions_count: number }[]) ?? [];
      const poTreningu = paketi.length
        ? Math.min(...paketi.map((p) => (p.sessions_count > 0 ? p.price_rsd / p.sessions_count : p.price_rsd)))
        : null;

      const tipovi = (vrste.data as { id: string; capacity: number | null }[]) ?? [];
      const sabloni = ((slot.data as { session_type_id: string }[]) ?? []).filter((s) =>
        tipovi.some((t) => t.id === s.session_type_id),
      );
      const terminiPoznati = !vrste.error && !slot.error;

      setD({
        naCekanjuRsd: pend.error
          ? null
          : ((pend.data as { price_rsd: number | null }[]) ?? []).reduce((s, r) => s + (r.price_rsd ?? 0), 0),
        meseci,
        vezbaca: ath.error ? null : ath.count ?? 0,
        pozivnica: poz.error ? null : poz.count ?? 0,
        programa: progBroj.error ? null : progBroj.count ?? 0,
        poslednjiProgram: prog.error ? null : izabran?.name ?? null,
        opisPrograma: prog.error ? null : opisPrograma,
        planova: plan.error ? null : planovi.length,
        poslednjiPlan: planovi[0]?.name ?? null,
        kcal: planovi[0]?.target_kcal ?? null,
        paketa: pak.error ? null : paketi.length,
        poTreningu,
        terminaNedeljno: terminiPoznati ? sabloni.length : null,
        mesta: terminiPoznati
          ? sabloni.reduce((s, x) => s + (tipovi.find((t) => t.id === x.session_type_id)?.capacity ?? 1), 0)
          : null,
        vrsta: vrste.error ? null : tipovi.length,
        vezbi: vezbe.error ? null : vezbe.count ?? null,
      });
    })();
    return () => {
      ziv = false;
    };
  }, [user]);

  return d;
}
