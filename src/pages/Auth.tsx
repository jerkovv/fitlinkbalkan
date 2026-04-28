import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Briefcase, Loader2 } from "lucide-react";

const Auth = () => {
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Ako je već ulogovan, redirect
  useEffect(() => {
    if (!authLoading && user && role) {
      navigate(role === "trainer" ? "/trener" : "/vezbac", { replace: true });
    }
  }, [user, role, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/trener`,
            data: {
              full_name: fullName,
              role: "trainer", // Treneri se slobodno registruju
            },
          },
        });
        if (error) throw error;
        toast.success("Nalog kreiran! Proveri email za potvrdu.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Dobrodošao nazad!");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Greška pri autentifikaciji");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="phone-shell flex flex-col px-6 py-10 min-h-screen">
      <Link to="/" className="text-xs text-muted-foreground mb-8">← Nazad</Link>

      <div className="mb-8">
        <div className="h-12 w-12 rounded-2xl bg-trainer-soft text-trainer-soft-foreground flex items-center justify-center mb-4">
          <Briefcase className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <h1 className="font-display text-[32px] leading-tight font-bold tracking-tightest">
          {mode === "login" ? "Dobrodošao nazad" : "Postani trener"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "login"
            ? "Uloguj se na svoj FitLink nalog."
            : "Kreiraj nalog i pozovi svoje vežbače."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" && (
          <div>
            <Label htmlFor="name">Ime i prezime</Label>
            <Input
              id="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="mt-1.5"
            />
          </div>
        )}

        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1.5"
            autoComplete="email"
          />
        </div>

        <div>
          <Label htmlFor="password">Lozinka</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="mt-1.5"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>

        <Button type="submit" className="w-full mt-6" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {mode === "login" ? "Uloguj se" : "Kreiraj nalog"}
        </Button>
      </form>

      <button
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
        className="mt-6 text-xs text-center text-muted-foreground hover:text-foreground transition"
      >
        {mode === "login" ? "Nemaš nalog? Registruj se kao trener" : "Već imaš nalog? Uloguj se"}
      </button>

      <p className="mt-4 text-[11px] text-center text-muted-foreground/70">
        Vežbač? Potreban ti je <strong>poziv od trenera</strong>.
      </p>
    </div>
  );
};

export default Auth;
