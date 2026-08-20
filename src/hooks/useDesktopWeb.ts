import { useEffect, useState } from "react";

const DESKTOP_BREAKPOINT = 1024;

// "Dashboard host" = ISTI bundle sluzi i app.fitlink.rs (native app + mobilni
// web, nedirano) i fitlink.rs/dashboard (Vercel rewrite proxy - vidi
// fitlink-landing/vercel.json). Sidebar/desktop raspored se pali SAMO na
// fitlink.rs, nikad na app.fitlink.rs, cak ni na sirokom ekranu - korisnik je
// izricito trazio da app.fitlink.rs ostane netaknut.
export function isDashboardHost(): boolean {
  return typeof window !== "undefined" && window.location.hostname === "fitlink.rs";
}

export function useDesktopWeb(): boolean {
  const dashboardHost = isDashboardHost();
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= DESKTOP_BREAKPOINT,
  );

  useEffect(() => {
    if (!dashboardHost) return;
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    const onChange = () => setWide(window.innerWidth >= DESKTOP_BREAKPOINT);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, [dashboardHost]);

  return dashboardHost && wide;
}
