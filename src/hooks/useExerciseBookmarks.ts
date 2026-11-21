import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { porukaGreske } from "@/lib/errorMessage";
import { useAuth } from "@/hooks/useAuth";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";

type Promena = { exerciseId: string; bila: boolean };

export const useExerciseBookmarks = () => {
  const { locked, openLock } = usePretplataLock();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const qc = useQueryClient();
  const kljuc = ["exercise-bookmarks", userId];
  const kljucIzmene = ["exercise-bookmarks-izmena", userId];
  // Dva brza klika na istu vezbu bi poslala insert i delete koji mogu da stignu obrnuto.
  const uToku = useRef(new Set<string>());

  const { data, isLoading } = useQuery({
    queryKey: kljuc,
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
    mutationKey: kljucIzmene,
    mutationFn: async ({ exerciseId, bila }: Promena) => {
      if (!userId) throw new Error("not auth");
      if (bila) {
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
        // Vec omiljena (duplikat) je upravo zeljeno stanje, ne greska.
        if (error && error.code !== "23505") throw error;
      }
    },
    onMutate: async ({ exerciseId, bila }: Promena) => {
      await qc.cancelQueries({ queryKey: kljuc });
      qc.setQueryData<Set<string>>(kljuc, (tren) => {
        const novi = new Set(tren ?? []);
        if (bila) novi.delete(exerciseId);
        else novi.add(exerciseId);
        return novi;
      });
    },
    onError: (e, { exerciseId, bila }) => {
      // Vraca se samo ova vezba: ceo stari snimak bi pregazio drugu izmenu u toku.
      qc.setQueryData<Set<string>>(kljuc, (tren) => {
        const novi = new Set(tren ?? []);
        if (bila) novi.add(exerciseId);
        else novi.delete(exerciseId);
        return novi;
      });
      toast.error(porukaGreske(e));
    },
    onSettled: (_d, _e, { exerciseId }) => {
      uToku.current.delete(exerciseId);
      // Spisak se povlaci tek posle poslednje izmene, inace bi vratio staro stanje
      // preko optimisticke oznake druge vezbe koja je jos na putu.
      if (qc.isMutating({ mutationKey: kljucIzmene }) <= 1) {
        qc.invalidateQueries({ queryKey: kljuc });
      }
      // Sacuvane stoje na vrhu liste u pickeru. Lista se samo oznaci zastarelom, bez
      // povlacenja (refetchType none) - inace bi kartica pobegla ispod prsta cim trener
      // klikne bookmark. Novi redosled stize kad se picker sledeci put otvori.
      qc.invalidateQueries({ queryKey: ["exercises-infinite", userId], refetchType: "none" });
    },
  });

  const toggle = (id: string) => {
    // Pre optimisticke izmene: zakljucan nalog ne sme ni na tren da vidi promenu.
    if (locked) {
      openLock();
      return;
    }
    if (!userId) {
      toast.error("Niste prijavljeni");
      return;
    }
    if (uToku.current.has(id)) return;
    uToku.current.add(id);
    const tren = qc.getQueryData<Set<string>>(kljuc) ?? bookmarks;
    mutation.mutate({ exerciseId: id, bila: tren.has(id) });
  };

  return {
    bookmarks,
    isBookmarked: (id: string) => bookmarks.has(id),
    toggle,
    isLoading,
  };
};
