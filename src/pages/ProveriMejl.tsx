import { useEffect, useState } from "react";
import { useLocation, useSearchParams, Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { porukaGreske } from "@/lib/errorMessage";
import { toast } from "sonner";

const RESEND_SECONDS = 60;

export default function ProveriMejl() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const email =
    (location.state as { email?: string } | null)?.email ?? searchParams.get("email") ?? "";

  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const resend = async () => {
    if (!email || sending || cooldown > 0) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      toast.success("Mejl je ponovo poslat.");
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      toast.error(porukaGreske(err));
    } finally {
      setSending(false);
    }
  };

  const mm = Math.floor(cooldown / 60);
  const ss = cooldown % 60;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f7fb] px-5">
      <div className="w-full max-w-md rounded-3xl bg-white border border-[#ececf2] shadow-sm px-7 py-10 text-center">
        <div className="text-[22px] font-extrabold tracking-tight text-[#16161f] mb-8">
          Fit<span className="text-[#8935E9]">Link</span>
        </div>

        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 rounded-2xl bg-[#f1e9fd] flex items-center justify-center">
            <Mail className="h-8 w-8 text-[#8935E9]" strokeWidth={2.2} />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-[#16161f] mb-2">Proveri mejl</h1>
        <p className="text-[15px] leading-relaxed text-[#5b5b66] mb-8">
          Poslali smo link za potvrdu na {email ? <strong>{email}</strong> : "tvoju adresu"}. Otvori
          ga da aktiviraš nalog.
        </p>

        <button
          type="button"
          onClick={resend}
          disabled={sending || cooldown > 0}
          className="w-full rounded-2xl bg-[#8935E9] text-white font-semibold py-3.5 text-[15px] disabled:opacity-50 transition"
        >
          {cooldown > 0 ? `Pošalji ponovo za ${mm}:${String(ss).padStart(2, "0")}` : "Pošalji ponovo"}
        </button>

        <Link to="/auth" className="block mt-5 text-[13px] font-medium text-[#8935E9]">
          Nazad na prijavu
        </Link>

        <p className="mt-6 text-[12px] text-[#8c8c99]">
          Nema ga ni u spam folderu? Proveri da li si tačno uneo adresu.
        </p>
      </div>
    </div>
  );
}
