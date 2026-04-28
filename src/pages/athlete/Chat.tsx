import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { ChatThread } from "@/components/ChatThread";
import { Loader2, ArrowLeft } from "lucide-react";

const AthleteChat = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [trainerName, setTrainerName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: athlete } = await supabase
        .from("athletes")
        .select("trainer_id")
        .eq("id", user.id)
        .maybeSingle();
      const tId = (athlete as any)?.trainer_id ?? null;
      setTrainerId(tId);
      if (tId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", tId)
          .maybeSingle();
        setTrainerName(profile?.full_name ?? "Trener");
      }
      setLoading(false);
    })();
  }, [user?.id]);

  if (loading) {
    return (
      <div className="phone-shell flex items-center justify-center min-h-screen">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!trainerId || !user?.id) {
    return (
      <div className="phone-shell flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <p className="text-sm text-muted-foreground">Trener još nije podešen.</p>
        <button onClick={() => navigate("/vezbac")} className="mt-4 text-primary text-sm font-semibold">
          Nazad
        </button>
      </div>
    );
  }

  return (
    <div className="phone-shell flex flex-col h-[100dvh] bg-background">
      <header className="flex items-center gap-3 px-3 py-3 border-b border-hairline bg-surface/80 backdrop-blur sticky top-0 z-10">
        <button
          onClick={() => navigate("/vezbac")}
          className="h-9 w-9 rounded-full hover:bg-surface-2 flex items-center justify-center transition"
          aria-label="Nazad"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="h-9 w-9 rounded-2xl bg-gradient-brand text-white font-semibold flex items-center justify-center shrink-0">
          {trainerName.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold tracking-tight truncate">{trainerName}</div>
          <div className="text-[11px] text-muted-foreground">Tvoj trener</div>
        </div>
      </header>
      <ChatThread trainerId={trainerId} athleteId={user.id} className="flex-1 min-h-0" />
    </div>
  );
};

export default AthleteChat;
