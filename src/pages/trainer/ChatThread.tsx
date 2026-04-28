import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { ChatThread } from "@/components/ChatThread";
import { Loader2, ArrowLeft } from "lucide-react";

const TrainerChatThread = () => {
  const { athleteId } = useParams<{ athleteId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState<string>("");
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!athleteId || !user?.id) return;
    (async () => {
      // Provera da je atleta zaista vezan za ovog trenera (RLS će svakako blokirati, ali rana provera)
      const { data: athlete } = await supabase
        .from("athletes")
        .select("id, trainer_id")
        .eq("id", athleteId)
        .maybeSingle();
      if (!athlete || (athlete as any).trainer_id !== user.id) {
        setValid(false);
        return;
      }
      setValid(true);
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", athleteId)
        .maybeSingle();
      setName(profile?.full_name ?? "Vežbač");
    })();
  }, [athleteId, user?.id]);

  if (valid === null) {
    return (
      <div className="phone-shell flex items-center justify-center min-h-screen">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!valid || !athleteId || !user?.id) {
    return (
      <div className="phone-shell flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <p className="text-sm text-muted-foreground">Razgovor nije dostupan.</p>
        <button onClick={() => navigate("/trener/chat")} className="mt-4 text-primary text-sm font-semibold">
          Nazad na razgovore
        </button>
      </div>
    );
  }

  return (
    <div className="phone-shell flex flex-col h-[100dvh] bg-background">
      <header className="flex items-center gap-3 px-3 py-3 border-b border-hairline bg-surface/80 backdrop-blur sticky top-0 z-10">
        <button
          onClick={() => navigate("/trener/chat")}
          className="h-9 w-9 rounded-full hover:bg-surface-2 flex items-center justify-center transition"
          aria-label="Nazad"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="h-9 w-9 rounded-2xl bg-gradient-brand text-white font-semibold flex items-center justify-center shrink-0">
          {name.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold tracking-tight truncate">{name}</div>
          <button
            onClick={() => navigate(`/trener/vezbaci/${athleteId}`)}
            className="text-[11px] text-muted-foreground hover:text-primary transition"
          >
            Vidi profil
          </button>
        </div>
      </header>
      <ChatThread trainerId={user.id} athleteId={athleteId} className="flex-1 min-h-0" />
    </div>
  );
};

export default TrainerChatThread;
