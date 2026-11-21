import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Camera, Dumbbell, Flame, Footprints, Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  FullScreenSheet,
  FullScreenSheetFooter,
  FullScreenSheetScroll,
} from "@/components/ui/full-screen-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { porukaGreske } from "@/lib/errorMessage";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { brojIzTeksta, brojTekst } from "./aktivnost";
import { LiceVezbaca } from "./LiceVezbaca";

type Podaci = {
  ime: string;
  telefon: string;
  godina: string;
  pol: string;
  visina: string;
  tezina: string;
  cilj: string;
  beleska: string;
};

const PRAZNO: Podaci = { ime: "", telefon: "", godina: "", pol: "", visina: "", tezina: "", cilj: "", beleska: "" };

const POLOVI = [
  { k: "male", naziv: "Muški" },
  { k: "female", naziv: "Ženski" },
  { k: "other", naziv: "Drugo" },
];

const CILJEVI = [
  { k: "lose_weight", naziv: "Mršavljenje", Ikona: Flame },
  { k: "gain_muscle", naziv: "Masa", Ikona: Dumbbell },
  { k: "endurance", naziv: "Izdržljivost", Ikona: Footprints },
  { k: "mobility", naziv: "Mobilnost", Ikona: Activity },
  { k: "general", naziv: "Opšte stanje", Ikona: Heart },
];

const ceoBroj = (s: string): number | null => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);
const tekstIliNull = (s: string) => s.trim() || null;

// Kvadrat 600 x 600 iz sredine slike, JPEG 0,82: isto sto salje telefon.
const pripremiSliku = async (fajl: File): Promise<Blob> => {
  const bitmapa = await createImageBitmap(fajl);
  const strana = 600;
  const najmanja = Math.min(bitmapa.width, bitmapa.height);
  const platno = document.createElement("canvas");
  platno.width = strana;
  platno.height = strana;
  const ctx = platno.getContext("2d");
  if (!ctx) throw new Error("Slika ne može da se pripremi.");
  ctx.drawImage(
    bitmapa,
    (bitmapa.width - najmanja) / 2,
    (bitmapa.height - najmanja) / 2,
    najmanja,
    najmanja,
    0,
    0,
    strana,
    strana,
  );
  bitmapa.close();
  return new Promise((resolve, reject) => {
    platno.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Slika ne može da se pripremi."))),
      "image/jpeg",
      0.82,
    );
  });
};

