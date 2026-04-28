import { useState } from "react";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import { Card } from "@/components/ui-bits";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const MAX = 1000;

export const MessageTrainerCard = () => {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    const { error } = await supabase.rpc("send_message_to_trainer", { p_body: text });
    setSending(false);
    if (error) {
      toast.error(error.message ?? "Greška pri slanju");
      return;
    }
    toast.success("Poruka poslata treneru");
    setBody("");
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 card-premium-hover px-5 py-4 text-left"
      >
        <div className="h-11 w-11 rounded-2xl bg-gradient-brand-soft text-primary flex items-center justify-center">
          <MessageSquare className="h-[18px] w-[18px]" />
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-semibold tracking-tight">Poruka treneru</div>
          <div className="text-[12.5px] text-muted-foreground">Postavi pitanje ili javi nešto</div>
        </div>
        <span className="text-muted-foreground">→</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Poruka treneru</DialogTitle>
            <DialogDescription>
              Trener će dobiti notifikaciju i odgovoriće ti čim stigne.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX))}
            placeholder="Npr. Mogu li da pomerim termin za sutra?"
            rows={5}
            className="resize-none"
          />
          <div className="text-[11px] text-muted-foreground text-right tnum">
            {body.length}/{MAX}
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
    </>
  );
};
