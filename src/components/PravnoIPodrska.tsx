import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
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

const klasaReda =
  "flex items-center justify-between gap-3 px-1 py-2.5 text-[13.5px] font-medium text-foreground active:opacity-60 transition";

// podrskaTo: trener na racunaru ima cet sa timom, pa "Podrška" vodi tamo umesto na mejl.
// izdavac: red sa izdavacem kao na ekranu Pravno u aplikaciji (trener na racunaru).
export const PravnoIPodrska = ({ podrskaTo, izdavac = false }: { podrskaTo?: string; izdavac?: boolean }) => (
  <Card className="p-5 space-y-3">
    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      Pravno i podrška
    </div>
    <div className="-mx-1">
      {stavke.map(({ label, href }) =>
        podrskaTo && href.startsWith("mailto:") ? (
          <Link key={href} to={podrskaTo} className={klasaReda}>
            {label}
            <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
          </Link>
        ) : (
          <a key={href} href={href} target="_blank" rel="noreferrer" className={klasaReda}>
            {label}
            <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
          </a>
        ),
      )}
    </div>
    <p className="text-[11.5px] text-muted-foreground">
      Za pitanja i prijavu problema: {SUPPORT_EMAIL}
    </p>
    {izdavac && <p className="text-[11.5px] text-muted-foreground">Izdavač: APGREJD LTD</p>}
  </Card>
);

export default PravnoIPodrska;
