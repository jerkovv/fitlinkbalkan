import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Dumbbell, Loader2 } from "lucide-react";

const Invite = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [trainerName, setTrainerName] = useState<string>("");
  const [trainerId, setTrainerId] = useState<string>("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const validate = async () => {
      if (!code) return;
      const { data, error } = await supabase
        .from("invites")
        .select("trainer_id, status, expires_at")
        .eq("code", code)
        .maybeSingle();

      console.log("[Invite] lookup result", { code, data, error });

      if (error || !data || data.status !== "pending") {
        setValid(false);
      } else if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setValid(false);
      } else {
        setValid(true);
        setTrainerId(data.trainer_id);

        // Učitaj ime trenera odvojeno (profiles preko user_id)
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", data.trainer_id)
          .maybeSingle();
        setTrainerName(profile?.full_name ?? "tvog trenera");
      }
      setChecking(false);
    };
    validate();
  }, [code]);

  const handleSubmit = async (e: React.FormEvent) => {
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

      // Označi invite kao iskorišćen
      if (data.user) {
        await supabase
          .from("invites")
          .update({ status: "accepted", used_by: data.user.id })
          .eq("code", code!);
      }

      toast.success("Nalog kreiran! Proveri email.");
      navigate("/vezbac/onboarding");
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
          Pozvan si!
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {trainerName} te poziva da postaneš njegov vežbač na FitLink-u.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name">Ime i prezime</Label>
          <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="password">Lozinka</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="mt-1.5" />
        </div>
        <Button type="submit" className="w-full mt-6" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Prihvati i kreiraj nalog
        </Button>
      </form>
    </div>
  );
};

export default Invite;
