import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { porukaGreske } from "@/lib/errorMessage";
import { useConfirm } from "@/hooks/useConfirm";

/**
 * Trener zaustavlja trening koji je vezbac zaboravio da ugasi. Kraj ide istim
 * putem kao vezbacev "Zavrsi" (trainer_finish_workout), pa telefon, sat i Live
 * Activity vide obican kraj; upisane serije ostaju.
 *
 * Deljeno izmedju stranice uzivo, lista aktivnih vezbaca i profila vezbaca -
 * dok je dugme bilo samo na stranici uzivo, trener na racunaru ga nije nalazio.
 */
export const useZaustaviTrening = () => {
  const confirm = useConfirm();
  // Id sesije koja se upravo zaustavlja (spinner na tom dugmetu).
  const [zaustavlja, setZaustavlja] = useState<string | null>(null);

  /** true kad je trening zaustavljen (ili je vec bio zavrsen). */
  const zaustavi = async (sessionId: string, athleteName?: string | null): Promise<boolean> => {
    if (zaustavlja) return false;
    const ok = await confirm({
      title: "Zaustaviti trening?",
      description: `Trening${athleteName ? ` vežbača ${athleteName}` : ""} biće završen i sačuvan sa serijama upisanim do sada. Koristi ovo kad je vežbač zaboravio da ugasi trening.`,
      confirmLabel: "Zaustavi",
      destructive: true,
    });
    if (!ok) return false;
    setZaustavlja(sessionId);
    const { data, error } = await supabase.rpc("trainer_finish_workout" as any, { p_session_id: sessionId });
    setZaustavlja(null);
    if (error) {
      toast.error(porukaGreske(error));
      return false;
    }
    const res = data as { success?: boolean } | null;
    if (res?.success === false) toast("Trening je već bio završen");
    else toast.success("Trening je zaustavljen");
    return true;
  };

  return { zaustavi, zaustavlja };
};
