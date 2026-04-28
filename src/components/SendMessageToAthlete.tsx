import { useState } from "react";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

const MAX = 1000;

interface Props {
  athleteId: string;
  athleteName?: string;
  variant?: "default" | "icon";
}

export const SendMessageToAthlete = ({ athleteId, athleteName, variant = "default" }: Props) => {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    const { error } = await supabase.rpc("send_message_to_athlete", {
      p_athlete_id: athleteId,
      p_body: text,
    });
    setSending(false);
    if (error) {
      toast.error(error.message ?? "Greška pri slanju");
      return;
    }
    toast.success("Poruka poslata vežbaču");
    setBody("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "icon" ? (
          <button
            aria-label="Pošalji poruku"
            className="h-10 w-10 rounded-full bg-surface-2 hover:bg-surface-3 flex items-center justify-center transition active:scale-95"
          >
            <MessageSquare className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </button>
        ) : (
          <Button variant="outline" className="gap-2">
            <MessageSquare className="h-4 w-4" /> Poruka
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Poruka {athleteName ? `· ${athleteName}` : "vežbaču"}</DialogTitle>
          <DialogDescription>
            Vežbač će dobiti notifikaciju u app-u.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX))}
          placeholder="Npr. Sutra počinjemo u 8h umesto 7h."
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
  );
};
