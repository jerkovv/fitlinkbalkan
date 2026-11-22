import type { KeyboardEvent, SyntheticEvent } from "react";
import type { ZakljucanKontekst } from "./PretplataLockContext";
import { usePretplataLock } from "./usePretplataLock";

// Sve sto u zoni menja podatke: polja, prekidaci, izbori, meniji i rucke za prevlacenje.
const KONTROLE = [
  "input",
  "textarea",
  "select",
  "button",
  "label",
  '[role="button"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="combobox"]',
  '[role="slider"]',
  '[role="menuitem"]',
  '[contenteditable="true"]',
  '[draggable="true"]',
].join(",");

// Kretanje kroz stranicu i precice ostaju; sve ostalo je pokusaj izmene.
const SLOBODNI_TASTERI = new Set(["Tab", "Escape", "Shift", "Control", "Alt", "Meta", "CapsLock"]);

const kontrolaIzDogadjaja = (e: SyntheticEvent) => {
  const cilj = e.target;
  if (!(cilj instanceof Element)) return null;
  const k = cilj.closest(KONTROLE);
  return k && !k.closest("[data-slobodno]") ? k : null;
};

// Dogadjaji za oblast koja se menja direktno na ekranu, bez posebnog prozora. Bez pretplate
// prvi pokusaj (klik, kucanje, prevlacenje) otvara objasnjenje, pa trener ne popunjava
// formu uzalud. Sadrzaj ostaje u punom izgledu. Kontrola koja samo prikazuje (kopiranje,
// otvaranje, filter) dobija data-slobodno.
export function useZakljucanaZona(kontekst?: ZakljucanKontekst) {
  const { locked, openLock } = usePretplataLock();

  const zadrzi = (e: SyntheticEvent) => {
    if (!locked || !kontrolaIzDogadjaja(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const otvori = (e: SyntheticEvent) => {
    if (!locked || !kontrolaIzDogadjaja(e)) return;
    e.preventDefault();
    e.stopPropagation();
    openLock(kontekst);
  };

  const naTaster = (e: KeyboardEvent) => {
    if (!locked || !kontrolaIzDogadjaja(e)) return;
    if (SLOBODNI_TASTERI.has(e.key) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() !== "v")) return;
    otvori(e);
  };

  return {
    onPointerDownCapture: zadrzi,
    onMouseDownCapture: zadrzi,
    onDragStartCapture: zadrzi,
    onClickCapture: otvori,
    onKeyDownCapture: naTaster,
    onPasteCapture: otvori,
    onDropCapture: otvori,
  };
}
