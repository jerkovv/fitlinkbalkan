import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MUSCLE_GROUPS, type MuscleGroupId } from "@/lib/muscleGroups";
import { MuscleGroupIcon } from "./MuscleGroupIcon";
import { muscleIcon } from "@/lib/muscleIcons";
import { cn } from "@/lib/utils";

type Props = {
  active: MuscleGroupId;
  onChange: (id: MuscleGroupId) => void;
};

export const MuscleGroupStrip = ({ active, onChange }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const syncEdges = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    syncEdges();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(syncEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncEdges]);

  // Tocak misa skroluje po vertikali, a traka ide horizontalno - bez ovoga se na
  // desktopu grupe iza "Bicepsa" ne mogu dohvatiti (nema ni scrollbar-a: no-scrollbar).
  // Listener mora biti non-passive da bi preventDefault zaustavio skrol stranice.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      e.preventDefault();
      el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Aktivni cip uvek u vidnom polju (npr. kad se grupa promeni programski).
  // Racuna se rucno umesto scrollIntoView da se ne pomeri i lista ispod trake.
  // Preskace prvi prolaz: sheet se tad jos otvara (clientWidth 0), pa bi racun
  // odskrolovao traku sa prve grupe.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const el = ref.current;
    const chip = el?.querySelector<HTMLElement>(`[data-mg="${active}"]`);
    if (!el || !chip || el.clientWidth === 0) return;
    const left = chip.offsetLeft;
    const right = left + chip.offsetWidth;
    if (left < el.scrollLeft + 12) el.scrollTo({ left: left - 12, behavior: "smooth" });
    else if (right > el.scrollLeft + el.clientWidth - 12)
      el.scrollTo({ left: right - el.clientWidth + 12, behavior: "smooth" });
  }, [active]);

  const nudge = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.7), behavior: "smooth" });
  };

  return (
    <div className="relative shrink-0 border-b border-hairline">
      <div
        ref={ref}
        onScroll={syncEdges}
        className="overflow-x-auto no-scrollbar flex gap-1 px-3 py-3 scroll-smooth"
      >
        {MUSCLE_GROUPS.map((g) => {
          const isActive = active === g.id;
          // Nas chip za misicne/kardio tabove; null (npr "favorites") -> stara figura (bookmark).
          const icon = muscleIcon(g.id);
          return (
            <button
              key={g.id}
              data-mg={g.id}
              onClick={() => onChange(g.id)}
              className={cn(
                "w-[76px] flex flex-col items-center gap-2 p-2 rounded-2xl shrink-0 transition-colors",
                isActive ? "bg-primary-soft" : "hover:bg-surface-2"
              )}
            >
              <div className="h-14 w-14 flex items-center justify-center">
                {icon ? (
                  <img src={icon} alt="" className="h-12 w-12 rounded-full" />
                ) : (
                  <MuscleGroupIcon muscle={g.id} active={isActive} />
                )}
              </div>
              <span
                className={cn(
                  "text-[11px] leading-tight text-center",
                  isActive
                    ? "text-primary-soft-foreground font-bold"
                    : "text-muted-foreground font-semibold"
                )}
              >
                {g.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Ivicne senke = jedini nagovestaj da traka ima jos grupa (scrollbar je skriven). */}
      {edges.left && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent" />
      )}
      {edges.right && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
      )}

      {/* Strelice samo tamo gde postoji pokazivac (na dodir se traka prevlaci prstom). */}
      {edges.left && (
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label="Prethodne grupe"
          className="hidden [@media(hover:hover)]:flex absolute left-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background shadow-sm ring-1 ring-hairline items-center justify-center hover:bg-surface-2"
        >
          <ChevronLeft size={16} />
        </button>
      )}
      {edges.right && (
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label="Sledeće grupe"
          className="hidden [@media(hover:hover)]:flex absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background shadow-sm ring-1 ring-hairline items-center justify-center hover:bg-surface-2"
        >
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
};
