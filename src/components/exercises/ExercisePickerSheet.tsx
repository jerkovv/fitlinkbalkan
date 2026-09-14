import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertCircle, Dumbbell, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { Sheet, SheetContent, SheetPortal, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MUSCLE_GROUPS, type MuscleGroupId } from "@/lib/muscleGroups";
import { MuscleGroupStrip } from "./MuscleGroupStrip";
import { MuscleGroupRail } from "./MuscleGroupRail";
import { ExerciseCard, type PickerExercise } from "./ExerciseCard";
import { ExercisePreview } from "./ExercisePreview";
import { SelectionActionBar } from "./SelectionActionBar";
import { ExerciseSearchSheet } from "./ExerciseSearchSheet";
import { ExerciseFilterSheet, type FilterState } from "./ExerciseFilterSheet";
import { useInfiniteExercises, useExercisesCount } from "@/hooks/useInfiniteExercises";
import { useExerciseBookmarks } from "@/hooks/useExerciseBookmarks";
import { useAddExercisesToDay } from "@/hooks/useAddExercisesToDay";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  dayId: string | null;
  dayName: string;
  /** Ciljna tabela za dodavanje: sablon (default) ili dodeljeni plan. */
  table?: "program_template_exercises" | "assigned_program_exercises";
  onClose: () => void;
  onAdded: () => void;
  /**
   * Rezim ZAMENE: umesto dodavanja u dan, sheet samo vrati izabranu vezbu.
   * Kad je prosledjen, izbor je jednostruk (zamena je 1:1) i onAdded se ne zove.
   * Koristi ga trener kad usred treninga menja vezbu (zauzeta sprava).
   */
  onPick?: (exerciseId: string) => void;
  /**
   * Kao onPick, ali visestruko: sheet vrati SVE izabrane vezbe umesto da ih sam
   * upise u dan. Koristi se kad upis mora da ide kroz RPC (dodavanje vezbi usred
   * treninga ide preko trainer_add_exercises, koji uz upis i obavesti vezbacev
   * telefon - direktan insert bi vezbi dodao, a on ih ne bi video).
   */
  onPickMany?: (exerciseIds: string[]) => void;
  /** Prosledi dalje: podnaslov bez prefiksa "Dan:" (vidi SelectionActionBar). */
  bareDayName?: boolean;
};

