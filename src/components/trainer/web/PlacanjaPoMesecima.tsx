import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/hooks/useConfirm";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { OBLASTI } from "@/components/pretplata/oblastiZakljucanja";
import { Avatar } from "@/components/ui-bits";
import { porukaGreske } from "@/lib/errorMessage";
import { cn } from "@/lib/utils";
import {
  CLANARINA_POLJA,
  type ClanarinaRed,
  danMeseca,
  jePlacena,
  kljucMeseca,
  mesecClanarine,
  nazivMeseca,
  postaviPlaceno,
  rsd,
} from "@/lib/clanarinePlaceno";

// Placanja po mesecima: svaka clanarina svakog klijenta, rasporedjena po mesecu
// u kom pocinje, sa kvadraticem "placeno". Stanje se cuva kroz
// trainer_set_membership_paid, koji i rucno unetoj clanarini napravi zapis o
// uplati, pa je zarada (paid_at) uvek ista kao ono sto je trener stiklirao.

type Clan = ClanarinaRed;
type Klijent = { athlete_id: string; athlete_name: string };

const BROJ_MESECI = 6;
const placena = jePlacena;
const dan = danMeseca;

const inicijali = (ime: string) => {
  const d = ime.trim().split(/\s+/);
  return ((d[0]?.[0] ?? "") + (d[1]?.[0] ?? "")).toUpperCase() || "??";
};

