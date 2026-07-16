import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, LogOut, UserX } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

// Neutralan ekran za nalog cija uloga NEMA dom u mobilnoj aplikaciji (npr. admin -
// on zivi na admin.fitlink.rs). Prikazuje se umesto redirecta (loop guard) i umesto
// login forme kad je takav nalog vec ulogovan. Jedina akcija je odjava.
export const UnsupportedAccount = () => {
  const { signOut } = useAuth();
  const nav = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      toast.success("Odjavljen si");
      nav("/auth", { replace: true });
    } catch (e) {
      toast.error((e as Error)?.message ?? "Greška pri odjavi");
      setSigningOut(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-6 text-center">
      <div className="w-full max-w-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft">
          <UserX className="h-7 w-7 text-primary" strokeWidth={2.2} />
        </div>
        <h1 className="font-display text-[26px] leading-[1.1] font-bold tracking-tight text-foreground">
          Ovaj nalog nije podržan u aplikaciji
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Prijavi se drugim nalogom da nastaviš.
        </p>
        <Button
          variant="outline"
          size="lg"
          className="mt-8 w-full"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4 mr-2" />
          )}
          Odjavi se
        </Button>
      </div>
    </div>
  );
};

export default UnsupportedAccount;
