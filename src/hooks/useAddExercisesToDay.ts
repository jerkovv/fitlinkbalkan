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

      const { error } = await supabase
        .from(table)
        .insert(rows as any);
      if (error) throw error;
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
