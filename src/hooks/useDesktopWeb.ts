import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

const DESKTOP_BREAKPOINT = 1024;

// Isti bundle se koristi u nativnoj app i na app.fitlink.rs kao obican sajt.
// "Desktop web" = otvoren u pregledaču (ne u Capacitor wrapperu) NA sirokom
// ekranu. Native ostaje netaknut - Apple ne dozvoljava kupovni CTA u appu,
// pa hard-gejt sa Stripe placanjem sme da postoji SAMO ovde. Uzak pregledac
// (telefon otvara app.fitlink.rs) i dalje dobija isti mobilni prikaz kao app.
export function useDesktopWeb(): boolean {
  const native = Capacitor.isNativePlatform();
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= DESKTOP_BREAKPOINT,
  );

  useEffect(() => {
    if (native) return;
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    const onChange = () => setWide(window.innerWidth >= DESKTOP_BREAKPOINT);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, [native]);

  return !native && wide;
}
