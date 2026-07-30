import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dumbbell } from "lucide-react";

const InviteCode = () => {
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    navigate(`/invite/${code.trim().toLowerCase()}`);
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
          <Dumbbell className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <h1 className="font-display text-[32px] leading-tight font-bold tracking-tightest">
          Unesi kod poziva
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Kod ti stiže mejlom od trenera. Ako si dobio link, možeš i samo da ga otvoriš.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="invite-code">Kod poziva</Label>
          <Input
            id="invite-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            className="mt-1.5"
          />
        </div>

        <Button type="submit" className="w-full mt-6" disabled={!code.trim()}>
          Proveri kod
        </Button>
      </form>

      <p className="mt-4 text-[11px] text-center text-muted-foreground/70">
        Nemaš kod? Poziv može da ti pošalje samo trener kod koga treniraš.
      </p>
    </div>
  );
};

export default InviteCode;
