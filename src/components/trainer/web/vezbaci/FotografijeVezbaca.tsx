import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Images, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { porukaGreske } from "@/lib/errorMessage";
import { supabase } from "@/lib/supabase";
import { danIzTeksta } from "./aktivnost";

type Foto = { id: string; url: string; datum: string; beleska: string | null };

const fmtDatum = (s: string | null) =>
  s
    ? danIzTeksta(s).toLocaleDateString("sr-Latn-RS", { day: "numeric", month: "short", year: "numeric" })
    : "";

/** Fotografije koje je vezbac podelio sa trenerom i ulaz u karticu "Pre i posle". */
export const FotografijeVezbaca = ({ athleteId }: { athleteId: string }) => {
  const [fotke, setFotke] = useState<Foto[] | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [pokusaj, setPokusaj] = useState(0);
  const [otvorena, setOtvorena] = useState<Foto | null>(null);

  useEffect(() => {
    let vazi = true;
    setGreska(null);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("progress_photos")
          .select("id, storage_path, taken_on, notes")
          .eq("athlete_id", athleteId)
          .eq("shared_with_trainer", true)
          .order("taken_on", { ascending: false })
          .limit(24);
        if (error) throw error;
        const redovi = (data ?? []) as {
          id: string;
          storage_path: string;
          taken_on: string | null;
          notes: string | null;
        }[];
        let potpisi = new Map<string, string>();
        if (redovi.length > 0) {
          const { data: s, error: sErr } = await supabase.storage
            .from("progress-photos")
            .createSignedUrls(redovi.map((r) => r.storage_path), 3600);
          if (sErr) throw sErr;
          potpisi = new Map(
            (s ?? []).flatMap((x) => (x.path && x.signedUrl ? [[x.path, x.signedUrl] as [string, string]] : [])),
          );
        }
        if (!vazi) return;
        setFotke(
          redovi.flatMap((r) => {
            const url = potpisi.get(r.storage_path);
            return url ? [{ id: r.id, url, datum: fmtDatum(r.taken_on), beleska: r.notes }] : [];
          }),
        );
      } catch (e) {
        if (!vazi) return;
        const poruka = porukaGreske(e);
        setGreska(poruka);
        toast.error(poruka);
      }
    })();
    return () => {
      vazi = false;
    };
  }, [athleteId, pokusaj]);

  return (
    <section className="card-premium p-5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Napredak</div>
          <h2 className="font-display text-[19px] font-bold tracking-tight">Fotografije</h2>
        </div>
        {fotke && fotke.length >= 2 && (
          <Link
            to={`/trener/objave?kartica=pre-posle&vezbac=${athleteId}`}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-primary-soft px-3 text-[12.5px] font-semibold text-primary-soft-foreground transition hover:brightness-125"
          >
            <Images className="h-3.5 w-3.5" />
            Pre i posle
          </Link>
        )}
      </div>

      {greska && fotke == null ? (
        <div className="mt-4 text-center">
          <p className="text-[13px] text-muted-foreground">{greska}</p>
          <Button variant="outline" onClick={() => setPokusaj((n) => n + 1)} className="mt-3 h-9 rounded-full px-4 text-[13px]">
            Pokušaj ponovo
          </Button>
        </div>
      ) : fotke == null ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Učitavanje" />
        </div>
      ) : fotke.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 py-3 text-center">
          <Camera className="h-5 w-5 text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">Vežbač još nije podelio nijednu fotografiju.</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {fotke.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setOtvorena(f)}
              aria-label={`Otvori fotografiju od ${f.datum}`}
              className="relative aspect-[3/4] overflow-hidden rounded-xl bg-surface-2 transition hover:brightness-110"
            >
              <img src={f.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] font-semibold text-white tnum">
                {f.datum}
              </span>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!otvorena} onOpenChange={(o) => !o && setOtvorena(null)}>
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          {otvorena && (
            <>
              <img src={otvorena.url} alt="" className="max-h-[75vh] w-full bg-black object-contain" />
              <div className="space-y-1 px-5 pb-5">
                <DialogTitle className="text-[14px] font-semibold">{otvorena.datum}</DialogTitle>
                {otvorena.beleska && <p className="text-[13px] text-muted-foreground">{otvorena.beleska}</p>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
};
