import { useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, CheckCircle2, Dumbbell, GripVertical, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { blokovi, type VezbaURedu } from "./redosled";

export type VezbaZaRedosled = VezbaURedu & { naziv: string; slika: string | null };

type Napredak = (v: VezbaZaRedosled) => { uradjeno: number; ukupno: number };

const Red = ({
  vezbe,
  broj,
  sad,
  zavrsena,
  napredak,
}: {
  vezbe: VezbaZaRedosled[];
  broj: number;
  sad: boolean;
  zavrsena: boolean;
  napredak: Napredak;
}) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: vezbe[0].id });
  const superset = vezbe.some((v) => v.superset_group != null);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 rounded-[18px] border p-3",
        sad ? "border-primary-soft-foreground/55 bg-primary/15" : superset ? "border-sky-400/35 bg-surface" : "border-hairline bg-surface",
        isDragging && "relative z-10 shadow-lg",
      )}
    >
      <span
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold tnum",
          zavrsena ? "bg-success-soft text-success" : "bg-surface-2 text-muted-foreground",
        )}
      >
        {broj}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        {vezbe.map((v) => {
          const n = napredak(v);
          return (
            <div key={v.id} className="flex items-center gap-2.5">
              {v.slika ? (
                <img src={v.slika} alt="" loading="lazy" className="h-[38px] w-[38px] shrink-0 rounded-[11px] bg-surface-2 object-cover" />
              ) : (
                <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] bg-surface-2">
                  <Dumbbell className="h-4 w-4 text-muted-foreground/60" />
                </span>
              )}
              <span className="min-w-0">
                <span className={cn("block text-[13.5px] font-semibold leading-snug", zavrsena && "text-muted-foreground")}>
                  {v.naziv}
                </span>
                <span className="block text-[11px] text-muted-foreground tnum">
                  {Math.min(n.uradjeno, n.ukupno)}/{n.ukupno} serija
                </span>
              </span>
            </div>
          );
        })}
        {superset && (
          <span className="inline-flex rounded-full bg-sky-400/15 px-2 py-0.5 text-[10.5px] font-semibold text-sky-300">
            Superset
          </span>
        )}
      </div>
      {zavrsena ? (
        <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-success" strokeWidth={2.4} />
      ) : sad ? (
        <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary-soft-foreground">
          Sad
        </span>
      ) : null}
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Prevuci: ${vezbe.map((v) => v.naziv).join(", ")}`}
        className="grid h-9 w-7 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
    </div>
  );
};

/** Ceo redosled uzivo: trener prevlaci vezbe, superset se pomera kao jedan red. */
export const RedosledUzivo = ({
  vezbe,
  napredak,
  onSacuvaj,
  onClose,
}: {
  vezbe: VezbaZaRedosled[];
  napredak: Napredak;
  /** Vraca true kad je server prihvatio novi redosled. */
  onSacuvaj: (ids: string[]) => Promise<boolean>;
  onClose: () => void;
}) => {
  const [redovi, setRedovi] = useState(() => blokovi(vezbe));
  const [cuva, setCuva] = useState(false);
  const senzori = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const gotov = (r: VezbaZaRedosled[]) =>
    r.every((v) => {
      const n = napredak(v);
      return n.ukupno > 0 && n.uradjeno >= n.ukupno;
    });
  // Posle cuvanja vezbac radi prvu nezavrsenu; vidi se odmah dok trener prevlaci.
  const prvaNezavrsena = redovi.find((r) => !gotov(r))?.[0].id;
  const ids = useMemo(() => redovi.flat().map((v) => v.id), [redovi]);
  const promenjen = ids.some((id, i) => id !== vezbe[i]?.id);

  const naKraj = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setRedovi((r) => {
      const od = r.findIndex((b) => b[0].id === active.id);
      const ka = r.findIndex((b) => b[0].id === over.id);
      return od < 0 || ka < 0 ? r : arrayMove(r, od, ka);
    });
  };

  const sacuvaj = async () => {
    setCuva(true);
    const ok = await onSacuvaj(ids);
    setCuva(false);
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !cuva) onClose(); }}>
      <DialogContent className="max-w-[560px] gap-3 rounded-[26px] border-hairline bg-background p-5">
        <DialogHeader className="space-y-1 pr-6 text-left">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Uživo</div>
          <DialogTitle className="font-display text-[26px] font-bold tracking-tight">Redosled vežbi</DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Prevuci vežbu gde hoćeš. Prva nezavršena je ona koju vežbač radi sad, a superset se pomera ceo.
          </DialogDescription>
        </DialogHeader>
        <DndContext sensors={senzori} collisionDetection={closestCenter} onDragEnd={naKraj}>
          <SortableContext items={redovi.map((r) => r[0].id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2 p-0.5">
              {redovi.map((r, i) => (
                <Red
                  key={r[0].id}
                  vezbe={r}
                  broj={i + 1}
                  sad={r[0].id === prvaNezavrsena}
                  zavrsena={gotov(r)}
                  napredak={napredak}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <DialogFooter className="sm:space-x-0">
          <button
            type="button"
            disabled={!promenjen || cuva}
            onClick={() => void sacuvaj()}
            className={cn(
              "inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[18px] text-[15px] font-semibold transition disabled:cursor-not-allowed",
              promenjen ? "bg-gradient-brand text-white shadow-brand" : "bg-surface-2 text-muted-foreground",
            )}
          >
            {cuva ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={2.8} />}
            {cuva ? "Čuvam..." : "Sačuvaj redosled"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RedosledUzivo;
