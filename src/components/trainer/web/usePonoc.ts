import { useEffect } from "react";

// Tamna "Ponoc" paleta za trenerov dashboard na racunaru. Klase idu na <html>,
// a ne na okvir, jer Radix prozori (Dialog, Sheet, Popover) crtaju van #root i
// inace bi ostali svetli. Skidaju se kad se okvir demontira. Pismo Poppins vise
// ne ucitava ovaj hook: cela web aplikacija ga nosi iz index.html.
export function usePonoc() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("dark", "ponoc");
    return () => {
      html.classList.remove("dark", "ponoc");
    };
  }, []);
}
