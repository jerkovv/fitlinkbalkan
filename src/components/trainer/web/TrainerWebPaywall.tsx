import { useEffect, useRef, useState } from "react";
import {
  loadStripe,
  type Stripe,
  type StripeEmbeddedCheckout,
  type StripeEmbeddedCheckoutOptions,
} from "@stripe/stripe-js";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { BrandGlyph } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { porukaGreske } from "@/lib/errorMessage";

// Publishable key - bezbedan za frontend (isti kao na fitlink.rs/pretplata).
const STRIPE_PK =
  "pk_live_51MTr3gDvGDGUhIwJKKq1LQG0jzkGTFtvEvTmua70FlqhJhD29LPIBWllvcDE5MOkqijPUsoiSDT0RA9SZQIVqpNC00B7QhNu6D";

// @stripe/stripe-js@9's tipovi zovu ovo createEmbeddedCheckoutPage, ali skripta
// koju loadStripe ucitava sa js.stripe.com/v3 (isti runtime kao Stripe(pk) na
// fitlink.rs/pretplata, provereno u produkciji) izlaze metodu pod starim
// imenom. Uzak tip umesto any, da ostane bar donekle proveren na kompajliranju.
type StripeWithEmbeddedCheckout = Stripe & {
  initEmbeddedCheckout(
    options: StripeEmbeddedCheckoutOptions,
  ): Promise<StripeEmbeddedCheckout>;
};

let stripePromise: ReturnType<typeof loadStripe> | null = null;
const getStripe = () => {
  if (!stripePromise) stripePromise = loadStripe(STRIPE_PK);
  return stripePromise;
};

type Plan = "monthly" | "yearly";

const FEATURES = [
  "Neograničen broj vežbača",
  "Programi, ishrana, termini i chat",
  "Uživo praćenje i Apple Watch",
  "Naplata članarina sa IPS QR kodom",
];

interface Props {
  /** Neutralna činjenica iz statusa pretplate (ista logika kao mobilni lock). */
  fact: string | null;
}

// Tvrdi gejt za desktop web: dok trener nema aktivnu pretplatu, ovo je JEDINO
// što vidi - nema dashboarda iza. Apple ne dozvoljava kupovni CTA u nativnoj
// app (zato TrainerLayout ovo montira SAMO kad useDesktopWeb() vrati true),
// ali ovde nismo u App Store-u, pa je prava Stripe kupovina u redu - ista
// putanja (create-checkout edge funkcija) koja već radi na fitlink.rs/pretplata.
export const TrainerWebPaywall = ({ fact }: Props) => {
  const { signOut } = useAuth();
  const [plan, setPlan] = useState<Plan>("monthly");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [done, setDone] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const checkoutRef = useRef<StripeEmbeddedCheckout | null>(null);

  useEffect(() => {
    return () => {
      checkoutRef.current?.destroy();
      checkoutRef.current = null;
    };
  }, []);

  const startCheckout = async (chosen: Plan) => {
    setStarting(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("create-checkout", {
        body: { plan: chosen },
      });
      if (fnError) throw fnError;
      const clientSecret = (data as { clientSecret?: string } | null)?.clientSecret;
      if (!clientSecret) throw new Error((data as { error?: string } | null)?.error ?? "Greška");

      const stripe = await getStripe();
      if (!stripe) throw new Error("Stripe nije dostupan");

      setCheckoutOpen(true);
      // Sledeci tick: container je tek sad u DOM-u (checkoutOpen upravo postavljen).
      requestAnimationFrame(() => {
        void (async () => {
          const embedded = await (stripe as StripeWithEmbeddedCheckout).initEmbeddedCheckout({
            clientSecret,
            onComplete: () => {
              // Access se ne otključava odavde - TrainerLayout već polluje na
              // svakih 5s dok je locked. Samo javimo korisniku da je gotovo;
              // paywall sam nestaje čim poll uhvati aktivnu pretplatu.
              setDone(true);
              checkoutRef.current?.destroy();
              checkoutRef.current = null;
            },
          });
          checkoutRef.current = embedded;
          if (containerRef.current) embedded.mount(containerRef.current);
        })();
      });
    } catch (e) {
      setError(porukaGreske(e));
      setCheckoutOpen(false);
    } finally {
      setStarting(false);
    }
  };

  const closeCheckout = () => {
    checkoutRef.current?.destroy();
    checkoutRef.current = null;
    setCheckoutOpen(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-[480px]">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-brand shadow-brand mb-5">
            <BrandGlyph className="h-6 text-white" />
          </div>
          <h1 className="font-display text-[26px] font-bold tracking-tightest leading-tight">
            Aktiviraj FitLink pretplatu
          </h1>
          <p className="text-[14px] text-muted-foreground mt-2 max-w-[360px]">
            Prvih 30 dana besplatno. Bez pretplate, trenerski deo nije dostupan.
            {fact ? ` ${fact}` : ""}
          </p>
        </div>

        {done ? (
          <div className="rounded-2xl border border-hairline bg-surface p-8 text-center space-y-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
            <p className="text-[14px] font-semibold">Aktiviramo tvoju pretplatu…</p>
            <p className="text-[13px] text-muted-foreground">
              Traje par sekundi, ekran se sam osvežava.
            </p>
          </div>
        ) : checkoutOpen ? (
          <div className="rounded-2xl border border-hairline bg-surface overflow-hidden">
            <div ref={containerRef} className="min-h-[420px]" />
            <button
              type="button"
              onClick={closeCheckout}
              className="w-full text-center text-[13px] font-semibold text-muted-foreground hover:text-foreground py-3 border-t border-hairline transition"
            >
              Nazad na izbor plana
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-hairline bg-surface p-6">
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-surface-2 mb-6">
              {(["monthly", "yearly"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlan(p)}
                  className={cn(
                    "rounded-lg py-2 text-[13px] font-semibold transition",
                    plan === p
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {p === "monthly" ? "Mesečno" : "Godišnje"}
                </button>
              ))}
            </div>

            <div className="mb-6">
              <div className="font-display text-[34px] font-bold tracking-tightest leading-none">
                {plan === "monthly" ? "49 €" : "349 €"}
                <span className="text-[15px] font-medium text-muted-foreground">
                  {" "}/ {plan === "monthly" ? "mesec" : "godina"}
                </span>
              </div>
              <div className="text-[12.5px] text-muted-foreground mt-1.5">
                {plan === "monthly"
                  ? "Prvih 30 dana besplatno, bez kartice na uvid."
                  : "Oko 29 €/mesec · ušteda 239 € u odnosu na mesečnu."}
              </div>
            </div>

            <ul className="space-y-2 mb-6">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
                  <Check className="h-4 w-4 text-primary shrink-0" strokeWidth={2.5} />
                  {f}
                </li>
              ))}
            </ul>

            {error && (
              <p className="text-[12.5px] text-destructive mb-4">{error}</p>
            )}

            <Button
              size="lg"
              className="w-full"
              disabled={starting}
              onClick={() => startCheckout(plan)}
            >
              {starting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {plan === "monthly" ? "Probaj 30 dana besplatno" : "Pretplati se godišnje"}
            </Button>
          </div>
        )}

        <button
          type="button"
          onClick={() => void signOut()}
          className="w-full text-center text-[12.5px] text-muted-foreground hover:text-foreground mt-6 transition"
        >
          Odjavi se
        </button>
      </div>
    </div>
  );
};

export default TrainerWebPaywall;
