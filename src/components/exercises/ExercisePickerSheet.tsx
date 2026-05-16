import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Dumbbell, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MUSCLE_GROUPS, MUSCLE_LABELS, type MuscleGroupId } from "@/lib/muscleGroups";
import { MuscleGroupStrip } from "./MuscleGroupStrip";
import { ExerciseCard } from "./ExerciseCard";
import { SelectionActionBar } from "./SelectionActionBar";
import { ExerciseSearchSheet } from "./ExerciseSearchSheet";
import { ExerciseFilterSheet, type FilterState } from "./ExerciseFilterSheet";
import { useInfiniteExercises, useExercisesCount } from "@/hooks/useInfiniteExercises";
import { useExerciseBookmarks } from "@/hooks/useExerciseBookmarks";
import { useAddExercisesToDay } from "@/hooks/useAddExercisesToDay";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  dayId: string | null;
  dayName: string;
  onClose: () => void;
  onAdded: () => void;
};

export const ExercisePickerSheet = ({ open, dayId, dayName, onClose, onAdded }: Props) => {
  const [muscle, setMuscle] = useState<MuscleGroupId>("grudi");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    equipment: [],
    categories: [],
    onlyMine: false,
  });

  const showFavorites = muscle === "favorites";
  const queryFilters = {
    muscleGroup: showFavorites ? null : muscle,
    showFavorites,
    equipment: filters.equipment,
    categories: filters.categories,
    onlyMine: filters.onlyMine,
    searchQuery: "",
  };
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteExercises(queryFilters);
  const { data: totalCount } = useExercisesCount(queryFilters);
  const exercises = useMemo(() => data?.pages.flat() ?? [], [data]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, exercises.length]);

  const { isBookmarked, toggle: toggleBookmark } = useExerciseBookmarks();

  const { mutate: addExercises, isPending } = useAddExercisesToDay({
    dayId: dayId ?? "",
    onSuccess: () => {
      setSelected(new Set());
      onAdded();
    },
  });

  const filtersActive =
    filters.equipment.length > 0 || filters.categories.length > 0 || filters.onlyMine;

  const sectionTitle = useMemo(() => {
    if (showFavorites) return "Omiljene vežbe";
    return `Sve vežbe za ${MUSCLE_GROUPS.find((g) => g.id === muscle)?.label ?? ""}`;
  }, [showFavorites, muscle]);

  const handleToggleSelect = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    addExercises([...selected]);
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      setSelected(new Set());
      onClose();
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        side="bottom"
        className="h-[100dvh] w-full max-w-[440px] mx-auto rounded-t-3xl p-0 flex flex-col [&>button]:hidden"
      >
        <SheetTitle className="sr-only">Dodaj vežbe</SheetTitle>
        <SheetDescription className="sr-only">
          Izaberi vežbe iz biblioteke i dodaj ih u trening dan
        </SheetDescription>
        {/* Header */}
        <div className="h-14 shrink-0 bg-background border-b border-hairline px-4 flex items-center gap-2">
          <button
            onClick={() => handleClose(false)}
            className="h-9 w-9 rounded-full hover:bg-surface-2 flex items-center justify-center"
            aria-label="Zatvori"
          >
            <X size={20} />
          </button>
          <h2 className="flex-1 text-center font-display text-base font-bold tracking-tighter">
            Dodaj vežbe
          </h2>
          <button
            onClick={() => setSearchOpen(true)}
            className="h-9 w-9 rounded-full hover:bg-surface-2 flex items-center justify-center"
            aria-label="Pretraga"
          >
            <Search size={18} />
          </button>
          <button
            onClick={() => setFilterOpen(true)}
            className="h-9 w-9 rounded-full hover:bg-surface-2 flex items-center justify-center relative"
            aria-label="Filteri"
          >
            <SlidersHorizontal size={18} />
            {filtersActive && (
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </button>
        </div>

        {/* Muscle strip */}
        <MuscleGroupStrip active={muscle} onChange={setMuscle} />

        {/* Scroll area */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Section title */}
          <div className="px-5 py-3 flex items-center justify-between">
            <h3 className="font-display text-base font-bold tracking-tighter truncate">
              {sectionTitle}
            </h3>
            {!isLoading && !isError && (
              <span className="text-xs text-muted-foreground tnum shrink-0 ml-3">
                {totalCount ?? exercises.length} vežbi
              </span>
            )}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-2 gap-3 px-4 pb-32">
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl overflow-hidden">
                  <div className="aspect-square bg-surface-2 animate-pulse" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-surface-2 animate-pulse rounded" />
                    <div className="h-2 w-2/3 bg-surface-2 animate-pulse rounded" />
                  </div>
                </div>
              ))}

            {!isLoading && isError && (
              <div className="col-span-2 flex flex-col items-center justify-center py-16 text-center">
                <div className="bg-gradient-brand-soft rounded-2xl p-3">
                  <AlertCircle size={32} className="text-primary" />
                </div>
                <h4 className="font-display text-base font-bold tracking-tighter mt-3">
                  Greška pri učitavanju
                </h4>
                <Button variant="ghost" className="mt-3" onClick={() => refetch()}>
                  Pokušaj ponovo
                </Button>
              </div>
            )}

            {!isLoading && !isError && exercises.length === 0 && (
              <div className="col-span-2 flex flex-col items-center justify-center py-16 text-center">
                <div className="bg-gradient-brand-soft rounded-2xl p-3">
                  <Dumbbell size={32} className="text-primary" />
                </div>
                <h4 className="font-display text-base font-bold tracking-tighter mt-3">
                  Nema vežbi
                </h4>
                <p className="text-sm text-muted-foreground mt-1 px-8">
                  Izaberi drugu mišićnu grupu ili promeni filtere
                </p>
              </div>
            )}

            {!isLoading &&
              !isError &&
              exercises.map((ex, i) => (
                <ExerciseCard
                  key={ex.id}
                  exercise={ex}
                  selected={selected.has(ex.id)}
                  bookmarked={isBookmarked(ex.id)}
                  onToggleSelect={handleToggleSelect}
                  onToggleBookmark={toggleBookmark}
                  index={i}
                />
              ))}

            {isFetchingNextPage &&
              Array.from({ length: 2 }).map((_, i) => (
                <div key={`sk-${i}`} className="rounded-xl overflow-hidden">
                  <div className="aspect-[3/2] bg-surface-2 animate-pulse" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-surface-2 animate-pulse rounded" />
                    <div className="h-2 w-2/3 bg-surface-2 animate-pulse rounded" />
                  </div>
                </div>
              ))}
          </div>

          {hasNextPage && !isError && (
            <div ref={sentinelRef} className="h-10 flex items-center justify-center">
              {isFetchingNextPage && (
                <Loader2 size={18} className="animate-spin text-muted-foreground" />
              )}
            </div>
          )}
        </div>

        <SelectionActionBar
          count={selected.size}
          dayName={dayName}
          loading={isPending}
          onConfirm={handleConfirm}
        />

        <ExerciseSearchSheet
          open={searchOpen}
          onOpenChange={setSearchOpen}
          selected={selected}
          onToggleSelect={handleToggleSelect}
        />
        <ExerciseFilterSheet
          open={filterOpen}
          onOpenChange={setFilterOpen}
          value={filters}
          onApply={setFilters}
        />
      </SheetContent>
    </Sheet>
  );
};
