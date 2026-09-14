import { supabase } from "@/lib/supabase";

/**
 * Dodela programa iz sablona. JEDINI put je RPC assign_program_to_athlete -
 * on u istoj transakciji pravi assigned_programs (odmah objavljen,
 * published_at = now()), prepisuje dane, vezbe i pojedinacne serije, i nosi
 * superset_group i duration_minutes.
 *
 * Ovde je ranije stajao rezervni put: ako RPC pukne, uradi obican INSERT pa
 * rucno prepisi dane i vezbe. Taj put je pravio plan BEZ published_at (vezbac
 * vidi samo objavljene planove), bez source_template_id, bez serija, bez
 * superseta - a greska se gutala i trener je dobijao "Program dodeljen
 * vezbacu". Kad je RPC stvarno pukao (superset_group nije bio u SELECT-u
 * kursora, vidi migraciju 20260907130000), ispalo je da trener dodeli plan a
 * vezbac ne dobije nista - bez ijedne poruke o gresci, ni na telefonu ni na
 * fitlink.rs/dashboard.
 *
 * Zato rezervnog puta vise nema: greska sa servera ide pravo gore, do toast-a.
 */
export const assignProgramToAthlete = async (templateId: string, athleteId: string) => {
  const { data, error } = await supabase.rpc("assign_program_to_athlete", {
    p_template_id: templateId,
    p_athlete_id: athleteId,
  });
  if (error) throw error;
  if (!data) throw new Error("Program nije dodeljen. Pokušaj ponovo.");
  return String(data);
};
