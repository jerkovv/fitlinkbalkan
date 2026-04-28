import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  // Supabase auto-parsuje recovery hash i pravi sesiju.
  // Sačekamo PASSWORD_RECOVERY event ili postojeću sesiju.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Lozinke se ne poklapaju");
      return;
    }
    if (password.length < 6) {
      toast.error("Lozinka mora imati najmanje 6 karaktera");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Lozinka uspešno promenjena!");
      await supabase.auth.signOut();
      navigate("/auth", { replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Greška pri promeni lozinke");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="phone-shell flex flex-col px-6 py-10 min-h-screen">
      <Link to="/auth" className="text-xs text-muted-foreground mb-8">← Nazad</Link>

      <div className="mb-8">
        <div className="h-12 w-12 rounded-2xl bg-trainer-soft text-trainer-soft-foreground flex items-center justify-center mb-4">
          <KeyRound className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <h1 className="font-display text-[32px] leading-tight font-bold tracking-tightest">
          Nova lozinka
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ready
            ? "Unesi novu lozinku za svoj nalog."
            : "Učitavanje… Otvori link iz emaila ako još nisi."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="password">Nova lozinka</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="mt-1.5"
            autoComplete="new-password"
            disabled={!ready}
          />
        </div>

        <div>
          <Label htmlFor="confirm">Potvrdi lozinku</Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            className="mt-1.5"
            autoComplete="new-password"
            disabled={!ready}
          />
        </div>

        <Button type="submit" className="w-full mt-6" disabled={submitting || !ready}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Sačuvaj novu lozinku
        </Button>
      </form>
    </div>
  );
};

export default ResetPassword;
