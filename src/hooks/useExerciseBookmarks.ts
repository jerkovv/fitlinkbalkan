import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export const useExerciseBookmarks = () => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["exercise-bookmarks", userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Set<string>> => {
      if (!userId) return new Set();
      const { data, error } = await supabase
        .from("exercise_bookmarks" as any)
        .select("exercise_id")
        .eq("user_id", userId);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.exercise_id as string));
    },
  });

  const bookmarks = data ?? new Set<string>();

  const mutation = useMutation({
    mutationFn: async (exerciseId: string) => {
      if (!userId) throw new Error("not auth");
      const isBookmarked = bookmarks.has(exerciseId);
      if (isBookmarked) {
        const { error } = await supabase
          .from("exercise_bookmarks" as any)
          .delete()
          .eq("user_id", userId)
          .eq("exercise_id", exerciseId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("exercise_bookmarks" as any)
          .insert({ user_id: userId, exercise_id: exerciseId });
        if (error) throw error;
      }
    },
    onMutate: async (exerciseId: string) => {
      await qc.cancelQueries({ queryKey: ["exercise-bookmarks", userId] });
      const prev = qc.getQueryData<Set<string>>(["exercise-bookmarks", userId]);
      const next = new Set(prev ?? []);
      if (next.has(exerciseId)) next.delete(exerciseId);
      else next.add(exerciseId);
      qc.setQueryData(["exercise-bookmarks", userId], next);
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["exercise-bookmarks", userId], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["exercise-bookmarks", userId] });
    },
  });

  return {
    bookmarks,
    isBookmarked: (id: string) => bookmarks.has(id),
    toggle: (id: string) => mutation.mutate(id),
    isLoading,
  };
};
