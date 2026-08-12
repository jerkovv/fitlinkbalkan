import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { porukaGreske } from "@/lib/errorMessage";
import { toast } from "sonner";
import { Dumbbell, Loader2, CheckCircle2 } from "lucide-react";
import { BrandGlyph } from "@/components/BrandMark";

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
  const [invalidReason, setInvalidReason] = useState<"expired" | "used" | "invalid">("invalid");
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
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (!code) return;

      let resolvedTrainerId: string | null = null;

      // 1) Probaj per-athlete invite zapis
      const { data: inviteData } = await supabase.rpc("get_invite_by_code", { p_code: code } as any);
      const inviteRow = inviteData as any;

      if (inviteRow?.found) {
        if (inviteRow.status === "pending") {
          const expired =
            inviteRow.expires_at && new Date(inviteRow.expires_at) < new Date();
          if (expired) {
            setInvalidReason("expired");
          } else {
            resolvedTrainerId = inviteRow.trainer_id;
            setHasInviteRow(true);
            setInviteEmail(inviteRow.email ?? null);
            setInviteFullName(inviteRow.full_name ?? null);
            if (inviteRow.email) setEmail(inviteRow.email);
            if (inviteRow.full_name) setFullName(inviteRow.full_name);
          }
        } else if (inviteRow.status === "accepted") {
          setInvalidReason("used");
        } else {
          setInvalidReason("invalid");
        }
      }

      // 2) Fallback: trener-level invite_code (public landing / referral / share)
      if (!resolvedTrainerId) {
        const { data: trainerData } = await supabase.rpc("get_trainer_by_code", { p_code: code } as any);
        const trainerRow = trainerData as any;
        if (trainerRow?.valid && trainerRow?.trainer_id) {
          resolvedTrainerId = trainerRow.trainer_id;
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

  // ------ FLOW A: magic link (vežbač je već ulogovan iz email invite) ------
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

      // 4) Označi invite kao iskorišćen preko RPC-a (RLS-safe; direktan update tiho padne).
      if (hasInviteRow) {
        await (supabase.rpc as any)("accept_invite", { p_code: code });
      }

      toast.success("Dobrodošao u FitLink!");
      navigate("/vezbac", { replace: true });
    } catch (err: any) {
      toast.error(porukaGreske(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ------ FLOW B: direktno otvorio link bez email-a (nije auth-ovan) ------
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/spremno?tip=registracija`,
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
        // Eksplicitni upsert role/athlete (handle_new_user trigger hvata samo invite-email flow)
        await supabase.from("user_roles").upsert({
          user_id: data.user.id,
          role: "athlete",
        } as any);

        await supabase.from("athletes").upsert({
          id: data.user.id,
          trainer_id: trainerId,
          goal: "general",
          referred_by_athlete_id: referredBy || null,
          signup_source: signupSource,
        } as any);

        if (hasInviteRow) {
          await (supabase.rpc as any)("accept_invite", { p_code: code });
        }
      }

      toast.success("Nalog kreiran! Proveri email za potvrdu.");
      navigate("/proveri-mejl", { state: { email } });
    } catch (err: any) {
      toast.error(porukaGreske(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!valid) {
    const invalidMessages: Record<"expired" | "used" | "invalid", string> = {
      expired: "Poziv je istekao. Traži od trenera da ti pošalje novi.",
      used: "Ovaj poziv je već iskorišćen. Ako si već napravio nalog, uloguj se.",
      invalid: "Kod nije ispravan. Proveri da li si ga tačno uneo.",
    };
    return (
      <div
        className="phone-shell flex flex-col items-center justify-center px-6 pb-10 text-center"
        style={{ paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 12px)" }}
      >
        <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Dumbbell className="h-5 w-5" />
        </div>
        <h1 className="font-display text-2xl font-bold mb-2">Pozivnica nevažeća</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {invalidMessages[invalidReason]}
        </p>
        <div className="flex items-center gap-4">
          <Link to="/poziv" className="text-xs text-primary underline">Unesi drugi kod</Link>
          <Link to="/" className="text-xs text-primary underline">Nazad na početnu</Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="phone-shell flex flex-col px-6 pb-10"
      style={{ paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 12px)" }}
    >
      <div className="mb-8">
        <div className="h-12 w-12 rounded-2xl bg-athlete-soft text-athlete-soft-foreground flex items-center justify-center mb-4">
          <BrandGlyph className="h-4" />
        </div>
        <h1 className="font-display text-[32px] leading-tight font-bold tracking-tightest">
          {magicSession
            ? "Skoro gotovo!"
            : signupSource === "public_landing" || signupSource === "referral"
            ? "Kreiraj nalog"
            : "Pozvan si!"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {magicSession ? (
            <>Postavi lozinku da završiš pristup nalogu kod <span className="font-semibold text-foreground">{trainerName || "trenera"}</span>.</>
          ) : signupSource === "public_landing" ? (
            <>Postani vežbač kod <span className="font-semibold text-foreground">{trainerName || "trenera"}</span> na FitLink-u.</>
          ) : signupSource === "referral" ? (
            <>Prijatelj te je preporučio za trening kod <span className="font-semibold text-foreground">{trainerName || "trenera"}</span>.</>
          ) : (
            <><span className="font-semibold text-foreground">{trainerName || "Trener"}</span> te poziva da postaneš njegov vežbač na FitLink-u.</>
          )}
        </p>
      </div>

      {magicSession ? (
        // FLOW A - već je ulogovan, samo set password
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
            <div className="relative mt-1.5">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="pr-16"
                placeholder="Bar 6 karaktera"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-3 text-[11px] text-muted-foreground hover:text-foreground transition flex items-center"
              >
                {showPassword ? "Sakrij" : "Prikaži"}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full mt-6" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Završi registraciju
          </Button>
        </form>
      ) : (
        // FLOW B - direktan link, full signup
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
            <div className="relative mt-1.5">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="pr-16"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-3 text-[11px] text-muted-foreground hover:text-foreground transition flex items-center"
              >
                {showPassword ? "Sakrij" : "Prikaži"}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full mt-6" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {signupSource === "public_landing" || signupSource === "referral" ? "Kreiraj nalog" : "Prihvati i kreiraj nalog"}
          </Button>
        </form>
      )}
    </div>
  );
};

export default Invite;
