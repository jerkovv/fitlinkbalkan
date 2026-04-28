import { useNavigate, useParams } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { Avatar, Button, Card, SectionTitle } from "@/components/ui-bits";
import { useState } from "react";
import { athletes } from "@/data/mock";
import { cn } from "@/lib/utils";
import { Banknote, QrCode, Receipt, Check } from "lucide-react";

const methods = [
  { key: "cash", icon: Banknote, label: "Keš" },
  { key: "qr", icon: QrCode, label: "QR" },
  { key: "bank", icon: Receipt, label: "Uplatnica" },
] as const;

const Payment = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const athlete = athletes.find((a) => a.id === id) ?? athletes[0];
  const [method, setMethod] = useState<(typeof methods)[number]["key"]>("cash");

  return (
    <PhoneShell back={`/trener/vezbaci/${athlete.id}`} title="Evidentiraj uplatu" eyebrow="Naplata">
      {/* Recipient */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Avatar initials={athlete.initials} tone="brand" />
          <div className="flex-1">
            <div className="text-[15px] font-semibold tracking-tight">{athlete.name}</div>
            <div className="text-[12.5px] text-muted-foreground">Mesečna · 5.000 RSD</div>
          </div>
        </div>
      </Card>

      {/* Amount */}
      <Card className="p-5 bg-gradient-brand-soft border-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
          Iznos
        </div>
        <div className="font-display text-[44px] leading-none font-bold tracking-tightest text-gradient-brand tnum">
          5.000 <span className="text-[20px] font-semibold text-foreground/60 align-baseline">RSD</span>
        </div>
        <div className="text-[12.5px] text-muted-foreground mt-2">Period: Maj 2025</div>
      </Card>

      {/* Methods */}
      <section>
        <SectionTitle>Način plaćanja</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {methods.map((m) => {
            const active = method === m.key;
            const Icon = m.icon;
            return (
              <button
                key={m.key}
                onClick={() => setMethod(m.key)}
                className={cn(
                  "rounded-2xl py-4 flex flex-col items-center gap-2 transition",
                  active
                    ? "bg-foreground text-background shadow-medium"
                    : "card-premium-hover text-foreground",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={2} />
                <span className="text-[12px] font-semibold">{m.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <Button
        variant="success"
        size="lg"
        fullWidth
        leadingIcon={<Check className="h-4 w-4" strokeWidth={2.5} />}
        onClick={() => nav("/trener")}
      >
        Potvrdi uplatu
      </Button>
    </PhoneShell>
  );
};

export default Payment;
