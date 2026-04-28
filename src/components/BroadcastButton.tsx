import { useState } from "react";
import { Megaphone, Send, Loader2, Users, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MAX = 1000;

interface Props {
  /** Render kao floating action button umesto inline dugmeta */
  fab?: boolean;
}

export const BroadcastButton = ({ fab = false }: Props) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    const { data, error } = await supabase.rpc("broadcast_to_athletes", {
      p_body: text,
      p_only_active: onlyActive,
      p_title: title.trim() || null,
    });
    setSending(false);
    if (error) {
      toast.error(error.message ?? "Greška pri slanju");
      return;
    }
    const count = typeof data === "number" ? data : 0;
    if (count === 0) {
      toast.warning("Nema vežbača koji ispunjavaju uslov");
    } else {
      toast.success(`Poslato ${count} ${count === 1 ? "vežbaču" : "vežbača"}`);
    }
    setTitle("");
    setBody("");
    setOpen(false);
  };

  return (
    <>
      {fab && (
        <div className="fixed inset-x-0 bottom-28 z-20 pointer-events-none flex justify-center">
          <div className="w-full max-w-[440px] px-5 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Pošalji obaveštenje svima"
              className={cn(
                "pointer-events-auto h-14 px-5 rounded-full",
                "bg-gradient-brand text-white shadow-brand font-bold text-[13px] tracking-tight",
                "inline-flex items-center gap-2 active:scale-95 transition",
              )}
            >
              <Megaphone className="h-4 w-4" strokeWidth={2.5} />
              Obaveštenje
            </button>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        {!fab && (
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Megaphone className="h-4 w-4" /> Obaveštenje
            </Button>
          </DialogTrigger>
        )}

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pošalji obaveštenje</DialogTitle>
          <DialogDescription>
            Stiže kao notifikacija u app-u svim odabranim vežbačima.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-muted-foreground">Naslov (opciono)</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 80))}
              placeholder="Npr. Promena rasporeda"
              maxLength={80}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-muted-foreground">Poruka</label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX))}
              placeholder="Npr. Sutra teretana ne radi zbog praznika."
              rows={5}
              className="resize-none"
            />
            <div className="text-[11px] text-muted-foreground text-right tnum">
              {body.length}/{MAX}
            </div>
          </div>

          <button
            onClick={() => setOnlyActive((v) => !v)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition",
              onlyActive
                ? "border-primary/30 bg-primary/5"
                : "border-border bg-surface-2/40 hover:bg-surface-2",
            )}
          >
            <div className={cn(
              "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
              onlyActive ? "bg-primary/10 text-primary" : "bg-surface-3 text-muted-foreground",
            )}>
              {onlyActive ? <ShieldCheck className="h-4 w-4" /> : <Users className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-semibold leading-tight">
                {onlyActive ? "Samo aktivnim vežbačima" : "Svim vežbačima"}
              </div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">
                {onlyActive
                  ? "Stiže samo onima sa aktivnom članarinom"
                  : "Stiže svim tvojim vežbačima"}
              </div>
            </div>
            <Switch checked={onlyActive} onCheckedChange={setOnlyActive} />
          </button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
            Otkaži
          </Button>
          <Button onClick={handleSend} disabled={sending || !body.trim()}>
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" /> Pošalji
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
