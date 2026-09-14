import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { PickerExercise } from "@/components/exercises/ExerciseCard";
import type { ExerciseFilters } from "@/hooks/useExercises";

const SELECT = "id, name, name_en, description, primary_muscle, thumbnail_url, video_url, is_duration_based";
const PAGE_SIZE = 50;

type ExercisePage = {
  items: PickerExercise[];
  /** Redova iz glavne (paginirane) liste; sacuvane sa vrha strane 0 se ne broje. */
  mainCount: number;
  /** Sacuvane vezbe koje prolaze filtere - stoje na vrhu i izbacene su iz glavne liste. */
  favIds: string[];
};

/** favIds null = strana 0 (tek treba procitati sacuvane). */
type PageParam = { offset: number; favIds: string[] | null };

export const useInfiniteExercises = (filters: ExerciseFilters) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useInfiniteQuery({
    queryKey: ["exercises-infinite", userId, filters],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    initialPageParam: { offset: 0, favIds: null } as PageParam,
    queryFn: async ({ pageParam }): Promise<ExercisePage> => {
      if (!userId) return { items: [], mainCount: 0, favIds: [] };
      const { offset } = pageParam;

      if (filters.showFavorites) {
        // Favorites: fetch all once (typically small), paginate client-side via single page
        const { data, error } = await supabase
          .from("exercise_bookmarks" as any)
          .select(`exercise:exercises(${SELECT})`)
          .eq("user_id", userId)
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        const rows = (data ?? []) as Array<{ exercise: PickerExercise | null }>;
        return {
          items: rows.map((r) => r.exercise).filter(Boolean) as PickerExercise[],
          mainCount: rows.length,
          favIds: [],
        };
      }

      // Isti filteri za sacuvane (vrh strane 0) i za glavnu listu, da se ne raziđu.
      const filtriraj = (q: any) => {
        if (filters.muscleGroup) q = q.eq("primary_muscle", filters.muscleGroup);
        if (filters.equipment.length) q = q.in("equipment", filters.equipment);
        if (filters.categories.length) q = q.in("category", filters.categories);
        if (filters.onlyMine) q = q.eq("created_by", userId);
        if (filters.searchQuery) {
          const s = filters.searchQuery.replace(/[%,]/g, "");
          q = q.or(`name.ilike.%${s}%,name_en.ilike.%${s}%,description.ilike.%${s}%`);
        }
        return q;
      };

      // Trenerove sacuvane vezbe idu PRVE u svakoj grupi. Citaju se jednom (strana 0),
      // a njihovi id-evi putuju kroz pageParam da ih glavna lista preskoci na svim
      // stranama - bez toga bi se sacuvana vezba pojavila dvaput.
      let favIds = pageParam.favIds;
      let favItems: PickerExercise[] = [];
      if (favIds === null) {
        const { data: bm, error: bmError } = await supabase
          .from("exercise_bookmarks" as any)
          .select("exercise_id")
          .eq("user_id", userId);
        if (bmError) throw bmError;
        const ids = (bm ?? []).map((r: any) => r.exercise_id as string);
        favIds = [];
        if (ids.length) {
          const { data, error } = await filtriraj(
            supabase
              .from("exercises")
              .select(SELECT)
              .or(`is_global.eq.true,created_by.eq.${userId}`)
              .in("id", ids)
              .order("popularity", { ascending: false, nullsFirst: false })
              .order("name", { ascending: true }),
          );
          if (error) throw error;
          favItems = (data ?? []) as PickerExercise[];
          favIds = favItems.map((e) => e.id);
        }
      }

      // Redosled: popularity PRIMARNI (staple vezbe na vrh), ime SEKUNDARNI. Sort je
      // server-side (pre .range) pa je tacan kroz sve stranice; filter po grupi (.eq nize)
      // i .range su takodje na serveru -> nema 1000-red cap-a (paginirano po grupi).
      // nullsFirst:false da vezbe bez popularnosti (NULL/nekoriscene) idu na DNO, abecedno.
      let q = filtriraj(
        supabase
          .from("exercises")
          .select(SELECT)
          .or(`is_global.eq.true,created_by.eq.${userId}`)
          .order("popularity", { ascending: false, nullsFirst: false })
          .order("name", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1),
      );
      if (favIds.length) q = q.not("id", "in", `(${favIds.join(",")})`);

      const { data, error } = await q;
      if (error) throw error;
      const main = (data ?? []) as PickerExercise[];
      return { items: [...favItems, ...main], mainCount: main.length, favIds };
    },
    getNextPageParam: (lastPage, allPages): PageParam | undefined => {
      if (!lastPage || lastPage.mainCount < PAGE_SIZE) return undefined;
      return {
        offset: allPages.reduce((n, p) => n + p.mainCount, 0),
        favIds: allPages[0].favIds,
      };
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