export const ExercisePickerSheet = ({ open, dayId, dayName, table, onClose, onAdded, onPick, onPickMany, bareDayName }: Props) => {
  // Desktop (fitlink.rs/dashboard) dobija pravi prozor na sredini ekrana. Telefonski
  // full-screen sheet od 440px je na monitoru visio kao kolona preko stranice bez
  // zatamnjenja, a pretraga je otvarala ceo ekran preko svega.
  const desktop = useDesktopWeb();
  const [muscle, setMuscle] = useState<MuscleGroupId>("grudi");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Vezba otvorena u pregledu (snimak); null = pregled zatvoren.
  const [pregled, setPregled] = useState<PickerExercise | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    equipment: [],
    categories: [],
    onlyMine: false,
  });

  // Desktop pretraga je polje u zaglavlju i filtrira OVU mrezu, kroz sve grupe.
  // Na telefonu pretraga ostaje zaseban ekran (ExerciseSearchSheet).
  const [pretraga, setPretraga] = useState("");
  const [trazim, setTrazim] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTrazim(pretraga.trim()), 300);
    return () => clearTimeout(t);
  }, [pretraga]);
  const searching = desktop && trazim !== "";
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const showFavorites = muscle === "favorites" && !searching;
  const queryFilters = {
    muscleGroup: searching || muscle === "favorites" ? null : muscle,
    showFavorites,
    equipment: filters.equipment,
    categories: filters.categories,
    onlyMine: filters.onlyMine,
    searchQuery: searching ? trazim : "",
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
  const exercises = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  // Sheet ostaje montiran i kad je zatvoren, pa se lista ne povlaci sama pri
  // otvaranju. Ako je bookmark u medjuvremenu oznacio listu zastarelom, osvezi je
  // tad - da nove sacuvane vezbe budu na vrhu (dok je otvoren, lista miruje).
  const qc = useQueryClient();
  useEffect(() => {
    if (open) void qc.refetchQueries({ queryKey: ["exercises-infinite"], type: "active", stale: true });
  }, [open, qc]);

  // Load-more preko onScroll na STVARNOM scroll kontejneru. Pouzdanije u WKWebView od
  // IntersectionObserver-a sa root:null: lista skroluje UNUTAR div-a (ne viewport), pa je
  // observer okidao pogresno / prestajao unutar grupe. Guard: samo kad ima jos i nije u toku
  // (React Query dedupe-uje fetchNextPage, a isFetchingNextPage se sam vrati na false).
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
      fetchNextPage();
    }
  };

  const { isBookmarked, toggle: toggleBookmark } = useExerciseBookmarks();

  const { mutate: addExercises, isPending } = useAddExercisesToDay({
    dayId: dayId ?? "",
    table,
    onSuccess: () => {
      setSelected(new Set());
      onAdded();
    },
  });

  const filtersActive =
    filters.equipment.length > 0 || filters.categories.length > 0 || filters.onlyMine;

  const sectionTitle = useMemo(() => {
    if (searching) return `Rezultati za "${trazim}"`;
    if (showFavorites) return "Omiljene vežbe";
    return `Sve vežbe za ${MUSCLE_GROUPS.find((g) => g.id === muscle)?.label ?? ""}`;
  }, [searching, trazim, showFavorites, muscle]);

  const handleToggleSelect = (id: string) => {
    // Zamena je 1:1 - drugi tap menja izbor umesto da ga doda.
    if (onPick) {
      setSelected((s) => (s.has(id) ? new Set() : new Set([id])));
      return;
    }
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    if (onPickMany) {
      const ids = [...selected];
      setSelected(new Set());
      onPickMany(ids);
      return;
    }
    if (onPick) {
      const [id] = [...selected];
      setSelected(new Set());
      onPick(id);
      return;
    }
    addExercises([...selected]);
  };

  const ocistiPretragu = () => {
    setPretraga("");
    setTrazim("");
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      setSelected(new Set());
      setPregled(null);
      ocistiPretragu();
      onClose();
    }
  };

  // Klik na grupu tokom pretrage = vrati se na tu grupu (pretraga se brise).
  const izaberiGrupu = (id: MuscleGroupId) => {
    setMuscle(id);
    ocistiPretragu();
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const naslov = onPick ? "Zameni vežbu" : "Dodaj vežbe";
  const opis = onPick
    ? "Izaberi vežbu kojom menjaš postojeću"
    : "Izaberi vežbe iz biblioteke i dodaj ih u trening dan";

  // Sadrzaj liste je isti na oba rasporeda; razlikuju se samo okvir i broj kolona.
  const lista = (
    <>
      <div className={cn("py-3 flex items-center justify-between", desktop ? "px-6 pt-5" : "px-5")}>
        <h3 className="font-display text-base font-bold tracking-tighter truncate">
          {sectionTitle}
        </h3>
        {!isLoading && !isError && (
          <span className="text-xs text-muted-foreground tnum shrink-0 ml-3">
            {totalCount ?? exercises.length} vežbi
          </span>
        )}
      </div>

      <div
        className={cn(
          "grid items-stretch",
          desktop ? "grid-cols-3 xl:grid-cols-4 gap-4 px-6 pb-6" : "grid-cols-2 gap-3 px-4 pb-6",
        )}
      >
        {isLoading &&
          Array.from({ length: desktop ? 8 : 6 }).map((_, i) => (
            <div key={i} className="rounded-xl overflow-hidden">
              <div className="aspect-square bg-surface-2 animate-pulse" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-surface-2 animate-pulse rounded" />
                <div className="h-2 w-2/3 bg-surface-2 animate-pulse rounded" />
              </div>
            </div>
          ))}

        {!isLoading && isError && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
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
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-gradient-brand-soft rounded-2xl p-3">
              <Dumbbell size={32} className="text-primary" />
            </div>
            <h4 className="font-display text-base font-bold tracking-tighter mt-3">
              Nema vežbi
            </h4>
            <p className="text-sm text-muted-foreground mt-1 px-8">
              {searching ? "Probaj drugi naziv ili promeni filtere" : "Izaberi drugu mišićnu grupu ili promeni filtere"}
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
              showMuscle={showFavorites || searching}
              onPreview={setPregled}
            />
          ))}

        {isFetchingNextPage &&
          Array.from({ length: desktop ? 4 : 2 }).map((_, i) => (
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
        <div className="h-10 flex items-center justify-center">
          {isFetchingNextPage && (
            <Loader2 size={18} className="animate-spin text-muted-foreground" />
          )}
        </div>
      )}
    </>
  );

  const actionBar = (
    <SelectionActionBar
      count={selected.size}
      dayName={dayName}
      loading={isPending}
      onConfirm={handleConfirm}
      replaceMode={!!onPick}
      bareDayName={bareDayName}
    />
  );

  const filterSheet = (
    <ExerciseFilterSheet
      open={filterOpen}
      onOpenChange={setFilterOpen}
      value={filters}
      onApply={setFilters}
    />
  );

  // U React stablu birača (ne pored njega): Radix onda klik u pregledu ne racuna
  // kao klik "van" birača, pa se birac ne zatvori ispod pregleda.
  const pregledEl = (
    <ExercisePreview
      exercise={pregled}
      onClose={() => setPregled(null)}
      selected={pregled ? selected.has(pregled.id) : false}
      bookmarked={pregled ? isBookmarked(pregled.id) : false}
      onToggleSelect={handleToggleSelect}
      onToggleBookmark={toggleBookmark}
      replaceMode={!!onPick}
    />
  );

  if (desktop) {
    return (
      <Sheet open={open} onOpenChange={handleClose} modal={false}>
        <SheetPortal>
          {/* Non-modal Radix ne crta overlay, pa je pozadina rucna. Klik na nju je
              "van" prozora i Radix sam zatvara (onOpenChange(false)). */}
          <div aria-hidden className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] animate-in fade-in-0 duration-200" />
          <DialogPrimitive.Content
            // Fokus odmah u pretragu: na racunaru se naziv vezbe najbrze otkuca.
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              searchInputRef.current?.focus();
            }}
            className="fixed inset-0 z-50 m-auto flex h-[min(880px,calc(100dvh-48px))] w-[min(1120px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-hairline bg-background shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200 focus:outline-none"
          >
            <SheetTitle className="sr-only">{naslov}</SheetTitle>
            <SheetDescription className="sr-only">{opis}</SheetDescription>

            {/* Zaglavlje: naslov u sirini kolone grupa, pa pretraga, filteri i zatvaranje */}
            <div className="shrink-0 h-[68px] flex items-center gap-4 border-b border-hairline pr-4">
              <h2 className="w-56 shrink-0 pl-6 font-display text-lg font-bold tracking-tighter truncate">
                {naslov}
              </h2>
              <div className="relative flex-1 max-w-md">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  ref={searchInputRef}
                  value={pretraga}
                  onChange={(e) => setPretraga(e.target.value)}
                  placeholder="Pretraži sve vežbe..."
                  aria-label="Pretraži vežbe"
                  className="h-10 w-full rounded-full bg-surface-2 pl-10 pr-9 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40"
                />
                {pretraga && (
                  <button
                    type="button"
                    onClick={() => {
                      ocistiPretragu();
                      searchInputRef.current?.focus();
                    }}
                    aria-label="Obriši pretragu"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full hover:bg-surface-3 flex items-center justify-center text-muted-foreground"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFilterOpen(true)}
                  className="relative h-10 rounded-full px-3.5 hover:bg-surface-2 flex items-center gap-2 text-sm font-semibold"
                >
                  <SlidersHorizontal size={16} />
                  Filteri
                  {filtersActive && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleClose(false)}
                  aria-label="Zatvori"
                  className="h-10 w-10 rounded-full hover:bg-surface-2 flex items-center justify-center"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex flex-1 min-h-0">
              <aside className="w-56 shrink-0 overflow-y-auto border-r border-hairline">
                <MuscleGroupRail active={searching ? null : muscle} onChange={izaberiGrupu} />
              </aside>
              <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-w-0 overflow-y-auto">
                {lista}
              </div>
            </div>

            {actionBar}
            {filterSheet}
            {pregledEl}
          </DialogPrimitive.Content>
        </SheetPortal>
      </Sheet>
    );
  }

  return (
    // modal={false}: ovaj Sheet je full-screen (h-100dvh) pa nema "spolja" za
    // klik; bez modal-a Radix ne postavlja body pointer-events:none niti hvata
    // fokus, sto je dozvoljavalo da ugnezdeni full-screen ExerciseSearchSheet
    // (portal na body) ostane mrtav na tap i ne otvori tastaturu.
    <Sheet open={open} onOpenChange={handleClose} modal={false}>
      <SheetContent
        side="bottom"
        className="h-[100dvh] w-full max-w-[440px] mx-auto rounded-t-3xl p-0 flex flex-col [&>button]:hidden"
      >
        <SheetTitle className="sr-only">{naslov}</SheetTitle>
        <SheetDescription className="sr-only">{opis}</SheetDescription>
        {/* Header */}
        <div
          className="shrink-0 bg-background border-b border-hairline px-4 pb-2 flex items-center gap-2"
          style={{ paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 12px)" }}
        >
          <button
            onClick={() => handleClose(false)}
            className="h-9 w-9 rounded-full hover:bg-surface-2 flex items-center justify-center"
            aria-label="Zatvori"
          >
            <X size={20} />
          </button>
          <h2 className="flex-1 text-center font-display text-base font-bold tracking-tighter">
            {naslov}
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

        {/* Scroll area (stvarni scroll container - load-more se racuna odavde) */}
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto">
          {lista}
        </div>

        {actionBar}

        <ExerciseSearchSheet
          open={searchOpen}
          onOpenChange={setSearchOpen}
          selected={selected}
          onToggleSelect={handleToggleSelect}
        />
        {filterSheet}
        {pregledEl}
      </SheetContent>
    </Sheet>
  );
};
