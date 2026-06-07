import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import {
  FullScreenSheet,
  FullScreenSheetHeader,
  FullScreenSheetScroll,
} from "@/components/ui/full-screen-sheet";
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
    <FullScreenSheet open={open} onClose={() => onOpenChange(false)} title="Pretraga vežbi">
      <FullScreenSheetHeader>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pretraži po nazivu..."
            className="pl-12 h-14 text-base rounded-2xl"
            autoFocus
          />
        </div>
      </FullScreenSheetHeader>

      {!debounced ? (
        <FullScreenSheetScroll>
          <div className="eyebrow mb-2">Predlozi</div>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setInput(s)}
              className="block w-full mb-2 p-3 rounded-xl bg-surface-2 hover:bg-surface-3 text-left text-sm font-medium"
            >
              {s}
            </button>
          ))}
        </FullScreenSheetScroll>
      ) : (
        <FullScreenSheetScroll className="px-3 space-y-1">
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
        </FullScreenSheetScroll>
      )}
    </FullScreenSheet>
  );
};
