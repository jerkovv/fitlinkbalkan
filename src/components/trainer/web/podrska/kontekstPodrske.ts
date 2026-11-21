import { supabase } from "@/lib/supabase";
import type { KontekstPodrske } from "./podrskaModel";

const datumDMY = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};

/** Isti tekst kao pretplataZaPodrsku u iOS aplikaciji. */
function opisPretplate(aktivna: boolean, status: string | null, datum: string | null) {
  if (!aktivna) return datum ? `Istekla ${datum}` : "Nema pretplatu";
  if (status === "trialing") return datum ? `Proba do ${datum}` : "Proba";
  return datum ? `Aktivna do ${datum}` : "Aktivna";
}

/**
 * Ko pise podrsci: ime, studio, broj vezbaca i pretplata, kao na telefonu. Ovi podaci
 * su za tim, pa upit koji ne prodje samo izostavlja taj red, a cet radi dalje.
 */
export async function ucitajKontekstPodrske(uid: string, email: string | null): Promise<KontekstPodrske> {
  const [profil, trener, vezbaci, pristup, pretplata] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle(),
    supabase.from("trainers").select("studio_name, city").eq("id", uid).maybeSingle(),
    supabase.from("athletes").select("id", { count: "exact", head: true }).eq("trainer_id", uid),
    supabase.rpc("trainer_has_active_fitlink_sub", { p_trainer_id: uid }),
    supabase
      .from("trainer_subscriptions")
      .select("status, access_until, current_period_end, trial_ends_at")
      .eq("trainer_id", uid)
      .maybeSingle(),
  ]);

  for (const r of [profil, trener, vezbaci, pristup, pretplata]) {
    if (r.error) console.error("[podrska] podatak za tim nije ucitan", r.error);
  }

  const dodatno: [string, string][] = [];
  const t = trener.data as { studio_name?: string | null; city?: string | null } | null;
  const studio = [t?.studio_name, t?.city].filter(Boolean).join(" · ");
  if (!trener.error && studio) dodatno.push(["Studio", studio]);
  if (!vezbaci.error && vezbaci.count != null) dodatno.push(["Vežbača", String(vezbaci.count)]);
  if (!pristup.error && !pretplata.error) {
    const s = pretplata.data as {
      status?: string | null;
      access_until?: string | null;
      current_period_end?: string | null;
      trial_ends_at?: string | null;
    } | null;
    const datum = datumDMY(s?.access_until ?? s?.current_period_end ?? s?.trial_ends_at);
    dodatno.push(["Pretplata", opisPretplate(pristup.data === true, s?.status ?? null, datum)]);
  }

  return {
    ime: (profil.data as { full_name?: string | null } | null)?.full_name ?? "",
    email,
    dodatno,
  };
}
