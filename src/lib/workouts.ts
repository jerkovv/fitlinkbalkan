import { supabase } from "@/lib/supabase";

export type NextWorkoutDay = {
  assigned_program_id: string;
  program_name: string;
  day_id: string;
  day_number: number;
  day_name: string;
  total_days: number;
};

export const getNextWorkoutDay = async (athleteId: string): Promise<NextWorkoutDay | null> => {
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_next_workout_day", {
    p_athlete_id: athleteId,
  });

  const rpcNext = (rpcData as NextWorkoutDay[] | null)?.[0];
  if (!rpcError && rpcNext) return rpcNext;

  const { data: programs, error: programError } = await supabase
    .from("assigned_programs")
    .select("id, name, assigned_at")
    .eq("athlete_id", athleteId)
    .order("assigned_at", { ascending: false })
    .limit(1);

  if (programError) return null;
  const program = (programs as any[] | null)?.[0];
  if (!program) return null;

  const { data: days } = await supabase
    .from("assigned_program_days")
    .select("id, day_number, name")
    .eq("assigned_program_id", program.id)
    .order("day_number", { ascending: true });

  const programDays = (days as any[] | null) ?? [];
  if (programDays.length === 0) return null;

  const { data: lastLog } = await supabase
    .from("workout_session_logs")
    .select("day_number")
    .eq("athlete_id", athleteId)
    .eq("assigned_program_id", program.id)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastIndex = programDays.findIndex((day) => day.day_number === (lastLog as any)?.day_number);
  const nextDay = programDays[lastIndex >= 0 ? (lastIndex + 1) % programDays.length : 0];

  return {
    assigned_program_id: program.id,
    program_name: program.name,
    day_id: nextDay.id,
    day_number: nextDay.day_number,
    day_name: nextDay.name,
    total_days: programDays.length,
  };
};