export const UrediVezbacaSheet = ({
  open,
  onClose,
  vezbacId,
  ime,
  onSacuvano,
}: {
  open: boolean;
  onClose: () => void;
  vezbacId: string;
  ime: string;
  onSacuvano: () => void;
}) => {
  const { locked, openLock } = usePretplataLock();
  const [p, setP] = useState<Podaci>(PRAZNO);
  const [pocetno, setPocetno] = useState<Podaci>(PRAZNO);
  const [slika, setSlika] = useState<string | null>(null);
  const [novaSlika, setNovaSlika] = useState<File | null>(null);
  const [pregledSlike, setPregledSlike] = useState<string | null>(null);
  const [ucitava, setUcitava] = useState(true);
  const [greskaUcitavanja, setGreskaUcitavanja] = useState<string | null>(null);
  const [cuva, setCuva] = useState(false);
  const fajlRef = useRef<HTMLInputElement>(null);

  const ucitaj = useCallback(async () => {
    setUcitava(true);
    setGreskaUcitavanja(null);
    const [pr, a] = await Promise.all([
      supabase.from("profiles").select("full_name, phone, avatar_url").eq("id", vezbacId).maybeSingle(),
      supabase
        .from("athletes")
        .select("birth_year, gender, height_cm, weight_kg, goal, notes")
        .eq("id", vezbacId)
        .maybeSingle(),
    ]);
    const greska = pr.error ?? a.error;
    if (greska) {
      const poruka = porukaGreske(greska);
      setGreskaUcitavanja(poruka);
      toast.error(poruka);
      setUcitava(false);
      return;
    }
    const prof = pr.data as any;
    const at = a.data as any;
    const podaci: Podaci = {
      ime: prof?.full_name ?? ime,
      telefon: prof?.phone ?? "",
      godina: at?.birth_year != null ? String(at.birth_year) : "",
      pol: at?.gender ?? "",
      visina: at?.height_cm != null ? String(Math.round(Number(at.height_cm))) : "",
      tezina: at?.weight_kg != null ? brojTekst(Number(at.weight_kg)) : "",
      cilj: at?.goal ?? "",
      beleska: at?.notes ?? "",
    };
    setSlika(prof?.avatar_url ?? null);
    setP(podaci);
    setPocetno(podaci);
    setUcitava(false);
  }, [vezbacId, ime]);

  useEffect(() => {
    if (!open) return;
    setNovaSlika(null);
    void ucitaj();
  }, [open, ucitaj]);

  useEffect(() => {
    if (!novaSlika) {
      setPregledSlike(null);
      return;
    }
    const adresa = URL.createObjectURL(novaSlika);
    setPregledSlike(adresa);
    return () => URL.revokeObjectURL(adresa);
  }, [novaSlika]);

  const ovaGodina = new Date().getFullYear();

  // Prazno polje znaci "obrisi", a upisano mora da bude u opsegu koji server prima.
  const problem = useMemo(() => {
    if (!p.ime.trim()) return "Ime ne sme da ostane prazno.";
    if (p.godina) {
      const g = ceoBroj(p.godina);
      if (g == null || g < 1920 || g > ovaGodina - 8) return `Godište mora biti između 1920. i ${ovaGodina - 8}.`;
    }
    if (p.visina) {
      const v = ceoBroj(p.visina);
      if (v == null || v < 100 || v > 250) return "Visina mora biti između 100 i 250 cm.";
    }
    if (p.tezina) {
      const t = brojIzTeksta(p.tezina);
      if (t == null || t < 30 || t > 300) return "Težina mora biti između 30 i 300 kg.";
    }
    return null;
  }, [p, ovaGodina]);

  const promenjeno = novaSlika != null || (Object.keys(p) as (keyof Podaci)[]).some((k) => p[k] !== pocetno[k]);
  const spremno = !cuva && !ucitava && !greskaUcitavanja && problem == null && promenjeno;

  const postavi = (k: keyof Podaci, v: string) => setP((pre) => ({ ...pre, [k]: v }));

  const izaberiSliku = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fajl = e.target.files?.[0];
    e.target.value = "";
    if (!fajl) return;
    if (!fajl.type.startsWith("image/")) {
      toast.error("Izaberi sliku.");
      return;
    }
    setNovaSlika(fajl);
  };

  const sacuvaj = async () => {
    if (locked) return openLock();
    if (!spremno) return;
    setCuva(true);
    try {
      const izmene: Record<string, unknown> = {};
      if (novaSlika) {
        const podaci = await pripremiSliku(novaSlika);
        const putanja = `${vezbacId}/slika-${Math.floor(Date.now() / 1000)}.jpg`;
        const { error } = await supabase.storage
          .from("avatars")
          .upload(putanja, podaci, { contentType: "image/jpeg" });
        if (error) throw error;
        izmene.avatar_url = supabase.storage.from("avatars").getPublicUrl(putanja).data.publicUrl;
      }
      // Salje se samo ono sto je trener stvarno promenio; prazno polje brise vrednost.
      if (p.ime !== pocetno.ime) izmene.full_name = p.ime.trim();
      if (p.telefon !== pocetno.telefon) izmene.phone = tekstIliNull(p.telefon);
      if (p.godina !== pocetno.godina) izmene.birth_year = ceoBroj(p.godina);
      if (p.pol !== pocetno.pol) izmene.gender = tekstIliNull(p.pol);
      if (p.visina !== pocetno.visina) izmene.height_cm = ceoBroj(p.visina);
      if (p.tezina !== pocetno.tezina) izmene.weight_kg = brojIzTeksta(p.tezina);
      if (p.cilj !== pocetno.cilj) izmene.goal = tekstIliNull(p.cilj);
      if (p.beleska !== pocetno.beleska) izmene.notes = tekstIliNull(p.beleska);

      if (Object.keys(izmene).length > 0) {
        const { error } = await supabase.rpc("trainer_update_athlete", {
          p_athlete_id: vezbacId,
          p_izmene: izmene,
        });
        if (error) throw error;
      }
      toast.success("Podaci su sačuvani.");
      onSacuvano();
      onClose();
    } catch (e) {
      toast.error(porukaGreske(e));
    } finally {
      setCuva(false);
    }
  };

  const natpisPolja = "text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground";

  return (
    <FullScreenSheet open={open} onClose={onClose} title="Podaci o vežbaču">
      <FullScreenSheetScroll className="space-y-5 pt-5">
        {ucitava ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Učitavanje" />
          </div>
        ) : greskaUcitavanja ? (
          <div className="py-10 text-center">
            <p className="text-[13.5px] text-muted-foreground">{greskaUcitavanja}</p>
            <Button variant="outline" onClick={() => void ucitaj()} className="mt-4 h-10 rounded-full px-4">
              Pokušaj ponovo
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => fajlRef.current?.click()}
                aria-label={slika || novaSlika ? "Promeni sliku" : "Dodaj sliku vežbaču"}
                className="relative rounded-full transition hover:brightness-110"
              >
                <LiceVezbaca ime={p.ime || ime} slika={pregledSlike ?? slika} velicina={96} />
                <span className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full border-2 border-background bg-surface-2">
                  <Camera className="h-3.5 w-3.5" />
                </span>
              </button>
              <input ref={fajlRef} type="file" accept="image/*" className="hidden" onChange={izaberiSliku} />
              <span className="text-[12px] text-muted-foreground">
                {novaSlika
                  ? "Nova slika se čuva sa podacima"
                  : slika
                    ? "Klikni da promeniš sliku"
                    : "Dodaj sliku vežbaču"}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="uv-ime" className={natpisPolja}>Ime i prezime</Label>
                <Input
                  id="uv-ime"
                  value={p.ime}
                  maxLength={80}
                  onChange={(e) => postavi("ime", e.target.value)}
                  placeholder="Marko Marković"
                  className="mt-1.5 h-12 rounded-2xl"
                />
              </div>
              <div>
                <Label htmlFor="uv-telefon" className={natpisPolja}>Telefon</Label>
                <Input
                  id="uv-telefon"
                  type="tel"
                  value={p.telefon}
                  maxLength={30}
                  onChange={(e) => postavi("telefon", e.target.value)}
                  placeholder="+381 6X XXX XXXX"
                  className="mt-1.5 h-12 rounded-2xl"
                />
              </div>
              <p className="text-[11.5px] text-muted-foreground">
                Vežbač vidi ove podatke na svom profilu i menja ih i sam.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <Label htmlFor="uv-godina" className={natpisPolja}>Godište</Label>
                <Input
                  id="uv-godina"
                  inputMode="numeric"
                  value={p.godina}
                  maxLength={4}
                  onChange={(e) => postavi("godina", e.target.value.replace(/\D/g, ""))}
                  placeholder="1995"
                  className="mt-1.5 h-12 rounded-2xl"
                />
              </div>
              <div>
                <Label htmlFor="uv-visina" className={natpisPolja}>Visina (cm)</Label>
                <Input
                  id="uv-visina"
                  inputMode="numeric"
                  value={p.visina}
                  maxLength={3}
                  onChange={(e) => postavi("visina", e.target.value.replace(/\D/g, ""))}
                  placeholder="178"
                  className="mt-1.5 h-12 rounded-2xl"
                />
              </div>
              <div>
                <Label htmlFor="uv-tezina" className={natpisPolja}>Težina (kg)</Label>
                <Input
                  id="uv-tezina"
                  inputMode="decimal"
                  value={p.tezina}
                  maxLength={6}
                  onChange={(e) => postavi("tezina", e.target.value.replace(/[^\d.,]/g, ""))}
                  placeholder="80"
                  className="mt-1.5 h-12 rounded-2xl"
                />
              </div>
            </div>

            <div>
              <div className={natpisPolja}>Pol</div>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {POLOVI.map((o) => {
                  const aktivan = p.pol === o.k;
                  return (
                    <button
                      key={o.k}
                      type="button"
                      aria-pressed={aktivan}
                      onClick={() => postavi("pol", aktivan ? "" : o.k)}
                      className={cn(
                        "h-11 rounded-2xl border text-[13px] font-semibold transition",
                        aktivan
                          ? "border-primary/50 bg-primary-soft text-foreground"
                          : "border-hairline bg-surface text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {o.naziv}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className={natpisPolja}>Cilj</div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {CILJEVI.map(({ k, naziv, Ikona }) => {
                  const aktivan = p.cilj === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={aktivan}
                      onClick={() => postavi("cilj", aktivan ? "" : k)}
                      className={cn(
                        "inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition",
                        aktivan
                          ? "border-primary/50 bg-primary-soft text-foreground"
                          : "border-hairline bg-surface text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Ikona className="h-3.5 w-3.5" />
                      {naziv}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label htmlFor="uv-beleska" className={natpisPolja}>Beleška</Label>
              <Textarea
                id="uv-beleska"
                value={p.beleska}
                maxLength={2000}
                rows={4}
                onChange={(e) => postavi("beleska", e.target.value)}
                placeholder="Povrede, ograničenja, dogovori..."
                className="mt-1.5 rounded-2xl text-[14px]"
              />
            </div>

            {problem && <p role="alert" className="text-[12.5px] font-medium text-warning">{problem}</p>}
          </>
        )}
      </FullScreenSheetScroll>
      <FullScreenSheetFooter>
        <Button
          onClick={() => void sacuvaj()}
          disabled={!spremno}
          className="h-12 w-full rounded-2xl bg-gradient-brand text-white shadow-brand"
        >
          {cuva && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {cuva ? "Čuvam..." : "Sačuvaj izmene"}
        </Button>
      </FullScreenSheetFooter>
    </FullScreenSheet>
  );
};
