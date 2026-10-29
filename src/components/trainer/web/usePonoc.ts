import { useEffect } from "react";

// Tamna "Ponoc" paleta i pismo Poppins za trenerov dashboard na racunaru. Klase
// idu na <html>, a ne na okvir, jer Radix prozori (Dialog, Sheet, Popover) crtaju
// van #root i inace bi ostali svetli. Skidaju se kad se okvir demontira.
const FONT_ID = "ponoc-poppins";
const FONT_URL =
  "https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,500;0,600;0,700;1,600;1,700&display=swap";

export function usePonoc() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("dark", "ponoc");
    if (!document.getElementById(FONT_ID)) {
      const link = document.createElement("link");
      link.id = FONT_ID;
      link.rel = "stylesheet";
      link.href = FONT_URL;
      document.head.appendChild(link);
    }
    return () => {
      html.classList.remove("dark", "ponoc");
    };
  }, []);
}
