import { useEffect, useState } from "react";

const DESKTOP_BREAKPOINT = 1024;

// "Dashboard host" = ISTI bundle sluzi i app.fitlink.rs (native app + mobilni
// web, nedirano) i fitlink.rs/dashboard (Vercel rewrite proxy - vidi
// fitlink-landing/vercel.json). Sidebar/desktop raspored se pali SAMO na
// fitlink.rs, nikad na app.fitlink.rs, cak ni na sirokom ekranu - korisnik je
// izricito trazio da app.fitlink.rs ostane netaknut.
// "fitlink.rs" i "www.fitlink.rs" oba zive bez preusmerenja jednog na drugo
// (Vercel ih drzi kao odvojene aliase istog projekta) - provera mora da
// pogodi oba, inace basename ostaje undefined na www. varijanti i SVE rute
// pod /dashboard/* promasuju u NotFound ("not found" na telefonu koji je
// otvorio bas www. link).
const DASHBOARD_HOSTNAMES = new Set(["fitlink.rs", "www.fitlink.rs"]);

export function isDashboardHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (DASHBOARD_HOSTNAMES.has(host)) return true;

  // Lokalni razvoj: inace se desktop dashboard NE moze isprobati pre objave,
  // jer zavisi od imena domena. Na localhost-u su dostupne obe verzije, po
  // putanji: /dashboard/* daje desktop raspored (kao fitlink.rs/dashboard),
  // sve ostalo mobilni (kao app.fitlink.rs). Nikad ne pogadja produkciju -
  // localhost tamo ne postoji.
  if (host === "localhost" || host === "127.0.0.1") {
    return window.location.pathname.startsWith("/dashboard");
  }
  return false;
}

// Posle odjave (ili brisanja naloga) treba stici na login. Na app.fitlink.rs
// to je React-ova sopstvena /auth forma - jedina koja tamo postoji. Na
// fitlink.rs/dashboard bi navigate("/auth") (basename-relativno) zavrsio na
// /dashboard/auth, unutrasnjoj rezervnoj formi umesto na lepoj, zvanicnoj
// /login stranici sa sajta - zato ide PRAVA navigacija van React Router-a
// (druga je to statička stranica, ne ruta u ovom app-u).
export function redirectToAuth(navigate: (path: string, opts?: { replace?: boolean }) => void) {
  if (isDashboardHost()) {
    window.location.href = "https://fitlink.rs/login";
    return;
  }
  navigate("/auth", { replace: true });
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
