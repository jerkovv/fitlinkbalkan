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
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Reset lozinke u tri koraka (OTP kod, sve u app-u, bez linka)
  const [forgotStep, setForgotStep] = useState<"email" | "code" | "newpass">("email");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Ako je već ulogovan, redirect - ALI ne tokom reset toka (verifyOtp pravi
  // privremenu sesiju, ne smemo da uletimo u app pre nego što se lozinka postavi).
  useEffect(() => {
    if (!authLoading && user && role && mode !== "forgot") {
      navigate(role === "trainer" ? "/trener" : "/vezbac", { replace: true });
    }
  }, [user, role, authLoading, navigate, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/spremno?tip=potvrda`,
            data: {
              full_name: fullName,
              role: "trainer", // Treneri se slobodno registruju
            },
          },
        });
        if (error) throw error;
        toast.success("Nalog kreiran! Proveri email za potvrdu.");
      } else if (mode === "forgot") {
        if (forgotStep === "email") {
          // korak 1: posalji kod (OTP) na mejl - bez redirectTo (ne idemo na link)
          const { error } = await supabase.auth.resetPasswordForEmail(email);
          if (error) throw error;
          toast.success("Kod je poslat na tvoj email.");
          setForgotStep("code");
        } else if (forgotStep === "code") {
          // korak 2: provera koda
          const { error } = await supabase.auth.verifyOtp({
            email,
            token: resetCode.trim(),
            type: "recovery",
          });
          if (error) throw new Error("Kod nije ispravan ili je istekao.");
          setForgotStep("newpass");
        } else {
          // korak 3: postavi novu lozinku
          if (newPassword.length < 6) {
            throw new Error("Lozinka mora imati bar 6 karaktera.");
          }
          if (newPassword !== confirmPassword) {
            throw new Error("Lozinke se ne poklapaju.");
          }
          const { error } = await supabase.auth.updateUser({ password: newPassword });
          if (error) {
            let poruka = "Greška pri promeni lozinke. Pokušaj ponovo.";
            const m = error.message?.toLowerCase() ?? "";
            if (m.includes("different from the old password")) {
              poruka = "Nova lozinka mora biti različita od stare.";
            } else if (m.includes("at least") || m.includes("password should be")) {
              poruka = "Lozinka mora imati bar 6 karaktera.";
            }
            throw new Error(poruka);
          }
          await supabase.auth.signOut();
          toast.success("Lozinka je promenjena, prijavi se.");
          setForgotStep("email");
          setResetCode("");
          setNewPassword("");
          setConfirmPassword("");
          setMode("login");
        }
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
    <div className="phone-shell flex flex-col px-6 py-10">
      <Link to="/" className="text-xs text-muted-foreground mb-8">← Nazad</Link>

      <div className="mb-8">
        <div className="h-12 w-12 rounded-2xl bg-trainer-soft text-trainer-soft-foreground flex items-center justify-center mb-4">
          <Briefcase className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <h1 className="font-display text-[32px] leading-tight font-bold tracking-tightest">
          {mode === "login" && "Dobrodošao nazad"}
          {mode === "signup" && "Postani trener"}
          {mode === "forgot" && "Zaboravljena lozinka"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "login" && "Uloguj se na svoj FitLink nalog."}
          {mode === "signup" && "Kreiraj nalog i pozovi svoje vežbače."}
          {mode === "forgot" && forgotStep === "email" && "Unesi email — poslaćemo ti kod za resetovanje."}
          {mode === "forgot" && forgotStep === "code" && "Unesi kod koji smo poslali na tvoj email."}
          {mode === "forgot" && forgotStep === "newpass" && "Postavi novu lozinku za svoj nalog."}
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

        {(mode !== "forgot" || forgotStep === "email") && (
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
        )}

        {mode !== "forgot" && (
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Lozinka</Label>
              {mode === "login" && (
                <button
                  type="button"
                  onClick={() => { setForgotStep("email"); setMode("forgot"); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition"
                >
                  Zaboravljena?
                </button>
              )}
            </div>
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
        )}

        {mode === "forgot" && forgotStep === "code" && (
          <div>
            <Label htmlFor="code">Kod iz emaila</Label>
            <Input
              id="code"
              inputMode="numeric"
              maxLength={6}
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
              required
              className="mt-1.5 text-center tracking-[0.3em]"
              placeholder="______"
              autoComplete="one-time-code"
            />
            <button
              type="button"
              onClick={() => setForgotStep("email")}
              className="mt-2 text-[11px] text-muted-foreground hover:text-foreground transition"
            >
              Pošalji ponovo
            </button>
          </div>
        )}

        {mode === "forgot" && forgotStep === "newpass" && (
          <>
            <div>
              <Label htmlFor="newpass">Nova lozinka</Label>
              <Input
                id="newpass"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="mt-1.5"
                autoComplete="new-password"
                placeholder="Bar 6 karaktera"
              />
            </div>
            <div>
              <Label htmlFor="confirmpass">Ponovi lozinku</Label>
              <Input
                id="confirmpass"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="mt-1.5"
                autoComplete="new-password"
                placeholder="Ista lozinka još jednom"
              />
            </div>
          </>
        )}

        <Button type="submit" className="w-full mt-6" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {mode === "login" && "Uloguj se"}
          {mode === "signup" && "Kreiraj nalog"}
          {mode === "forgot" && forgotStep === "email" && "Pošalji kod"}
          {mode === "forgot" && forgotStep === "code" && "Potvrdi kod"}
          {mode === "forgot" && forgotStep === "newpass" && "Sačuvaj lozinku"}
        </Button>
      </form>

      <button
        onClick={() => { setForgotStep("email"); setMode(mode === "login" ? "signup" : "login"); }}
        className="mt-6 text-xs text-center text-muted-foreground hover:text-foreground transition"
      >
        {mode === "login" && "Nemaš nalog? Registruj se kao trener"}
        {mode === "signup" && "Već imaš nalog? Uloguj se"}
        {mode === "forgot" && "← Nazad na login"}
      </button>

      <p className="mt-4 text-[11px] text-center text-muted-foreground/70">
        Vežbač? Potreban ti je <strong>poziv od trenera</strong>.
      </p>
    </div>
  );
};

export default Auth;
