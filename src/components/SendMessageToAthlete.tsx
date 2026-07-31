import { useState } from "react";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  FullScreenSheet,
  FullScreenSheetScroll,
  FullScreenSheetFooter,
} from "@/components/ui/full-screen-sheet";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { porukaGreske } from "@/lib/errorMessage";
import { toast } from "sonner";

const MAX = 1000;

interface Props {
  athleteId: string;
  athleteName?: string;
  variant?: "default" | "icon" | "stacked";
}

export const SendMessageToAthlete = ({ athleteId, athleteName, variant = "default" }: Props) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // Direktan insert u messages (isti thread koji koriste useChat.ts/ChatThread.tsx)
  // umesto send_message_to_athlete RPC-a koji je pisao samo u notifications.
  const handleSend = async () => {
    const text = body.trim();
    if (!text || !user) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      trainer_id: user.id,
      athlete_id: athleteId,
      sender_id: user.id,
      body: text,
    } as any);
    setSending(false);
    if (error) {
      toast.error(porukaGreske(error));
      return;
    }
    toast.success("Poruka poslata vežbaču");
    setBody("");
    setOpen(false);
  };

  return (
    <>
      {variant === "icon" ? (
        <button
          aria-label="Pošalji poruku"
          onClick={() => setOpen(true)}
          className="h-10 w-10 rounded-full bg-surface-2 hover:bg-surface-3 flex items-center justify-center transition active:scale-95"
        >
          <MessageSquare className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </button>
      ) : variant === "stacked" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-surface/80 backdrop-blur hover:bg-surface transition"
        >
          <MessageSquare className="h-4 w-4 text-foreground" strokeWidth={2} />
          <span className="text-[11px] font-semibold">Poruka</span>
        </button>
      ) : (
        <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
          <MessageSquare className="h-4 w-4" /> Poruka
        </Button>
      )}

      <FullScreenSheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Poruka ${athleteName ? `· ${athleteName}` : "vežbaču"}`}
      >
        <FullScreenSheetScroll className="pt-5 space-y-2">
          <p className="text-sm text-muted-foreground">
            Vežbač će dobiti notifikaciju u app-u.
          </p>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX))}
            placeholder="Npr. Sutra počinjemo u 8h umesto 7h."
            rows={5}
            className="resize-none"
            autoFocus
          />
          <div className="text-[11px] text-muted-foreground text-right tnum">
            {body.length}/{MAX}
          </div>
        </FullScreenSheetScroll>
        <FullScreenSheetFooter>
          <Button onClick={handleSend} disabled={sending || !body.trim() || !user} className="w-full bg-gradient-brand text-white shadow-brand">
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" /> Pošalji
              </>
            )}
          </Button>
        </FullScreenSheetFooter>
      </FullScreenSheet>
    </>
  );
};
