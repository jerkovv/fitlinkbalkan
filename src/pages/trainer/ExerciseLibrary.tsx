import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { porukaGreske } from "@/lib/errorMessage";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  FullScreenSheet,
  FullScreenSheetScroll,
  FullScreenSheetFooter,
} from "@/components/ui/full-screen-sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Search, Dumbbell, Loader2, User2, Globe2, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { VideoModal } from "@/components/VideoModal";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";

type Exercise = {
  id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  instructions: string | null;
  primary_muscle: string;
  secondary_muscles: string[] | null;
  equipment: string;
  category: string | null;
  is_global: boolean;
  created_by: string | null;
  video_url: string | null;
};

const MUSCLE_GROUPS = [
  { value: "all", label: "Sve" },
  { value: "grudi", label: "Grudi" },
  { value: "ledja", label: "Leđa" },
  { value: "ramena", label: "Ramena" },
  { value: "biceps", label: "Biceps" },
  { value: "triceps", label: "Triceps" },
  { value: "kvadriceps", label: "Kvadriceps" },
  { value: "zadnja_loza", label: "Zadnja loža" },
  { value: "glutei", label: "Glutei" },
  { value: "listovi", label: "Listovi" },
  { value: "core", label: "Core" },
  { value: "celo_telo", label: "Celo telo" },
  { value: "kardio", label: "Kardio" },
];

const EQUIPMENT = [
  { value: "sipka", label: "Šipka" },
  { value: "bucice", label: "Bučice" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "masina", label: "Mašina" },
  { value: "kabl", label: "Kabl" },
  { value: "sopstvena_tezina", label: "Sopstvena težina" },
  { value: "guma", label: "Guma" },
  { value: "medicinka", label: "Medicinka" },
  { value: "kardio_oprema", label: "Kardio oprema" },
  { value: "ostalo", label: "Ostalo" },
];

/** Kolone koje kartica u listi stvarno koristi. Ceo red ide tek na otvaranje vezbe. */
const KOLONE_LISTE = "id, name, name_en, primary_muscle, equipment, is_global, created_by";
const STRANA = 60;

const muscleLabel = (v: string) => MUSCLE_GROUPS.find((m) => m.value === v)?.label ?? v;
const equipLabel = (v: string) => EQUIPMENT.find((e) => e.value === v)?.label ?? v;

