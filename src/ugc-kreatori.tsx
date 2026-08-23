// Zaseban Vite entry za fitlink.rs/ugc-kreatori (vidi ugc-kreatori.html).
// Stranica je javna i nema veze sa app ljuskom: bez auth-a, bez rutera, bez
// Capacitor-a. Razlog za poseban HTML: index.html je deljen sa celim app-om, a
// crawleri (OG, Google) ne izvrsavaju JS, pa title/description/OG slika moraju
// da stoje staticki u HTML-u bas ove stranice.
import { createRoot } from "react-dom/client";
import UgcKreatori from "./pages/UgcKreatori";
import "./index.css";

createRoot(document.getElementById("root")!).render(<UgcKreatori />);
