import { Lock, Play } from "lucide-react";
import { OBLASTI } from "@/components/pretplata/oblastiZakljucanja";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";

type Props = {
  slika: string | null | undefined;
  naziv: string;
};

// Bez aktivne pretplate vezba ostaje u punom izgledu, a snimak se ne ucitava. Dugme za
// pustanje je tu, sa malim katancem, a klik objasni sta se otkljucava.
export const ZakljucanSnimak = ({ slika, naziv }: Props) => {
  const { openLock } = usePretplataLock();
  return (
    <button
      type="button"
      onClick={() =>
        openLock({
          naslov: OBLASTI.biblioteka.naslov,
          tekst: OBLASTI.biblioteka.tekst,
          stavke: OBLASTI.biblioteka.stavke,
          slika,
          naziv,
        })
      }
      aria-label={`Pusti snimak: ${naziv}. Dostupno uz pretplatu`}
      className="group absolute inset-0 overflow-hidden bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
    >
      {slika ? (
        <img
          src={slika}
          alt=""
          className="absolute inset-0 h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
        />
      ) : (
        <span aria-hidden className="absolute inset-0 bg-gradient-brand-soft" />
      )}
      {/* U uglu, da ne pokriva pokret na slici. */}
      <span className="absolute bottom-3 left-3 inline-flex h-10 items-center gap-2 rounded-full bg-[#0B0A10] pl-3.5 pr-1.5 text-[13px] font-semibold text-white shadow-lg transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none">
        <Play className="h-3.5 w-3.5 fill-white text-white" strokeWidth={1.5} />
        Pusti
        <span className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-brand">
          <Lock className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
        </span>
      </span>
    </button>
  );
};
