import { PhoneShell } from "@/components/PhoneShell";
import { PodrskaChat } from "@/components/trainer/web/podrska/PodrskaChat";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";

// Cet sa FitLink timom (Luno), kao PodrskaView u iOS aplikaciji. Na racunaru cet
// crta sopstveno zaglavlje; pristup ne zavisi od pretplate, kao ni na telefonu.
export default function TrainerPodrska() {
  const desktop = useDesktopWeb();
  return (
    <PhoneShell title="FitLink podrška" eyebrow="Tim FitLink-a" back="/trener/profil" hideDesktopHeader>
      <PodrskaChat saZaglavljem={desktop} />
    </PhoneShell>
  );
}
