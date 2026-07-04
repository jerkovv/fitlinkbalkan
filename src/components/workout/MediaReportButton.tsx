import { useEffect, useState } from "react";
import { Flag, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Suptilno "Prijavi" preko medija vezbe u toku treninga. Vezbac prijavi ako slika/video
// ne radi ili je los; upisuje u exercise_media_reports (athlete insert RLS: reported_by=uid).
const REASONS = [
  "Slika se ne prikazuje",
  "Pogrešna slika",
  "Video ne radi",
  "Loša veličina",
  "Drugo",
];

export const MediaReportButton = ({ exerciseId }: { exerciseId: string }) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reported, setReported] = useState(false);

  // Nova vezba -> resetuj i proveri da li je vec prijavljena (emr_select_own cita svoje).
  // Bez unique constraint-a moze biti vise redova -> limit(1) umesto maybeSingle.
  useEffect(() => {
    let alive = true;
    setReported(false);
    setReason(null);
    setNote("");
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!alive || !user) return;
      const { data } = await supabase
        .from("exercise_media_reports")
        .select("id")
        .eq("exercise_id", exerciseId)
        .eq("reported_by", user.id)
        .limit(1);
      if (!alive) return;
      if (data && data.length > 0) setReported(true);
    })();
    return () => {
      alive = false;
    };
  }, [exerciseId]);

  const submit = async () => {
    if (!reason) return;
    setSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const uid = user?.id;
    if (!uid) {
      setSubmitting(false);
      toast.error("Nisi prijavljen.");
      return;
    }
    const reasonText = note.trim() ? `${reason} - ${note.trim()}` : reason;
    const { error } = await supabase.from("exercise_media_reports").insert({
      exercise_id: exerciseId,
      reported_by: uid,
      reason: reasonText,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Greška pri slanju prijave.");
      return;
    }
    setReported(true);
    setOpen(false);
    toast.success("Prijavljeno, hvala");
  };

  if (reported) {
    return (
      <div className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-semibold text-white/80 backdrop-blur-sm">
        <Check className="h-3 w-3" />
        Prijavljeno
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Prijavi problem sa vežbom"
        className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-sm transition active:scale-95"
      >
        <Flag className="h-3 w-3" />
        Prijavi
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="h-auto max-h-[85dvh] w-full max-w-[440px] mx-auto rounded-t-3xl p-0 flex flex-col"
        >
          <SheetTitle className="sr-only">Prijavi problem sa vežbom</SheetTitle>
          <SheetDescription className="sr-only">
            Izaberi razlog zbog kog slika ili video vežbe ne radi ili je los.
          </SheetDescription>

          <div className="px-5 pt-4 pb-2">
            <h2 className="font-display text-lg font-bold tracking-tighter">
              Prijavi problem sa vežbom
            </h2>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Šta nije u redu sa slikom ili videom?
            </p>
          </div>

          <div className="overflow-y-auto px-5 pb-3 space-y-4">
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => {
                const on = reason === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={cn(
                      "pill px-3 py-1.5 text-[12.5px] font-semibold transition active:scale-95",
                      on
                        ? "bg-primary text-white"
                        : "bg-surface border border-hairline text-muted-foreground",
                    )}
                  >
                    {r}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-muted-foreground">
                Napomena (opciono)
              </label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Kratko opiši problem..."
                rows={3}
                maxLength={300}
              />
            </div>
          </div>

          <div className="px-5 pt-2 pb-5 border-t border-hairline">
            <Button
              onClick={submit}
              disabled={!reason || submitting}
              size="lg"
              className="w-full bg-gradient-brand text-white shadow-brand hover:opacity-95"
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Pošalji
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default MediaReportButton;