const ExerciseLibrary = () => {
  const { locked, openLock, guard } = usePretplataLock();
  const { user } = useAuth();
  const [items, setItems] = useState<Exercise[]>([]);
  const [ukupno, setUkupno] = useState<number | null>(null);
  const [imaJos, setImaJos] = useState(false);
  const [ucitavamJos, setUcitavamJos] = useState(false);
  // Brojac za rucno osvezavanje (posle dodavanja vezbe): filteri se nisu promenili,
  // pa efekat treba drugi razlog da se ponovo pokrene.
  const [osvezi, setOsvezi] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [muscleFilter, setMuscleFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState<"all" | "global" | "mine">("all");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Exercise | null>(null);

  // Create form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [primaryMuscle, setPrimaryMuscle] = useState<string>("grudi");
  const [equipment, setEquipment] = useState<string>("bucice");
  const [submitting, setSubmitting] = useState(false);
  const [videoOpenFor, setVideoOpenFor] = useState<Exercise | null>(null);

  /**
   * Lista je do sada bila `select("*")` bez opsega, pa je PostgREST vracao svojih
   * najvise 1000 redova - od 4699 vezbi. Broj "1000 vezbi ukupno" je bio samo
   * vidljivi simptom; teze je bilo to sto se pretraga radila NAD tih 1000, pa
   * 3699 vezbi sa ovog ekrana nije moglo da se nadje.
   *
   * Zato filter, pretraga, sortiranje i opseg idu na SERVER, a ukupan broj se
   * dobija zasebnim count upitom - dakle tacan i kad je lista jos nedovucena.
   *
   * Kartica trazi malo kolona, pa lista vuce samo njih; ceo red (uputstvo, video,
   * sekundarni misici) dovlaci se tek kad se vezba otvori.
   */
  const upit = useCallback(
    (zaBrojanje: boolean) => {
      let q = zaBrojanje
        ? supabase.from("exercises").select("*", { count: "exact", head: true })
        : supabase.from("exercises").select(KOLONE_LISTE);

      if (user?.id) q = q.or(`is_global.eq.true,created_by.eq.${user.id}`);
      else q = q.eq("is_global", true);

      if (muscleFilter !== "all") q = q.eq("primary_muscle", muscleFilter as any);
      if (scopeFilter === "global") q = q.eq("is_global", true);
      if (scopeFilter === "mine" && user?.id) {
        q = q.eq("is_global", false).eq("created_by", user.id);
      }
      const s = query.trim().replace(/[%,]/g, "");
      if (s) q = q.or(`name.ilike.%${s}%,name_en.ilike.%${s}%`);
      return q;
    },
    [muscleFilter, scopeFilter, query, user?.id],
  );

  const ucitajStranu = useCallback(
    async (od: number) => {
      const { data, error } = await upit(false)
        .order("is_global", { ascending: false })
        .order("name", { ascending: true })
        .range(od, od + STRANA - 1);
      if (error) {
        toast.error(porukaGreske(error));
        return [] as Exercise[];
      }
      const red = (data as any as Exercise[]) ?? [];
      setImaJos(red.length === STRANA);
      return red;
    },
    [upit],
  );

  // Pretraga se ne salje na svaki otkucani znak.
  useEffect(() => {
    let otkazano = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const [red, { count }] = await Promise.all([
        ucitajStranu(0),
        upit(true).then((r) => r as { count: number | null }),
      ]);
      if (otkazano) return;
      setItems(red);
      setUkupno(count ?? null);
      setLoading(false);
    }, query ? 250 : 0);
    return () => { otkazano = true; clearTimeout(t); };
  }, [ucitajStranu, upit, query, osvezi]);

  /**
   * Otvaranje vezbe. Lista nosi samo kolone koje kartica koristi, pa se za
   * detalje (uputstvo, opis, sekundarni misici, video) dovlaci ceo red - jedan
   * red po kliku umesto 4699 redova unapred.
   *
   * Ono sto je vec stiglo se prikaze odmah, pa se dopuni kad odgovor stigne;
   * dijalog se ne otvara u prazno.
   */
  const otvori = async (ex: Exercise) => {
    setSelected(ex);
    const { data } = await supabase.from("exercises").select("*").eq("id", ex.id).maybeSingle();
    if (data) setSelected((tren) => (tren?.id === ex.id ? (data as any as Exercise) : tren));
  };

  const ucitajJos = async () => {
    setUcitavamJos(true);
    const red = await ucitajStranu(items.length);
    setItems((stari) => [...stari, ...red]);
    setUcitavamJos(false);
  };

  // Server je vec filtrirao - lista se prikazuje kakva je stigla.
  const filtered = items;

  const handleCreate = async (e: React.FormEvent) => {
    if (locked) return openLock();
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    const vUrl = videoUrl.trim();
    if (vUrl && !/^https?:\/\//i.test(vUrl)) {
      toast.error("Video link mora počinjati sa http:// ili https://");
      setSubmitting(false);
      return;
    }
    const { error } = await supabase.from("exercises").insert({
      name,
      description: description || null,
      instructions: instructions || null,
      primary_muscle: primaryMuscle,
      equipment,
      is_global: false,
      created_by: user.id,
      video_url: vUrl || null,
    } as any);
    setSubmitting(false);

    if (error) {
      toast.error(porukaGreske(error));
      return;
    }
    toast.success("Vežba dodata");
    setOpen(false);
    setName(""); setDescription(""); setInstructions(""); setVideoUrl("");
    setPrimaryMuscle("grudi"); setEquipment("bucice");
    setOsvezi((n) => n + 1);
  };

  return (
    <div className="phone-shell px-5 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <Link to="/trener" className="h-9 w-9 rounded-full bg-surface-2 flex items-center justify-center">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="eyebrow text-muted-foreground">Biblioteka</span>
        <button
          onClick={guard(() => setOpen(true))}
          className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-brand"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <FullScreenSheet open={open} onClose={() => setOpen(false)} title="Nova vežba">
        <form onSubmit={handleCreate} className="flex flex-1 min-h-0 flex-col">
          <FullScreenSheetScroll className="pt-5 space-y-3">
            <div>
              <Label htmlFor="ex-name">Naziv</Label>
              <Input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1.5 h-14 text-base rounded-2xl" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Glavna grupa</Label>
                <Select value={primaryMuscle} onValueChange={setPrimaryMuscle}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MUSCLE_GROUPS.filter((m) => m.value !== "all").map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Oprema</Label>
                <Select value={equipment} onValueChange={setEquipment}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EQUIPMENT.map((e) => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="ex-desc">Kratak opis</Label>
              <Input id="ex-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1.5 h-14 text-base rounded-2xl" />
            </div>
            <div>
              <Label htmlFor="ex-instr">Uputstvo (opciono)</Label>
              <Textarea id="ex-instr" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="ex-video">Video link (opciono)</Label>
              <Input
                id="ex-video"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="mt-1.5 h-14 text-base rounded-2xl"
                type="url"
              />
              <div className="text-[11px] text-muted-foreground mt-1">
                YouTube, Vimeo ili direktan .mp4 link.
              </div>
            </div>
          </FullScreenSheetScroll>
          <FullScreenSheetFooter>
            <Button type="submit" disabled={submitting} className="w-full bg-gradient-brand text-white shadow-brand">
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sačuvaj vežbu
            </Button>
          </FullScreenSheetFooter>
        </form>
      </FullScreenSheet>

      <h1 className="font-display text-[28px] font-bold tracking-tightest mb-1">Biblioteka vežbi</h1>
      <p className="text-sm text-muted-foreground mb-4">
        {ukupno != null ? `${ukupno} vežbi` : "Učitavam..."}
        {ukupno != null && items.length < ukupno && ` · prikazano ${items.length}`}
      </p>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pretraži vežbe..."
          className="pl-9"
        />
      </div>

      {/* Scope filter pills */}
      <div className="flex gap-2 mb-3 no-scrollbar overflow-x-auto">
        {([
          { v: "all", l: "Sve" },
          { v: "global", l: "Globalne" },
          { v: "mine", l: "Moje" },
        ] as const).map((p) => (
          <button
            key={p.v}
            onClick={() => setScopeFilter(p.v)}
            className={`pill px-3.5 py-1.5 text-xs whitespace-nowrap ${
              scopeFilter === p.v
                ? "bg-foreground text-background"
                : "bg-surface-2 text-foreground"
            }`}
          >
            {p.l}
          </button>
        ))}
      </div>

      {/* Muscle filter pills */}
      <div className="flex gap-2 mb-5 no-scrollbar overflow-x-auto">
        {MUSCLE_GROUPS.map((m) => (
          <button
            key={m.value}
            onClick={() => setMuscleFilter(m.value)}
            className={`pill px-3.5 py-1.5 text-xs whitespace-nowrap ${
              muscleFilter === m.value
                ? "bg-primary text-primary-foreground"
                : "bg-surface-2 text-muted-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="h-12 w-12 mx-auto rounded-2xl bg-surface-2 flex items-center justify-center mb-3">
            <Dumbbell className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Nema rezultata</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((ex) => (
            <button
              key={ex.id}
              onClick={() => void otvori(ex)}
              className="card-premium-hover w-full text-left p-4 flex items-center gap-3"
            >
              <div className="h-11 w-11 rounded-lg bg-gradient-brand-soft flex items-center justify-center shrink-0">
                <Dumbbell className="h-5 w-5 text-primary" strokeWidth={2.25} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{ex.name_en?.trim() || ex.name}</div>
                {ex.name_en && ex.name_en.trim() && ex.name_en.trim() !== ex.name && (
                  <div className="text-[11px] text-muted-foreground truncate">{ex.name}</div>
                )}
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <span>{muscleLabel(ex.primary_muscle)}</span>
                  <span className="opacity-50">•</span>
                  <span>{equipLabel(ex.equipment)}</span>
                </div>
              </div>
              {ex.is_global ? (
                <Globe2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <User2 className="h-3.5 w-3.5 text-primary shrink-0" />
              )}
            </button>
          ))}

          {imaJos && (
            <button
              type="button"
              onClick={() => void ucitajJos()}
              disabled={ucitavamJos}
              className="w-full h-11 rounded-xl bg-surface-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground transition disabled:opacity-50"
            >
              {ucitavamJos ? "Učitavam..." : "Učitaj još"}
            </button>
          )}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-12 w-12 rounded-xl bg-gradient-brand-soft flex items-center justify-center">
                    <Dumbbell className="h-5 w-5 text-primary" strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0">
                    <DialogTitle className="text-left">{selected.name_en?.trim() || selected.name}</DialogTitle>
                    {selected.name_en && selected.name_en.trim() && selected.name_en.trim() !== selected.name && (
                      <div className="text-[12px] text-muted-foreground mt-0.5 text-left">{selected.name}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {selected.is_global ? "Globalna vežba" : "Moja vežba"}
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-surface-2 p-3">
                    <div className="eyebrow text-muted-foreground mb-1">Glavna grupa</div>
                    <div className="text-sm font-semibold">{muscleLabel(selected.primary_muscle)}</div>
                  </div>
                  <div className="rounded-lg bg-surface-2 p-3">
                    <div className="eyebrow text-muted-foreground mb-1">Oprema</div>
                    <div className="text-sm font-semibold">{equipLabel(selected.equipment)}</div>
                  </div>
                </div>

                {selected.secondary_muscles && selected.secondary_muscles.length > 0 && (
                  <div>
                    <div className="eyebrow text-muted-foreground mb-2">Sekundarni mišići</div>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.secondary_muscles.map((m) => (
                        <span key={m} className="pill px-2.5 py-1 text-xs bg-surface-2">
                          {muscleLabel(m)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selected.description && (
                  <div>
                    <div className="eyebrow text-muted-foreground mb-1">Opis</div>
                    <p className="text-sm">{selected.description}</p>
                  </div>
                )}

                {selected.instructions && (
                  <div>
                    <div className="eyebrow text-muted-foreground mb-1">Uputstvo</div>
                    <p className="text-sm whitespace-pre-line">{selected.instructions}</p>
                  </div>
                )}

                {selected.video_url && (
                  <div className="w-full aspect-video rounded-2xl overflow-hidden bg-surface-2">
                    {/\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(selected.video_url) ? (
                      <img
                        src={selected.video_url}
                        alt={selected.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <video
                        src={selected.video_url}
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="auto"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {videoOpenFor?.video_url && (
        <VideoModal
          url={videoOpenFor.video_url}
          title={videoOpenFor.name}
          open={!!videoOpenFor}
          onOpenChange={(o) => !o && setVideoOpenFor(null)}
        />
      )}
    </div>
  );
};

export default ExerciseLibrary;
