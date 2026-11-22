import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Loader2, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { PhoneShell } from "@/components/PhoneShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { useZakljucanaZona } from "@/components/pretplata/useZakljucanaZona";
import { LockMark } from "@/components/pretplata/LockMark";
import { LiceVezbaca } from "@/components/trainer/web/vezbaci/LiceVezbaca";
import { useVezbaciPregled } from "@/components/trainer/web/vezbaci/useVezbaciPregled";
import {
  danaBezTreninga,
  nestaliRedom,
  prvoIme,
  usporiliRedom,
  type Vezbac,
} from "@/components/trainer/web/vezbaci/aktivnost";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/hooks/useConfirm";
import { porukaGreske } from "@/lib/errorMessage";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const POCETNI_TEKST = "kako si? Hoćeš da zakažemo sledeći trening?";

const kadJe = (v: Vezbac) =>
  v.poslednjiTrening == null
    ? "Još nije trenirao"
    : `Poslednji trening pre ${v.danaOdTreninga ?? danaBezTreninga(v)} dana`;

export default function TrainerJaviSe() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { locked, openLock } = usePretplataLock();
  const zona = useZakljucanaZona();
  const { vezbaci, ucitano, greska, ucitaj } = useVezbaciPregled();

  const usporili = useMemo(() => usporiliRedom(vezbaci), [vezbaci]);
  const nestali = useMemo(() => nestaliRedom(vezbaci), [vezbaci]);

  const [izabrani, setIzabrani] = useState<Set<string>>(new Set());
  const [poslati, setPoslati] = useState<Set<string>>(new Set());
  const [tekst, setTekst] = useState(POCETNI_TEKST);
  const [salje, setSalje] = useState(false);

  // Unapred su oznaceni samo oni koji su skoro usporili; nov vezbac koji jos nije poceo nije.
  const pocetniIzbor = useRef(false);
  useEffect(() => {
    if (!ucitano || pocetniIzbor.current) return;
    pocetniIzbor.current = true;
    setIzabrani(new Set(usporili.map((v) => v.id)));
  }, [ucitano, usporili]);

  const ciljevi = useMemo(
    () => [...usporili, ...nestali].filter((v) => izabrani.has(v.id)),
    [usporili, nestali, izabrani],
  );
  const cistTekst = tekst.trim();
  const gotovo = poslati.size > 0 && ciljevi.length === 0;
  const nemaSlanja = ciljevi.length === 0 || !cistTekst;

  const prebaci = (id: string) =>
    setIzabrani((pre) => {
      const novo = new Set(pre);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const prebaciGrupu = (lista: Vezbac[], sviIzabrani: boolean) =>
    setIzabrani((pre) => {
      const novo = new Set(pre);
      lista.forEach((v) => (sviIzabrani ? novo.delete(v.id) : novo.add(v.id)));
      return novo;
    });

  // Salje redom. Kome ne uspe ostaje oznacen, pa ponovni pritisak ne salje drugima duplo.
  const posalji = async () => {
    if (locked) return openLock();
    if (!user || nemaSlanja || salje) return;
    const lista = ciljevi;
    const t = cistTekst;
    const potvrda = await confirm({
      title: lista.length === 1 ? "Poslati poruku?" : "Poslati poruku svima izabranim?",
      description: "Svako je dobija u svom četu, sa svojim imenom, i stiže mu obaveštenje na telefon.",
      confirmLabel: `Pošalji (${lista.length})`,
    });
    if (!potvrda) return;

    setSalje(true);
    let uspelo = 0;
    let prvaGreska: unknown = null;
    for (const v of lista) {
      const { error } = await supabase.from("messages").insert({
        trainer_id: user.id,
        athlete_id: v.id,
        sender_id: user.id,
        body: `Ćao ${prvoIme(v.ime)}, ${t}`,
      });
      if (error) {
        prvaGreska = prvaGreska ?? error;
        continue;
      }
      uspelo += 1;
      setIzabrani((pre) => {
        const novo = new Set(pre);
        novo.delete(v.id);
        return novo;
      });
      setPoslati((pre) => new Set(pre).add(v.id));
    }
    setSalje(false);

    if (uspelo === lista.length) {
      toast.success(uspelo === 1 ? "Poruka je poslata." : `Poslato: ${uspelo}.`);
    } else if (uspelo > 0) {
      toast.error(`Poslato ${uspelo} od ${lista.length}. Ostali su i dalje označeni, pokušaj ponovo.`);
    } else {
      toast.error(porukaGreske(prvaGreska));
    }
  };

  const natpis = salje
    ? "Šaljem..."
    : gotovo
      ? "Gotovo"
      : ciljevi.length === 0
        ? "Označi kome šalješ"
        : `Pošalji (${ciljevi.length})`;

  const grupa = (naziv: string, raspon: string, lista: Vezbac[], boja: string) => {
    if (lista.length === 0) return null;
    const zaIzbor = lista.filter((v) => !poslati.has(v.id));
    const sviIzabrani = zaIzbor.length > 0 && zaIzbor.every((v) => izabrani.has(v.id));
    return (
      <section className="space-y-2">
        <div className="flex min-h-8 items-center gap-2 px-1">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: boja }} />
          <h2 className="text-[14px] font-semibold">{naziv}</h2>
          <span className="text-[12px] text-muted-foreground tnum">
            {lista.length} · {raspon}
          </span>
          <span className="flex-1" />
          {zaIzbor.length > 0 && (
            <button
              type="button"
              onClick={() => prebaciGrupu(zaIzbor, sviIzabrani)}
              disabled={salje}
              className="min-h-8 rounded-full px-2 text-[12.5px] font-semibold text-primary-soft-foreground transition hover:text-foreground disabled:opacity-50"
            >
              {sviIzabrani ? "Poništi" : "Izaberi sve"}
            </button>
          )}
        </div>
        <ul className="card-premium divide-y divide-hairline overflow-hidden">
          {lista.map((v) => {
            const poslato = poslati.has(v.id);
            const izabran = izabrani.has(v.id);
            return (
              <li key={v.id} className="flex items-center gap-2 px-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={izabran}
                  aria-label={`${v.ime}, ${poslato ? "poslato" : kadJe(v)}`}
                  onClick={() => prebaci(v.id)}
                  disabled={poslato || salje}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2.5 text-left transition hover:bg-surface-2/60 disabled:hover:bg-transparent"
                >
                  <span
                    className={cn(
                      "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-[1.5px] transition",
                      izabran ? "border-transparent bg-gradient-brand text-white" : "border-muted-foreground/60",
                      poslato && "invisible",
                    )}
                  >
                    {izabran && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <LiceVezbaca ime={v.ime} slika={v.avatarUrl} />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold leading-snug">{v.ime}</span>
                    {poslato ? (
                      <span className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-success">
                        <Check className="h-3 w-3" strokeWidth={3} /> Poslato
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-[12px] text-muted-foreground">{kadJe(v)}</span>
                    )}
                  </span>
                </button>
                <Link
                  to={`/trener/chat/${v.id}`}
                  aria-label={`Otvori čet: ${v.ime}`}
                  title="Otvori čet"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground transition hover:brightness-125"
                >
                  <MessageCircle className="h-4 w-4" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  const nemaNikoga = ucitano && usporili.length === 0 && nestali.length === 0;

  return (
    <PhoneShell title="Javi se vežbačima" eyebrow="Vežbači" back="/trener/vezbaci" desktopWidth="wide">
      {!ucitano ? (
        greska ? (
          <div className="card-premium px-6 py-10 text-center">
            <p className="text-[13.5px] text-muted-foreground">{greska}</p>
            <Button variant="outline" onClick={() => void ucitaj()} className="mt-4 h-10 rounded-full px-4">
              Pokušaj ponovo
            </Button>
          </div>
        ) : (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Učitavanje" />
          </div>
        )
      ) : nemaNikoga ? (
        <div className="card-premium px-6 py-12 text-center">
          <div className="font-display text-[17px] font-bold tracking-tight">Niko nije usporio</div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Svi tvoji vežbači su trenirali u poslednjih 14 dana.
          </p>
        </div>
      ) : (
        <div {...zona} className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-5">
            <p className="px-1 text-[13px] text-muted-foreground">
              Označi kome šalješ, ili otvori čet sa jednom osobom.
            </p>
            {grupa("Usporili", "15-45 dana", usporili, "hsl(var(--warning))")}
            {grupa("Nestali", "45+ dana", nestali, "hsl(var(--destructive))")}
          </div>

          <aside className="card-premium space-y-3 p-4 lg:sticky lg:top-6">
            {!gotovo && (
              <div>
                <label htmlFor="javi-se-poruka" className="block text-[13.5px] font-semibold text-muted-foreground">
                  {ciljevi[0] ? `Ćao ${prvoIme(ciljevi[0].ime)},` : "Ćao,"}
                </label>
                <Textarea
                  id="javi-se-poruka"
                  value={tekst}
                  onChange={(e) => setTekst(e.target.value)}
                  placeholder="Napiši poruku..."
                  maxLength={3900}
                  rows={5}
                  disabled={salje}
                  className="mt-1.5 resize-none rounded-2xl text-[14px]"
                />
                {ciljevi.length > 1 && (
                  <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                    Svako dobija poruku sa svojim imenom.
                  </p>
                )}
              </div>
            )}
            <Button
              onClick={gotovo ? () => navigate("/trener/vezbaci") : () => void posalji()}
              disabled={salje || (!locked && !gotovo && nemaSlanja)}
              className="h-12 w-full rounded-2xl bg-gradient-brand text-[15px] font-semibold text-white shadow-brand"
            >
              {salje ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : !gotovo ? (
                <>
                  <LockMark className="mr-1.5" />
                  <Send className="mr-2 h-4 w-4" />
                </>
              ) : null}
              {natpis}
            </Button>
          </aside>
        </div>
      )}
    </PhoneShell>
  );
}
