import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Auth from "@/pages/Auth";
import { isDashboardHost, useDesktopWeb } from "@/hooks/useDesktopWeb";
import { OtvoriAplikaciju } from "@/components/OtvoriAplikaciju";
import { usePonoc } from "@/components/trainer/web/usePonoc";

const PRAVI_DOMEN = new Set(["fitlink.rs", "www.fitlink.rs"]);

const TamnaPrijava = () => {
  usePonoc();
  return <Auth />;
};

// Ruta /auth. Na app.fitlink.rs je to obicna forma za prijavu. Na fitlink.rs/dashboard stara
// svetla forma se vise ne vidi: uzak prozor dobija "Otvori aplikaciju na telefonu", a sirok ide
// na tamnu prijavu sa sajta (fitlink.rs/login), koja posle prijave vraca nazad na dashboard.
// Na localhost-u ostaje forma, da se dashboard moze probati i bez sajta.
export function DashboardPrijava() {
  const desktop = useDesktopWeb();
  const location = useLocation();
  const naSajtu = isDashboardHost() && PRAVI_DOMEN.has(window.location.hostname);
  const odakle = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const nazad = `/dashboard${odakle?.pathname && odakle.pathname !== "/auth" ? odakle.pathname + (odakle.search ?? "") : "/trener"}`;

  useEffect(() => {
    if (naSajtu && desktop) {
      window.location.replace(`https://${window.location.hostname}/login?next=${encodeURIComponent(nazad)}`);
    }
  }, [naSajtu, desktop, nazad]);

  if (!isDashboardHost()) return <Auth />;
  if (!desktop) return <OtvoriAplikaciju />;
  if (naSajtu) return <div className="min-h-[100dvh]" style={{ backgroundColor: "#0B0A10" }} />;
  return <TamnaPrijava />;
}

export default DashboardPrijava;
