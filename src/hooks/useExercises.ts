import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { PickerExercise } from "@/components/exercises/ExerciseCard";

export type ExerciseFilters = {
  muscleGroup: string | null;
  showFavorites: boolean;
  equipment: string[];
  categories: string[];
  onlyMine: boolean;
  searchQuery: string;
};

const SELECT = "id, name, name_en, description, primary_muscle, thumbnail_url, video_url";

export const useExercises = (filters: ExerciseFilters) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ["exercises", userId, filters],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PickerExercise[]> => {
      if (!userId) return [];

      if (filters.showFavorites) {
        const { data, error } = await supabase
          .from("exercise_bookmarks" as any)
          .select(`exercise:exercises(${SELECT})`)
          .eq("user_id", userId);
        if (error) throw error;
        const rows = (data ?? []) as Array<{ exercise: PickerExercise | null }>;
        return rows.map((r) => r.exercise).filter(Boolean) as PickerExercise[];
      }

      let q = supabase
        .from("exercises")
        .select(SELECT)
        .or(`is_global.eq.true,created_by.eq.${userId}`)
        .order("name", { ascending: true })
        .limit(200);

      if (filters.muscleGroup) q = q.eq("primary_muscle", filters.muscleGroup as any);
      if (filters.equipment.length) q = q.in("equipment", filters.equipment as any);
      if (filters.categories.length) q = q.in("category", filters.categories);
      if (filters.onlyMine) q = q.eq("created_by", userId);
      if (filters.searchQuery) {
        const s = filters.searchQuery.replace(/[%,]/g, "");
        q = q.or(`name.ilike.%${s}%,name_en.ilike.%${s}%,description.ilike.%${s}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any as PickerExercise[];
    },
  });
};
