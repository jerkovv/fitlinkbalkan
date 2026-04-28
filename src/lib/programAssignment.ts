import { supabase } from "@/lib/supabase";

type TemplateDay = { id: string; day_number: number; name: string };
type AssignedDay = { id: string; day_number: number; name?: string | null };
type TemplateExercise = {
  day_id: string;
  exercise_id: string;
  position: number;
  sets: number;
  reps: string | null;
  weight_kg: number | null;
  rest_seconds: number | null;
};
type AssignedExercise = { id: string; day_id: string; exercise_id: string; position: number };

export const ensureAssignedProgramSnapshot = async (templateId: string, assignedProgramId: string) => {
  const { data: tDays, error: daysError } = await supabase
    .from("program_template_days")
    .select("id, day_number, name")
    .eq("template_id", templateId)
    .order("day_number", { ascending: true });
  if (daysError) throw daysError;

  const templateDays = ((tDays as TemplateDay[] | null) ?? []);
  if (templateDays.length === 0) throw new Error("Program nema nijedan dan. Dodaj bar jedan dan.");

  const { data: existingDaysData, error: existingDaysError } = await supabase
    .from("assigned_program_days")
    .select("id, day_number, name")
    .eq("assigned_program_id", assignedProgramId);
  if (existingDaysError) throw existingDaysError;

  const dayByNumber = new Map<number, AssignedDay>();
  ((existingDaysData as AssignedDay[] | null) ?? []).forEach((day) => dayByNumber.set(day.day_number, day));

  const missingDays = templateDays.filter((day) => !dayByNumber.has(day.day_number));
  if (missingDays.length) {
    const { data: insertedDays, error: insertDaysError } = await supabase
      .from("assigned_program_days")
      .insert(missingDays.map((day) => ({
        assigned_program_id: assignedProgramId,
        day_number: day.day_number,
        name: day.name,
      })) as any)
      .select("id, day_number, name");
    if (insertDaysError) throw insertDaysError;
    ((insertedDays as AssignedDay[] | null) ?? []).forEach((day) => dayByNumber.set(day.day_number, day));
  }

  const dayUpdates = templateDays
    .map((day) => ({ template: day, assigned: dayByNumber.get(day.day_number) }))
    .filter(({ template, assigned }) => assigned && assigned.name !== template.name)
    .map(({ template, assigned }) => supabase
      .from("assigned_program_days")
      .update({ name: template.name } as any)
      .eq("id", assigned!.id));
  const dayUpdateResults = await Promise.all(dayUpdates);
  const failedDayUpdate = dayUpdateResults.find((result) => result.error);
  if (failedDayUpdate?.error) throw failedDayUpdate.error;

  const { data: tExercises, error: exercisesError } = await supabase
    .from("program_template_exercises")
    .select("day_id, exercise_id, position, sets, reps, weight_kg, rest_seconds")
    .in("day_id", templateDays.map((day) => day.id))
    .order("position", { ascending: true });
  if (exercisesError) throw exercisesError;

  const templateExercises = ((tExercises as TemplateExercise[] | null) ?? []);
  const assignedDayIds = Array.from(dayByNumber.values()).map((day) => day.id);
  if (templateExercises.length === 0 || assignedDayIds.length === 0) return;

  const { data: assignedExercisesData, error: assignedExercisesError } = await supabase
    .from("assigned_program_exercises")
    .select("id, day_id, exercise_id, position")
    .in("day_id", assignedDayIds);
  if (assignedExercisesError) throw assignedExercisesError;

  const existingExercises = ((assignedExercisesData as AssignedExercise[] | null) ?? []);
  const templateDayById = new Map(templateDays.map((day) => [day.id, day]));
  const inserts: Array<Omit<TemplateExercise, "day_id"> & { day_id: string }> = [];
  const updates = templateExercises.flatMap((exercise) => {
    const templateDay = templateDayById.get(exercise.day_id);
    const assignedDayId = templateDay ? dayByNumber.get(templateDay.day_number)?.id : null;
    if (!assignedDayId) return [];

    const patch = {
      exercise_id: exercise.exercise_id,
      position: exercise.position,
      sets: exercise.sets,
      reps: exercise.reps,
      weight_kg: exercise.weight_kg,
      rest_seconds: exercise.rest_seconds,
    };
    const existing = existingExercises.find((row) => (
      row.day_id === assignedDayId &&
      row.exercise_id === exercise.exercise_id &&
      row.position === exercise.position
    ));

    if (!existing) {
      inserts.push({ day_id: assignedDayId, ...patch });
      return [];
    }

    return [supabase.from("assigned_program_exercises").update(patch as any).eq("id", existing.id)];
  });

  if (inserts.length) {
    const { error: insertExercisesError } = await supabase.from("assigned_program_exercises").insert(inserts as any);
    if (insertExercisesError) throw insertExercisesError;
  }

  const updateResults = await Promise.all(updates);
  const failedExerciseUpdate = updateResults.find((result) => result.error);
  if (failedExerciseUpdate?.error) throw failedExerciseUpdate.error;
};

export const assignProgramToAthlete = async (templateId: string, athleteId: string) => {
  const { data: rpcData, error: rpcError } = await supabase.rpc("assign_program_to_athlete", {
    p_template_id: templateId,
    p_athlete_id: athleteId,
  });

  let assignedId = !rpcError && rpcData ? String(rpcData) : null;
  if (!assignedId) {
    if (rpcError) console.warn("RPC assign_program_to_athlete fail, koristim fallback:", rpcError.message);
    const { data: userData } = await supabase.auth.getUser();
    const trainerId = userData.user?.id;
    if (!trainerId) throw new Error("Niste prijavljeni");

    const { data: template, error: templateError } = await supabase
      .from("program_templates")
      .select("name")
      .eq("id", templateId)
      .maybeSingle();
    if (templateError) throw templateError;
    if (!template) throw new Error("Program template ne postoji");

    const { data: assigned, error: assignError } = await supabase
      .from("assigned_programs")
      .insert({ athlete_id: athleteId, trainer_id: trainerId, name: (template as any).name } as any)
      .select("id")
      .single();
    if (assignError) throw assignError;
    assignedId = (assigned as any).id;
  }

  await ensureAssignedProgramSnapshot(templateId, assignedId);
  return assignedId;
};