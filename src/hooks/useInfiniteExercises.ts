import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { PickerExercise } from "@/components/exercises/ExerciseCard";
import type { ExerciseFilters } from "@/hooks/useExercises";

const SELECT = "id, name, name_en, description, primary_muscle, thumbnail_url, video_url";
const PAGE_SIZE = 50;

export const useInfiniteExercises = (filters: ExerciseFilters) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useInfiniteQuery({
    queryKey: ["exercises-infinite", userId, filters],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }): Promise<PickerExercise[]> => {
      if (!userId) return [];

      if (filters.showFavorites) {
        // Favorites: fetch all once (typically small), paginate client-side via single page
        const { data, error } = await supabase
          .from("exercise_bookmarks" as any)
          .select(`exercise:exercises(${SELECT})`)
          .eq("user_id", userId)
          .range(pageParam, pageParam + PAGE_SIZE - 1);
        if (error) throw error;
        const rows = (data ?? []) as Array<{ exercise: PickerExercise | null }>;
        return rows.map((r) => r.exercise).filter(Boolean) as PickerExercise[];
      }

      let q = supabase
        .from("exercises")
        .select(SELECT)
        .or(`is_global.eq.true,created_by.eq.${userId}`)
        .order("name", { ascending: true })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

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
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length * PAGE_SIZE;
    },
  });
};

export const useExercisesCount = (filters: ExerciseFilters) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ["exercises-count", userId, filters],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;

      if (filters.showFavorites) {
        const { count, error } = await supabase
          .from("exercise_bookmarks" as any)
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId);
        if (error) throw error;
        return count ?? 0;
      }

      let q = supabase
        .from("exercises")
        .select("*", { count: "exact", head: true })
        .or(`is_global.eq.true,created_by.eq.${userId}`);

      if (filters.muscleGroup) q = q.eq("primary_muscle", filters.muscleGroup as any);
      if (filters.equipment.length) q = q.in("equipment", filters.equipment as any);
      if (filters.categories.length) q = q.in("category", filters.categories);
      if (filters.onlyMine) q = q.eq("created_by", userId);
      if (filters.searchQuery) {
        const s = filters.searchQuery.replace(/[%,]/g, "");
        q = q.or(`name.ilike.%${s}%,name_en.ilike.%${s}%,description.ilike.%${s}%`);
      }

      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });
};
