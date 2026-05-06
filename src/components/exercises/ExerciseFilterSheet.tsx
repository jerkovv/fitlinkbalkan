import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export type FilterState = {
  equipment: string[];
  categories: string[];
  onlyMine: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: FilterState;
  onApply: (next: FilterState) => void;
};

export const ExerciseFilterSheet = ({ open, onOpenChange, value, onApply }: Props) => {
  const [local, setLocal] = useState<FilterState>(value);
  const [equipmentOptions, setEquipmentOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);

  useEffect(() => {
    if (open) setLocal(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("exercises")
        .select("equipment, category")
        .eq("is_global", true)
        .limit(2000);
      if (!alive || !data) return;
      const eq = new Set<string>();
      const cat = new Set<string>();
      for (const r of data as any[]) {
        if (r.equipment) eq.add(r.equipment);
        if (r.category) cat.add(r.category);
      }
      setEquipmentOptions([...eq].sort());
      setCategoryOptions([...cat].sort());
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  const toggle = (key: "equipment" | "categories", v: string) => {
    setLocal((s) => {
      const arr = s[key];
      return {
        ...s,
        [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v],
      };
    });
  };

  const reset: FilterState = { equipment: [], categories: [], onlyMine: false };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-auto max-h-[80dvh] w-full max-w-[440px] mx-auto rounded-t-3xl p-0 flex flex-col"
      >
        <div className="px-5 pt-4 pb-2">
          <h2 className="font-display text-lg font-bold tracking-tighter">Filteri</h2>
        </div>
        <div className="overflow-y-auto px-5 pb-3 space-y-5">
          <section>
            <div className="eyebrow mb-2">Oprema</div>
            <div className="flex flex-wrap gap-2">
              {equipmentOptions.map((e) => {
                const on = local.equipment.includes(e);
                return (
                  <button
                    key={e}
                    onClick={() => toggle("equipment", e)}
                    className={cn(
                      "px-3 h-8 rounded-full text-xs font-semibold capitalize border transition",
                      on
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-surface-2 text-foreground border-hairline"
                    )}
                  >
                    {e.replace(/_/g, " ")}
                  </button>
                );
              })}
              {equipmentOptions.length === 0 && (
                <span className="text-xs text-muted-foreground">Učitavam...</span>
              )}
            </div>
          </section>

          {categoryOptions.length > 0 && (
            <section>
              <div className="eyebrow mb-2">Kategorija</div>
              <div className="flex flex-wrap gap-2">
                {categoryOptions.map((c) => {
                  const on = local.categories.includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() => toggle("categories", c)}
                      className={cn(
                        "px-3 h-8 rounded-full text-xs font-semibold capitalize border transition",
                        on
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-surface-2 text-foreground border-hairline"
                      )}
                    >
                      {c.replace(/_/g, " ")}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Samo moje vežbe</Label>
            <Switch
              checked={local.onlyMine}
              onCheckedChange={(v) => setLocal((s) => ({ ...s, onlyMine: v }))}
            />
          </section>
        </div>

        <div className="flex gap-3 p-5 border-t border-hairline">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => {
              setLocal(reset);
              onApply(reset);
              onOpenChange(false);
            }}
          >
            Resetuj
          </Button>
          <Button
            className="flex-1 bg-gradient-brand"
            onClick={() => {
              onApply(local);
              onOpenChange(false);
            }}
          >
            Primeni
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
