import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui-bits";

// Pravne stranice i kontakt podrske. Stoji u profilu OBE uloge: App Review
// ocekuje da su politika privatnosti i uslovi dostupni IZ aplikacije, ne samo
// na signup ekranu, a support kontakt je zaseban zahtev.
//
// Linkovi idu na landing (fitlink.rs); target=_blank -> Capacitor ih otvara u
// sistemskom pregledacu, pa korisnik ne zaglavi u WebView-u bez dugmeta nazad.
const SUPPORT_EMAIL = "info@fitlink.rs";

const stavke = [
  { label: "Politika privatnosti", href: "https://fitlink.rs/privatnost" },
  { label: "Uslovi korišćenja", href: "https://fitlink.rs/uslovi" },
  { label: "Podrška", href: `mailto:${SUPPORT_EMAIL}` },
];

export const PravnoIPodrska = () => (
  <Card className="p-5 space-y-3">
    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      Pravno i podrška
    </div>
    <div className="-mx-1">
      {stavke.map(({ label, href }) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-3 px-1 py-2.5 text-[13.5px] font-medium text-foreground active:opacity-60 transition"
        >
          {label}
          <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
        </a>
      ))}
    </div>
    <p className="text-[11.5px] text-muted-foreground">
      Za pitanja i prijavu problema: {SUPPORT_EMAIL}
    </p>
  </Card>
);

export default PravnoIPodrska;