export const PlacanjaPoMesecima = ({
  klijenti,
  onPromena,
  osvezi,
}: {
  klijenti: Klijent[];
  onPromena?: () => void;
  // Menja se kad stranica ponovo ucita pregled (npr. posle izmene u prozoru clanarine).
  osvezi?: unknown;
}) => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const { locked, openLock } = usePretplataLock();
  const [clanarine, setClanarine] = useState<Clan[] | null>(null);
  const [pomak, setPomak] = useState(0); // 0 = poslednjih 6 meseci do danas
  const [samoNeplacene, setSamoNeplacene] = useState(false);
  const [radi, setRadi] = useState<string | null>(null);

  const ucitaj = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("memberships")
      .select(CLANARINA_POLJA)
      .eq("trainer_id", user.id);
    if (error) {
      toast.error(porukaGreske(error));
      setClanarine([]);
      return;
    }
    setClanarine((data as unknown as Clan[]) ?? []);
  };

  useEffect(() => { ucitaj(); }, [user, osvezi]);

  const meseci = useMemo(() => {
    const danas = new Date();
    return Array.from({ length: BROJ_MESECI }, (_, i) =>
      kljucMeseca(danas.getFullYear(), danas.getMonth() - (BROJ_MESECI - 1 - i) - pomak * BROJ_MESECI),
    );
  }, [pomak]);

  const imena = useMemo(() => new Map(klijenti.map((k) => [k.athlete_id, k.athlete_name])), [klijenti]);

  // Redovi: klijenti koji imaju bar jednu clanarinu u prikazanim mesecima.
  const redovi = useMemo(() => {
    if (!clanarine) return [];
    const uOpsegu = new Set(meseci);
    const poKlijentu = new Map<string, Map<string, Clan[]>>();
    for (const c of clanarine) {
      const m = mesecClanarine(c);
      if (!uOpsegu.has(m)) continue;
      const poMesecu = poKlijentu.get(c.athlete_id) ?? new Map<string, Clan[]>();
      poMesecu.set(m, [...(poMesecu.get(m) ?? []), c]);
      poKlijentu.set(c.athlete_id, poMesecu);
    }
    const sve = [...poKlijentu.entries()].map(([athlete_id, poMesecu]) => ({
      athlete_id,
      ime: imena.get(athlete_id) ?? "Klijent",
      poMesecu,
      imaNeplacenu: [...poMesecu.values()].some((l) => l.some((c) => !placena(c))),
    }));
    return sve
      .filter((r) => !samoNeplacene || r.imaNeplacenu)
      .sort((a, b) => a.ime.localeCompare(b.ime, "sr"));
  }, [clanarine, meseci, imena, samoNeplacene]);

  // Zbir po mesecu racuna sve clanarine u mesecu, i kad je filter ukljucen.
  const zbir = useMemo(() => {
    const z = new Map<string, { ukupno: number; placeno: number; iznos: number; duguje: number }>();
    for (const m of meseci) z.set(m, { ukupno: 0, placeno: 0, iznos: 0, duguje: 0 });
    for (const c of clanarine ?? []) {
      const s = z.get(mesecClanarine(c));
      if (!s) continue;
      s.ukupno++;
      if (placena(c)) {
        s.placeno++;
        s.iznos += Number(c.price ?? 0);
      } else {
        s.duguje += Number(c.price ?? 0);
      }
    }
    return z;
  }, [clanarine, meseci]);

  const promeni = async (c: Clan, ime: string) => {
    if (locked) return openLock(OBLASTI.naplata);
    if (radi) return;
    const novo = !placena(c);
    if (!novo) {
      const ok = await confirm({
        title: "Skinuti oznaku plaćeno?",
        description: `${ime} · ${c.plan_name ?? "Članarina"} · ${nazivMeseca(mesecClanarine(c), false)}. Iznos više neće ulaziti u zaradu.`,
        confirmLabel: "Nije plaćeno",
        destructive: true,
      });
      if (!ok) return;
    }
    setRadi(c.id);
    const { error, red } = await postaviPlaceno(c, novo);
    setRadi(null);
    if (error) return toast.error(porukaGreske(error));
    setClanarine((prev) => (prev ?? []).map((x) => (x.id === c.id ? red : x)));
    toast.success(novo ? "Označeno kao plaćeno" : "Označeno kao neplaćeno");
    onPromena?.();
  };

  // Tailwind klasu mora da vidi celu u izvoru, zato 6 stoji upisano (BROJ_MESECI).
  const mreza = "grid grid-cols-[minmax(180px,1.3fr)_repeat(6,minmax(0,1fr))] items-stretch";

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[17px] font-bold tracking-tight">Plaćanja po mesecima</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Svaka članarina je u mesecu kad počinje. Štikliraj je kad je klijent plati.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSamoNeplacene((v) => !v)}
            aria-pressed={samoNeplacene}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-3.5 text-[12.5px] font-semibold transition",
              samoNeplacene
                ? "border-transparent bg-destructive-soft text-destructive-soft-foreground"
                : "border-hairline bg-surface text-muted-foreground hover:text-foreground",
            )}
          >
            Samo neplaćene
          </button>
          <div className="inline-flex items-center rounded-full border border-hairline bg-surface">
            <button
              type="button"
              onClick={() => setPomak((p) => p + 1)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground"
              aria-label="Ranijih 6 meseci"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[150px] text-center text-[12.5px] font-semibold tnum">
              {nazivMeseca(meseci[0])} do {nazivMeseca(meseci[meseci.length - 1])}
            </span>
            <button
              type="button"
              onClick={() => setPomak((p) => Math.max(0, p - 1))}
              disabled={pomak === 0}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground disabled:opacity-30"
              aria-label="Kasnijih 6 meseci"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="card-premium overflow-hidden">
        <div className={cn(mreza, "border-b border-hairline bg-surface-2/60 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground")}>
          <span className="px-5 py-2.5">Klijent</span>
          {meseci.map((m) => (
            <span key={m} className="border-l border-hairline px-3 py-2.5 tnum">{nazivMeseca(m)}</span>
          ))}
        </div>

        {clanarine === null ? (
          <div className="flex justify-center py-14">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : redovi.length === 0 ? (
          <p className="px-5 py-12 text-center text-[13px] text-muted-foreground">
            {samoNeplacene ? "Sve članarine u ovim mesecima su plaćene." : "U ovim mesecima nema članarina."}
          </p>
        ) : (
          <div className="divide-y divide-hairline">
            {redovi.map((r) => (
              <div key={r.athlete_id} className={mreza}>
                <div className="flex min-w-0 items-center gap-3 px-5 py-3">
                  <Avatar initials={inicijali(r.ime)} tone="brand" size="sm" className="ring-0" />
                  <span className="text-[14px] font-semibold leading-tight tracking-tight">{r.ime}</span>
                </div>
                {meseci.map((m) => {
                  const lista = r.poMesecu.get(m) ?? [];
                  return (
                    <div key={m} className="flex min-w-0 flex-col justify-center gap-1.5 border-l border-hairline px-2 py-2">
                      {lista.length === 0 ? (
                        <span className="px-1 text-[13px] text-muted-foreground/50">-</span>
                      ) : (
                        lista.map((c) => {
                          const ok = placena(c);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              role="checkbox"
                              aria-checked={ok}
                              onClick={() => promeni(c, r.ime)}
                              disabled={radi === c.id}
                              title={`${c.plan_name ?? "Članarina"}${c.starts_on ? ` · od ${dan(c.starts_on)}` : ""}`}
                              className={cn(
                                "flex w-full min-w-0 items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition",
                                ok
                                  ? "border-transparent bg-success-soft hover:opacity-85"
                                  : "border-destructive/30 bg-destructive-soft/50 hover:bg-destructive-soft",
                              )}
                            >
                              <span
                                className={cn(
                                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2",
                                  ok
                                    ? "border-success-soft-foreground bg-success-soft-foreground text-white"
                                    : "border-destructive-soft-foreground/60 bg-surface",
                                )}
                              >
                                {radi === c.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                ) : ok ? (
                                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                                ) : null}
                              </span>
                              <span className="min-w-0">
                                <span
                                  className={cn(
                                    "block text-[12px] font-semibold leading-tight",
                                    ok ? "text-success-soft-foreground" : "text-destructive-soft-foreground",
                                  )}
                                >
                                  {ok ? "Plaćeno" : "Nije plaćeno"}
                                </span>
                                <span className="block text-[11px] leading-tight text-muted-foreground tnum">
                                  {c.price ? rsd(Number(c.price)) : (c.plan_name ?? "Članarina")}
                                </span>
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {clanarine !== null && (
          <div className={cn(mreza, "border-t border-hairline bg-surface-2/60")}>
            <span className="px-5 py-3 text-[12px] font-semibold text-muted-foreground">Ukupno u mesecu</span>
            {meseci.map((m) => {
              const s = zbir.get(m)!;
              return (
                <div key={m} className="border-l border-hairline px-3 py-2.5">
                  {s.ukupno === 0 ? (
                    <span className="text-[12px] text-muted-foreground/50">-</span>
                  ) : (
                    <>
                      <div className="text-[12.5px] font-semibold tnum">
                        {s.placeno} od {s.ukupno} plaćeno
                      </div>
                      <div className="text-[11px] text-muted-foreground tnum">{rsd(s.iznos)}</div>
                      {s.duguje > 0 && (
                        <div className="text-[11px] text-destructive-soft-foreground tnum">duguje {rsd(s.duguje)}</div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
