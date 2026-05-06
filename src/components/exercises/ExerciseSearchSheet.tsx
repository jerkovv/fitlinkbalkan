import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { useExercises } from "@/hooks/useExercises";
import { useExerciseBookmarks } from "@/hooks/useExerciseBookmarks";
import { ExerciseCard } from "./ExerciseCard";

const SUGGESTIONS = ["Bench Press", "Squat", "Deadlift", "Pull-Up"];

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
};

export const ExerciseSearchSheet = ({ open, onOpenChange, selected, onToggleSelect }: Props) => {
  const [input, setInput] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    if (!open) {
      setInput("");
      setDebounced("");
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const { data: results = [], isLoading } = useExercises({
    muscleGroup: null,
    showFavorites: false,
    equipment: [],
    categories: [],
    onlyMine: false,
    searchQuery: debounced,
  });

  const { isBookmarked, toggle } = useExerciseBookmarks();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[80dvh] w-full max-w-[440px] mx-auto rounded-t-3xl p-0 flex flex-col"
      >
        <SheetTitle className="sr-only">Pretraga vežbi</SheetTitle>
        <SheetDescription className="sr-only">
          Pretraži biblioteku vežbi po nazivu
        </SheetDescription>
        <div className="px-5 pt-4 pb-2">
          <h2 className="font-display text-lg font-bold tracking-tighter">Pretraga vežbi</h2>
        </div>
        <div className="mx-5 mb-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pretraži po nazivu..."
            className="pl-10 h-12"
            autoFocus
          />
        </div>

        {!debounced ? (
          <div className="flex-1 overflow-y-auto">
            <div className="eyebrow px-5 mb-2">Predlozi</div>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setInput(s)}
                className="block w-[calc(100%-40px)] mx-5 mb-2 p-3 rounded-xl bg-surface-2 hover:bg-surface-3 text-left text-sm font-medium"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-1">
            {isLoading && (
              <div className="text-center text-sm text-muted-foreground py-6">Tražim...</div>
            )}
            {!isLoading && results.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-6">Nema rezultata</div>
            )}
            {results.map((ex) => (
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                selected={selected.has(ex.id)}
                bookmarked={isBookmarked(ex.id)}
                onToggleSelect={onToggleSelect}
                onToggleBookmark={toggle}
                variant="row"
              />
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
