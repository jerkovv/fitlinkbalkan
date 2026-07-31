import { useState } from "react";
import { Card } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Loader2, Watch } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { WatchSync, isNativeIOS } from "@/lib/watchSync";
import { porukaGreske } from "@/lib/errorMessage";
import { toast } from "sonner";

// Rucni reset Watch konekcije - za slucaj kad sat zaglavi na "Provera naloga"
// jer je izgubio kesiran token (restart, watchOS azuriranje) i ne uspe da ga
// sam povuce. Isti sendTokenToWatch put kao na SIGNED_IN/TOKEN_REFRESHED.
// Deljeno izmedju trainer/Profile.tsx i athlete/Profile.tsx - pairing nije
// specifican za ulogu, radi identicno za bilo kog ulogovanog korisnika.
export function WatchResetCard() {
  const { user } = useAuth();
  const [resettingWatch, setResettingWatch] = useState(false);

  if (!isNativeIOS()) return null;

  const handleResetWatchConnection = async () => {
    if (!user) return;
    setResettingWatch(true);
    try {
      const { error: revokeErr } = await supabase.rpc("revoke_my_watch_tokens");
      if (revokeErr) throw revokeErr;

      const { data, error: tokenErr } = await supabase.rpc("get_or_create_watch_token");
      if (tokenErr) throw tokenErr;
      if (!data?.success || !data?.token) throw new Error("Token nije kreiran.");

      await WatchSync.sendTokenToWatch({
        token: data.token,
        userId: data.user_id ?? user.id,
      });

      toast.success("Konekcija je resetovana. Sat će se ponovo povezati za par sekundi.");
    } catch (e) {
      toast.error(porukaGreske(e));
    } finally {
      setResettingWatch(false);
    }
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Apple Watch
      </div>
      <p className="text-[12.5px] text-muted-foreground">
        Ako sat pokazuje "Provera naloga" iako si ulogovan na telefonu, resetuj konekciju.
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={handleResetWatchConnection}
        disabled={resettingWatch}
        className="w-full"
      >
        {resettingWatch ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Watch className="h-4 w-4 mr-2" />
        )}
        Resetuj konekciju sa satom
      </Button>
    </Card>
  );
}
