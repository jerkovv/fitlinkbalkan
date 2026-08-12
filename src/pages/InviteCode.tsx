import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { porukaGreske } from "@/lib/errorMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BrandGlyph } from "@/components/BrandMark";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const InviteCode = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const emailValid = EMAIL_RE.test(email.trim());
  const tokenValid = /^\d{6}$/.test(token.trim());
  const canSubmit = emailValid && tokenValid && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const mejl = email.trim().toLowerCase();
    const kod = token.trim();

    setSubmitting(true);
    try {
      // Prvo slanje pozivnice ide kroz invite token; ponovno slanje i
      // postojeci mejlovi kroz magiclink - probamo oba tipa.
      let { error } = await supabase.auth.verifyOtp({
        email: mejl,
        token: kod,
        type: "invite",
      });
      if (error) {
        ({ error } = await supabase.auth.verifyOtp({
          email: mejl,
          token: kod,
          type: "magiclink",
        }));
      }
      if (error) {
        const msg = (error.message ?? "").toLowerCase();
        toast.error(
          msg.includes("expired")
            ? "Kod je istekao. Traži od trenera novi."
            : "Kod nije ispravan. Proveri mejl i kod.",
        );
        return;
      }

      const { data: inviteRow, error: inviteErr } = await supabase
        .from("invites")
        .select("code")
        .eq("email", mejl)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (inviteErr) {
        toast.error(porukaGreske(inviteErr));
        return;
      }
      if (!inviteRow) {
        toast.error("Poziv nije pronađen. Javi se treneru.");
        return;
      }

      navigate(`/invite/${inviteRow.code}`, { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="phone-shell flex flex-col px-6 pb-10"
      style={{ paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 8px)" }}
    >
      <Link
        to="/"
        className="text-xs text-muted-foreground mb-8"
        style={{
          minHeight: 44,
          display: "inline-flex",
          alignItems: "center",
          padding: "0 10px",
          marginLeft: -10,
        }}
      >
        ← Nazad
      </Link>

      <div className="mb-8">
        <div className="h-12 w-12 rounded-2xl bg-athlete-soft text-athlete-soft-foreground flex items-center justify-center mb-4">
          <BrandGlyph className="h-4" />
        </div>
        <h1 className="font-display text-[32px] leading-tight font-bold tracking-tightest">
          Unesi kod poziva
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Kod od 6 cifara stiže ti mejlom od trenera.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            required
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="invite-token">Kod iz mejla</Label>
          <Input
            id="invite-token"
            value={token}
            onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            required
            className="mt-1.5"
          />
        </div>

        <Button type="submit" className="w-full mt-6" disabled={!canSubmit}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Nastavi
        </Button>
      </form>

      <p className="mt-4 text-[11px] text-center text-muted-foreground/70">
        Nemaš kod? Poziv može da ti pošalje samo trener kod koga treniraš.
      </p>
    </div>
  );
};

export default InviteCode;
