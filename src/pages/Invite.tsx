import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Dumbbell, Loader2, CheckCircle2 } from "lucide-react";

const Invite = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  // Referral: ?ref=<athleteId>  ili  ?source=public
  const params = new URLSearchParams(window.location.search);
  const referredBy = params.get("ref");
  const sourceParam = params.get("source"); // npr. "public"
  const signupSource = referredBy
    ? "referral"
    : sourceParam === "public"
    ? "public_landing"
    : code
    ? "invite_link"
    : "invite_email";

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [trainerName, setTrainerName] = useState<string>("");
  const [trainerId, setTrainerId] = useState<string>("");
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [inviteFullName, setInviteFullName] = useState<string | null>(null);
  // true = postoji zapis u invites tabeli (lični invite), false = trainer-level kod (public/referral)
  const [hasInviteRow, setHasInviteRow] = useState(false);

  // Magic link flow detection
  const [magicSession, setMagicSession] = useState(false);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (!code) return;

      let resolvedTrainerId: string | null = null;

      // 1) Probaj per-athlete invite zapis
      const { data: inviteRow } = await supabase
        .from("invites")
        .select("trainer_id, status, expires_at, email, full_name")
        .eq("code", code)
        .maybeSingle();

      if (inviteRow && inviteRow.status === "pending") {
        const expired =
          inviteRow.expires_at && new Date(inviteRow.expires_at) < new Date();
        if (!expired) {
          resolvedTrainerId = (inviteRow as any).trainer_id;
          setHasInviteRow(true);
          setInviteEmail((inviteRow as any).email ?? null);
          setInviteFullName((inviteRow as any).full_name ?? null);
          if ((inviteRow as any).email) setEmail((inviteRow as any).email);
          if ((inviteRow as any).full_name) setFullName((inviteRow as any).full_name);
        }
      }

      // 2) Fallback: trener-level invite_code (public landing / referral / share)
      if (!resolvedTrainerId) {
        const { data: trainerRow } = await supabase
          .from("trainers")
          .select("id")
          .eq("invite_code", code)
          .maybeSingle();
        if (trainerRow?.id) {
          resolvedTrainerId = trainerRow.id;
          setHasInviteRow(false);
        }
      }

      if (!resolvedTrainerId) {
        setValid(false);
        setChecking(false);
        return;
      }

      setValid(true);
      setTrainerId(resolvedTrainerId);

      // Trenerovo ime
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", resolvedTrainerId)
        .maybeSingle();
      setTrainerName(profile?.full_name ?? "tvog trenera");

      // Magic link sesija (Supabase invite mejl)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setMagicSession(true);
        setSessionUserId(session.user.id);
        setSessionEmail(session.user.email ?? null);
        if (session.user.email) setEmail(session.user.email);
      }

      setChecking(false);
    };
    init();
  }, [code]);

  // ── FLOW A: magic link (vežbač je već ulogovan iz email invite) ──
  const completeMagicSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionUserId) return;
    if (password.length < 6) {
      toast.error("Lozinka mora imati bar 6 karaktera");
      return;
    }

    setSubmitting(true);
    try {
      // 1) Postavi password
      const { error: pwErr } = await supabase.auth.updateUser({
        password,
        data: { full_name: fullName || inviteFullName || "" },
      });
      if (pwErr) throw pwErr;

      // 2) Profile (upsert)
      await supabase.from("profiles").upsert({
        id: sessionUserId,
        full_name: fullName || inviteFullName || null,
      } as any);

      // 3) Athlete role + trainer link
      await supabase.from("user_roles").upsert({
        user_id: sessionUserId,
        role: "athlete",
      } as any);

      await supabase.from("athletes").upsert({
        id: sessionUserId,
        trainer_id: trainerId,
        goal: "general",
        referred_by_athlete_id: referredBy || null,
        signup_source: signupSource,
      } as any);

      // 4) Označi invite kao iskorišćen
      await supabase
        .from("invites")
        .update({
          status: "accepted",
          used_by: sessionUserId,
          referred_by_athlete_id: referredBy || null,
        } as any)
        .eq("code", code!);

      toast.success("Dobrodošao u FitLink!");
      navigate("/vezbac");
    } catch (err: any) {
      toast.error(err.message ?? "Greška pri završetku registracije");
    } finally {
      setSubmitting(false);
    }
  };

  // ── FLOW B: direktno otvorio link bez email-a (nije auth-ovan) ──
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/vezbac`,
          data: {
            full_name: fullName,
            role: "athlete",
            invite_code: code,
            trainer_id: trainerId,
          },
        },
      });
      if (error) throw error;

      if (data.user) {
        await supabase
          .from("invites")
          .update({
            status: "accepted",
            used_by: data.user.id,
            referred_by_athlete_id: referredBy || null,
          } as any)
          .eq("code", code!);
      }

      toast.success("Nalog kreiran! Proveri email za potvrdu.");
      navigate("/vezbac");
    } catch (err: any) {
      toast.error(err.message ?? "Greška pri registraciji");
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="phone-shell flex flex-col items-center justify-center px-6 py-10 min-h-screen text-center">
        <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Dumbbell className="h-5 w-5" />
        </div>
        <h1 className="font-display text-2xl font-bold mb-2">Pozivnica nevažeća</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Ovaj poziv je istekao ili je već iskorišćen.
        </p>
        <Link to="/" className="text-xs text-primary underline">Nazad na početnu</Link>
      </div>
    );
  }

  return (
    <div className="phone-shell flex flex-col px-6 py-10 min-h-screen">
      <div className="mb-8">
        <div className="h-12 w-12 rounded-2xl bg-athlete-soft text-athlete-soft-foreground flex items-center justify-center mb-4">
          <Dumbbell className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <h1 className="font-display text-[32px] leading-tight font-bold tracking-tightest">
          {magicSession ? "Skoro gotovo!" : "Pozvan si!"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {trainerName} te poziva da postaneš njegov vežbač na FitLink-u.
        </p>
      </div>

      {magicSession ? (
        // FLOW A — već je ulogovan, samo set password
        <form onSubmit={completeMagicSignup} className="space-y-4">
          <div className="rounded-xl bg-success-soft text-success-soft-foreground px-4 py-3 flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="text-xs">
              Email <span className="font-semibold">{sessionEmail}</span> je potvrđen.
              Postavi lozinku da završiš.
            </div>
          </div>

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
          <div>
            <Label htmlFor="password">Postavi lozinku</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1.5"
              placeholder="Bar 6 karaktera"
            />
          </div>

          <Button type="submit" className="w-full mt-6" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Završi registraciju
          </Button>
        </form>
      ) : (
        // FLOW B — direktan link, full signup
        <form onSubmit={handleSignup} className="space-y-4">
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
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1.5"
              disabled={!!inviteEmail}
            />
            {inviteEmail && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Email je definisan u pozivnici.
              </p>
            )}
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
            />
          </div>
          <Button type="submit" className="w-full mt-6" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Prihvati i kreiraj nalog
          </Button>
        </form>
      )}
    </div>
  );
};

export default Invite;
