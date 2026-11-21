import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Activity,
  CalendarDays,
  ClipboardList,
  Clock,
  Eye,
  EyeOff,
  GripVertical,
  Heart,
  Library,
  Share2,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  OPIS_DELA,
  jeIzmenjen,
  postaviRedosled,
  prikazi,
  sakrij,
  skriveni,
  vidljivi,
  vrati,
  type DeoPocetne,
  type Raspored,
} from "./raspored";

const IKONE: Record<DeoPocetne, LucideIcon> = {
  uplate: Wallet,
  uzivo: Activity,
  danas: CalendarDays,
  programi: ClipboardList,
  ishranaPaketi: Utensils,
  termini: Clock,
  objave: Share2,
  biblioteka: Library,
  ambasadori: Heart,
};

const samoUspravno: Modifier = ({ transform }) => ({ ...transform, x: 0 });

const naziv = (id: unknown) => OPIS_DELA[id as DeoPocetne]?.naziv ?? "Deo";

const NAJAVE = {
  onDragStart: ({ active }: { active: { id: unknown } }) => `Pomeraš: ${naziv(active.id)}.`,
  onDragOver: ({ active, over }: { active: { id: unknown }; over: { id: unknown } | null }) =>
    over ? `${naziv(active.id)} je iznad mesta: ${naziv(over.id)}.` : undefined,
  onDragEnd: ({ active }: { active: { id: unknown } }) => `${naziv(active.id)} je spušten.`,
  onDragCancel: ({ active }: { active: { id: unknown } }) => `Pomeranje je otkazano: ${naziv(active.id)}.`,
};

const UPUTSTVO_ZA_CITAC = {
  draggable: "Razmaknica podiže deo, strelice ga pomeraju, razmaknica ga spušta, Escape otkazuje.",
};

function Red({
  d,
  sakriven,
  naOko,
}: {
  d: DeoPocetne;
  sakriven: boolean;
  naOko: (d: DeoPocetne) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: d, disabled: sakriven });
  const Ikona = IKONE[d];
  const opis = OPIS_DELA[d];

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative flex min-h-[76px] items-center gap-3 rounded-[18px] border bg-surface py-2 pl-3",
        sakriven ? "pr-3" : "pr-1",
        isDragging
          ? "z-10 scale-[1.02] border-primary-soft-foreground/60 bg-surface-2 shadow-[0_18px_36px_-14px_hsl(267_81%_58%/0.6)]"
          : "border-hairline",
      )}
    >
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
          sakriven ? "bg-surface-2 text-muted-foreground" : "bg-gradient-brand text-white",
        )}
      >
        <Ikona className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[14.5px] font-semibold leading-tight", sakriven && "text-muted-foreground")}>
          {opis.naziv}
        </span>
        <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{opis.opis}</span>
      </span>
      <button
        type="button"
        data-oko={d}
        onClick={() => naOko(d)}
        aria-label={sakriven ? `Prikaži ${opis.naziv}` : `Sakrij ${opis.naziv}`}
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          sakriven ? "text-muted-foreground" : "text-primary-soft-foreground",
        )}
      >
        {sakriven ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
      {!sakriven && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label="Prevuci za redosled"
          className={cn(
            "grid h-[60px] w-10 shrink-0 touch-none place-items-center rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            isDragging ? "cursor-grabbing text-primary-soft-foreground" : "cursor-grab text-muted-foreground hover:text-foreground",
          )}
        >
          <GripVertical className="h-[18px] w-[18px]" />
        </button>
      )}
    </li>
  );
}

const Naslov = ({ children }: { children: string }) => (
  <h2 className="pl-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{children}</h2>
);

export function DugmeVrati({
  raspored,
  izmeni,
}: {
  raspored: Raspored;
  izmeni: (f: (r: Raspored) => Raspored) => void;
}) {
  const izmenjen = jeIzmenjen(raspored);
  return (
    <button
      type="button"
      disabled={!izmenjen}
      onClick={() => izmeni(vrati)}
      className={cn(
        "inline-flex h-9 items-center rounded-full border border-hairline bg-surface px-3.5 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        izmenjen ? "text-primary-soft-foreground hover:bg-surface-2" : "cursor-not-allowed text-muted-foreground",
      )}
    >
      Vrati kako je bilo
    </button>
  );
}

export function UredjivanjePocetne({
  raspored,
  izmeni,
}: {
  raspored: Raspored;
  izmeni: (f: (r: Raspored) => Raspored) => void;
}) {
  const naPocetnoj = vidljivi(raspored);
  const sakriveni = skriveni(raspored);
  const senzori = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Red se posle dodira na oko seli u drugu grupu; fokus ide za njim.
  const omot = useRef<HTMLDivElement>(null);
  const [fokusNa, setFokusNa] = useState<DeoPocetne | null>(null);
  useEffect(() => {
    if (!fokusNa) return;
    omot.current?.querySelector<HTMLButtonElement>(`[data-oko="${fokusNa}"]`)?.focus();
    setFokusNa(null);
  }, [fokusNa, raspored]);

  const naOko = (d: DeoPocetne) => {
    izmeni((r) => (r.sakriveno.includes(d) ? prikazi(r, d) : sakrij(r, d)));
    setFokusNa(d);
  };

  const krajPrevlacenja = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const od = naPocetnoj.indexOf(active.id as DeoPocetne);
    const ka = naPocetnoj.indexOf(over.id as DeoPocetne);
    if (od < 0 || ka < 0) return;
    const novi = arrayMove(naPocetnoj, od, ka);
    izmeni((r) => postaviRedosled(r, novi));
  };

  return (
    <div ref={omot} className="max-w-[680px] space-y-4">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        Drži ručicu i prevuci za redosled. Oko sakriva deo. Gornji red sa porukama uvek ostaje. Isti raspored važi i na
        telefonu; na računaru veliki delovi stoje levo, a pločice u delu Tvoj studio.
      </p>

      <Naslov>Na početnoj</Naslov>
      <DndContext
        sensors={senzori}
        collisionDetection={closestCenter}
        modifiers={[samoUspravno]}
        onDragEnd={krajPrevlacenja}
        accessibility={{ announcements: NAJAVE, screenReaderInstructions: UPUTSTVO_ZA_CITAC }}
      >
        <SortableContext items={naPocetnoj} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {naPocetnoj.map((d) => (
              <Red key={d} d={d} sakriven={false} naOko={naOko} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {sakriveni.length > 0 && (
        <>
          <div className="pt-2">
            <Naslov>Sakriveno</Naslov>
          </div>
          <SortableContext items={sakriveni} strategy={verticalListSortingStrategy} disabled>
            <ul className="space-y-2">
              {sakriveni.map((d) => (
                <Red key={d} d={d} sakriven naOko={naOko} />
              ))}
            </ul>
          </SortableContext>
        </>
      )}
    </div>
  );
}
