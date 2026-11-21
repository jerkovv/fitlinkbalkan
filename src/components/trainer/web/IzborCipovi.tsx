import { cn } from "@/lib/utils";

/** Ponudjene vrednosti polja kao na telefonu: klik bira, drugi klik na isti brise izbor. */
export const IzborCipovi = ({
  oznaka,
  opcije,
  vrednost,
  naPromenu,
}: {
  oznaka: string;
  opcije: readonly string[];
  vrednost: string;
  naPromenu: (v: string) => void;
}) => (
  <div role="group" aria-label={oznaka} className="mt-1.5 flex flex-wrap gap-1.5">
    {opcije.map((o) => {
      const izabrana = vrednost === o;
      return (
        <button
          key={o}
          type="button"
          aria-pressed={izabrana}
          onClick={() => naPromenu(izabrana ? "" : o)}
          className={cn(
            "h-[34px] rounded-full border px-3 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            izabrana
              ? "border-transparent bg-primary text-primary-foreground"
              : "border-hairline bg-surface text-muted-foreground hover:text-foreground",
          )}
        >
          {o}
        </button>
      );
    })}
  </div>
);
