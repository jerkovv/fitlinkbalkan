import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

type Args = {
  dayId: string;
  /** Ciljna tabela: sablon (default) ili dodeljeni plan. */
  table?: "program_template_exercises" | "assigned_program_exercises";
  onSuccess?: () => void;
};

export const useAddExercisesToDay = ({ dayId, table = "program_template_exercises", onSuccess }: Args) => {
  return useMutation({
    mutationFn: async (exerciseIds: string[]) => {
      if (!dayId || exerciseIds.length === 0) return;

      const { data: maxRow, error: maxErr } = await supabase
        .from(table)
        .select("position")
        .eq("day_id", dayId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxErr) throw maxErr;
      const maxPos = (maxRow as any)?.position ?? 0;

      const rows = exerciseIds.map((exerciseId, i) => ({
        day_id: dayId,
        exercise_id: exerciseId,
        position: maxPos + i + 1,
        sets: 3,
        reps: "10",
        rest_seconds: 90,
      }));

      // Vrati nove id-eve (+ exercise_id) da odmah kreiramo pocetne per-set redove.
      const { data: inserted, error } = await supabase
        .from(table)
        .insert(rows as any)
        .select("id, exercise_id");
      if (error) throw error;

      // Pocetni per-set redovi (3 seta, isto kao parent default) za NE-kardio vezbe.
      // Kardio (is_duration_based) koristi minute, ne setove -> preskace.
      const setsTable = table === "assigned_program_exercises"
        ? "assigned_program_exercise_sets"
        : "program_template_exercise_sets";
      const setsFk = table === "assigned_program_exercises"
        ? "assigned_exercise_id"
        : "template_exercise_id";

      const insertedRows = (inserted as any[]) ?? [];
      if (insertedRows.length) {
        const { data: exMeta } = await supabase
          .from("exercises")
          .select("id, is_duration_based")
          .in("id", insertedRows.map((r) => r.exercise_id));
        const durationIds = new Set(
          ((exMeta as any[]) ?? []).filter((e) => e.is_duration_based).map((e) => e.id),
        );
        const setRows = insertedRows
          .filter((r) => !durationIds.has(r.exercise_id))
          .flatMap((r) =>
            [1, 2, 3].map((sn) => ({
              [setsFk]: r.id,
              set_number: sn,
              reps: "10",
              weight_kg: null,
              rest_seconds: 90,
            })),
          );
        if (setRows.length) {
          await supabase.from(setsTable as any).insert(setRows as any);
        }
      }

      return rows.length;
    },
    onSuccess: (n) => {
      if (n) toast.success(`Dodato ${n} ${n === 1 ? "vežba" : "vežbi"}`);
      onSuccess?.();
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Greška pri dodavanju");
    },
  });
};
