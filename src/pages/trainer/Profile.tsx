import { useEffect, useState, type ReactNode } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { cn } from "@/lib/utils";
import { BottomNav } from "@/components/BottomNav";
import { Card } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2, Save, Users, Dumbbell, Apple, X, Plus, Landmark, Eye, Ban, Globe, Copy, ExternalLink,
  ShieldCheck, UserRound, Briefcase, Sparkles, CalendarCheck, Share2, type LucideIcon,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { porukaGreske } from "@/lib/errorMessage";
import { toast } from "sonner";
import { DeleteAccountSheet } from "@/components/DeleteAccountSheet";
import { SITE_BASE, publicTrainerUrl } from "@/lib/publicUrl";
import { usePretplataLock } from "@/components/pretplata/usePretplataLock";
import { PravnoIPodrska } from "@/components/PravnoIPodrska";
import {
  ProfilCeline, ProfilMesec, ProfilOdjava, ProfilPretplata, ProfilVrh, pripremiSlikuProfila,
} from "@/components/trainer/web/pocetna/ProfilDelovi";

const SITE_HOST = new URL(SITE_BASE).host;

const SPEC_SUGGESTIONS = [
  "Mršavljenje", "Hipertrofija", "Snaga", "Funkcionalni trening",
  "Kondicija", "Mobilnost", "Rehabilitacija", "Sportska priprema",
  "Trudnice", "Senior", "Personalni trening", "Grupni trening",
];

type TrainerSub = {
  status: string | null;
  plan: string | null;
  access_until: string | null;
  trial_ends_at: string | null;
};

// Datum u obliku DD.MM.YYYY (bez zavisnosti od locale-a).
function formatDMY(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

// Ljudski citljiv status pretplate za trenera koji IMA pristup (iza gate-a).
// Bez dugmeta/linka za upravljanje - to zivi na webu (fitlink.rs).
function subLabel(sub: TrainerSub | null): string | null {
  if (!sub || !sub.status) return null;
  if (sub.status === "trialing") {
    const until = sub.access_until ? new Date(sub.access_until).getTime() : NaN;
    if (!isNaN(until)) {
      const days = Math.max(0, Math.ceil((until - Date.now()) / 86400000));
      return `Probni period, još ${days} ${days === 1 ? "dan" : "dana"}`;
    }
    return "Probni period";
  }
  if (sub.status === "active" || sub.status === "past_due") {
    const datum = formatDMY(sub.access_until);
    if (sub.plan === "yearly") return `Godišnja pretplata aktivna do ${datum}`;
    if (sub.plan === "monthly") return `Mesečna pretplata aktivna do ${datum}`;
    return datum ? `Pretplata aktivna do ${datum}` : "Pretplata aktivna";
  }
  return null;
}

// Naslov sekcije na racunaru: ikonica, naslov i kratak opis. Sitna oznaka koju
// koristi telefon se na sirokoj kartici gubila.
const DeoNaslov = ({ icon: Icon, naslov, opis }: { icon: LucideIcon; naslov: string; opis?: ReactNode }) => (
  <div className="flex items-start gap-3">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand-soft">
      <Icon className="h-[18px] w-[18px] text-primary" strokeWidth={2.25} />
    </div>
    <div className="min-w-0 flex-1 pt-0.5">
      <h2 className="font-display text-[17px] font-bold leading-tight tracking-tight">{naslov}</h2>
      {opis && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{opis}</p>}
    </div>
  </div>
);

// Brojka u redu statistike na racunaru.
const ProfilStat = ({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) => (
  <Card className="p-5">
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft">
        <Icon className="h-4 w-4 text-primary" />
      </div>
    </div>
    <div className="mt-3 font-display text-[30px] font-bold leading-none tracking-tight tnum">{value}</div>
  </Card>
);

const Profile = () => {
  const { locked, openLock } = usePretplataLock();
  const { user } = useAuth();
  const desktop = useDesktopWeb();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  

  // editable
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [studio, setStudio] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [years, setYears] = useState<string>("");
  const [instagram, setInstagram] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [newSpec, setNewSpec] = useState("");

  // bank
  const [bankRecipient, setBankRecipient] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankModel, setBankModel] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [bankPurpose, setBankPurpose] = useState("");

  // privacy
  const [showAttendees, setShowAttendees] = useState(false);
  const [cancelCutoff, setCancelCutoff] = useState<number>(0);

  // public landing
  const [publicSlug, setPublicSlug] = useState("");
  const [publicEnabled, setPublicEnabled] = useState(true);
  const [headline, setHeadline] = useState("");
  // Racunar: slika ceka na "Sacuvaj", a "Otvori stranicu" vodi na vec sacuvan link.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [novaSlika, setNovaSlika] = useState<File | null>(null);
  const [sacuvaniSlug, setSacuvaniSlug] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [yearsError, setYearsError] = useState<string | null>(null);

  // read-only stats
  const [stats, setStats] = useState({
    athletes: 0,
    programs: 0,
    nutrition: 0,
  });

  // FitLink pretplata (samo prikaz statusa; upravljanje je na webu).
  const [sub, setSub] = useState<TrainerSub | null>(null);

  // Brisanje naloga - mejl uzimamo sveze iz auth (ne iz profiles) tacno pre otvaranja sheeta.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState<string | null>(null);

  const openDeleteSheet = async () => {
    const { data } = await supabase.auth.getUser();
    setDeleteEmail(data.user?.email ?? "");
    setDeleteOpen(true);
  };

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);

      const [pRes, tRes, aCount, prCount, nuCount, sRes] = await Promise.all([
        supabase.from("profiles").select("full_name, phone, avatar_url").eq("id", user.id).maybeSingle(),
        supabase.from("trainers").select("*").eq("id", user.id).maybeSingle(),
        supabase
          .from("athletes")
          .select("id", { count: "exact", head: true })
          .eq("trainer_id", user.id),
        supabase
          .from("program_templates")
          .select("id", { count: "exact", head: true })
          .eq("trainer_id", user.id),
        supabase
          .from("nutrition_plan_templates")
          .select("id", { count: "exact", head: true })
          .eq("trainer_id", user.id),
        supabase
          .from("trainer_subscriptions")
          .select("status, plan, access_until, trial_ends_at")
          .eq("trainer_id", user.id)
          .maybeSingle(),
      ]);

      const p: any = pRes.data ?? {};
      const t: any = tRes.data ?? {};

      setFullName(p.full_name ?? "");
      setPhone(p.phone ?? "");
      setStudio(t.studio_name ?? "");
      setCity(t.city ?? "");
      setBio(t.bio ?? "");
      setYears(t.years_experience != null ? String(t.years_experience) : "");
      setInstagram(t.instagram_handle ?? "");
      setSpecialties(Array.isArray(t.specialties) ? t.specialties : []);
      setBankRecipient(t.bank_recipient ?? "");
      setBankAccount(t.bank_account ?? "");
      setBankName(t.bank_name ?? "");
      setBankModel(t.bank_model ?? "");
      setBankReference(t.bank_reference ?? "");
      setBankPurpose(t.bank_purpose ?? "");
      setShowAttendees(!!t.show_attendees_to_athletes);
      setCancelCutoff(typeof t.cancel_cutoff_hours === "number" ? t.cancel_cutoff_hours : 0);
      setPublicSlug(t.public_slug ?? "");
      setPublicEnabled(t.public_enabled !== false);
      setHeadline(t.headline ?? "");
      setAvatarUrl(p.avatar_url ?? t.avatar_url ?? null);
      setSacuvaniSlug(t.public_slug ?? "");
      

      setStats({
        athletes: aCount.count ?? 0,
        programs: prCount.count ?? 0,
        nutrition: nuCount.count ?? 0,
      });

      setSub((sRes.data as TrainerSub | null) ?? null);

      setLoading(false);
    };
    load();
  }, [user]);

  const addSpecialty = (s: string) => {
    const v = s.trim();
    if (!v) return;
    if (specialties.includes(v)) return;
    setSpecialties([...specialties, v]);
    setNewSpec("");
  };

  const removeSpecialty = (s: string) => {
    setSpecialties(specialties.filter((x) => x !== s));
  };

  const validateSlug = (s: string): string | null => {
    if (!s) return null; // null je OK (sakriva landing)
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/.test(s)) {
      return desktop
        ? "Link: 3-40 znakova, mala slova, brojevi i crtice (ne na početku ni na kraju)."
        : "Slug: 3-40 znakova, mala slova, brojevi, crtice. Bez razmaka.";
    }
    return null;
  };

  const handleSave = async () => {
    if (locked) return openLock();
    if (!user) return;

    const slugClean = publicSlug.trim().toLowerCase();
    const slugErr = validateSlug(slugClean);
    setSlugError(slugErr);
    if (slugErr) {
      toast.error(slugErr);
      return;
    }

    // Validacija pre slanja - prazno polje je dozvoljeno (NULL kolona), samo
    // popunjeno polje van opsega se odbija OVDE, bez ijednog poziva ka bazi.
    setYearsError(null);
    if (years.trim()) {
      const y = Number(years);
      if (!Number.isFinite(y) || y < 0 || y > 80) {
        setYearsError("Godine iskustva moraju biti između 0 i 80.");
        return;
      }
    }

    setSaving(true);
    try {
      let novaAdresa: string | null = null;
      if (novaSlika) {
        const podaci = await pripremiSlikuProfila(novaSlika);
        const putanja = `${user.id}/slika-${Math.floor(Date.now() / 1000)}.jpg`;
        const { error: slikaErr } = await supabase.storage
          .from("avatars")
          .upload(putanja, podaci, { contentType: "image/jpeg" });
        if (slikaErr) throw slikaErr;
        novaAdresa = supabase.storage.from("avatars").getPublicUrl(putanja).data.publicUrl;
      }

      const { error: pErr } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
          ...(novaAdresa ? { avatar_url: novaAdresa } : {}),
        })
        .eq("id", user.id);
      if (pErr) throw pErr;

      const yearsNum = years ? parseInt(years, 10) : null;
      const igClean = instagram.trim().replace(/^@/, "") || null;

      const { error: tErr } = await supabase
        .from("trainers")
        .update({
          studio_name: studio.trim() || null,
          city: city.trim() || null,
          bio: bio.trim() || null,
          years_experience: yearsNum,
          instagram_handle: igClean,
          specialties,
          bank_recipient: bankRecipient.trim() || null,
          bank_account: bankAccount.trim() || null,
          bank_name: bankName.trim() || null,
          bank_model: bankModel.trim() || null,
          bank_reference: bankReference.trim() || null,
          bank_purpose: bankPurpose.trim() || null,
          show_attendees_to_athletes: showAttendees,
          cancel_cutoff_hours: cancelCutoff,
          public_slug: slugClean || null,
          public_enabled: publicEnabled,
          headline: headline.trim() || null,
          ...(novaAdresa ? { avatar_url: novaAdresa } : {}),
        } as any)
        .eq("id", user.id);
      if (tErr) {
        if ((tErr.message || "").toLowerCase().includes("uniq_trainers_public_slug")) {
          throw new Error(desktop ? "Taj link je već zauzet, izaberi drugi." : "Taj slug je već zauzet, izaberi drugi.");
        }
        throw tErr;
      }

      if (novaAdresa) {
        setAvatarUrl(novaAdresa);
        setNovaSlika(null);
      }
      setSacuvaniSlug(slugClean);
      toast.success("Profil sačuvan");
    } catch (e: any) {
      toast.error(porukaGreske(e));
    } finally {
      setSaving(false);
    }
  };

  // Kopiranje javnog linka - isto dugme stoji u polju za slug i ispod njega.
  const kopirajJavniLink = async () => {
    const url = publicTrainerUrl(publicSlug.trim().toLowerCase());
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link kopiran");
    } catch {
      toast.error("Ne mogu da kopiram");
    }
  };

  // Podeli: sistemski prozor gde postoji, inace kopiranje linka.
  const podeliJavniLink = async () => {
    const url = publicTrainerUrl(publicSlug.trim().toLowerCase());
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url });
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") toast.error(porukaGreske(e));
      }
      return;
    }
    await kopirajJavniLink();
  };

  // Racunar: prekidac radi odmah, kao red javne stranice na profilu u aplikaciji.
  const prebaciJavnu = async (vidljiva: boolean) => {
    if (locked) return openLock();
    if (!user) return;
    const pre = publicEnabled;
    setPublicEnabled(vidljiva);
    const { error } = await supabase
      .from("trainers")
      .update({ public_enabled: vidljiva } as any)
      .eq("id", user.id);
    if (error) {
      setPublicEnabled(pre);
      toast.error(porukaGreske(error));
    }
  };

  // Polja su izdvojena jer ih telefon i racunar slazu razlicito (jedna kolona
  // naspram mreze u dve kolone), a svako polje sme da postoji na samo jednom mestu.
  const poljeIme = (
    <div className="space-y-1.5">
      <Label htmlFor="fullName">Ime i prezime</Label>
      <Input
        id="fullName"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder="Marko Marković"
      />
    </div>
  );

  const poljeEmail = (
    <div className="space-y-1.5">
      <Label>{desktop ? "Mejl" : "Email"}</Label>
      <Input value={user?.email ?? ""} disabled />
    </div>
  );

  const poljeTelefon = (
    <div className="space-y-1.5">
      <Label htmlFor="phone">Telefon</Label>
      <Input
        id="phone"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+381 6X XXX XXXX"
      />
    </div>
  );

  const poljeStudio = (
    <div className="space-y-1.5">
      <Label htmlFor="studio">{desktop ? "Studio" : "Studio / teretana"}</Label>
      <Input
        id="studio"
        value={studio}
        onChange={(e) => setStudio(e.target.value)}
        placeholder="Naziv studia"
      />
    </div>
  );

  const poljeGrad = (
    <div className="space-y-1.5">
      <Label htmlFor="city">Grad</Label>
      <Input
        id="city"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        placeholder="Beograd"
      />
    </div>
  );

  const poljeGodine = (
    <div className="space-y-1.5">
      <Label htmlFor="years">{desktop ? "Iskustvo (god.)" : "Godine iskustva"}</Label>
      <Input
        id="years"
        type="number"
        inputMode="numeric"
        min={0}
        max={80}
        value={years}
        onChange={(e) => { setYears(e.target.value); setYearsError(null); }}
        placeholder="5"
      />
      {yearsError && <p className="text-[11.5px] text-destructive">{yearsError}</p>}
    </div>
  );

  const poljeInstagram = (
    <div className="space-y-1.5">
      <Label htmlFor="ig">Instagram</Label>
      <Input
        id="ig"
        value={instagram}
        onChange={(e) => setInstagram(e.target.value)}
        placeholder="korisnicko_ime"
      />
    </div>
  );

  const poljeBio = (
    <div className="space-y-1.5">
      <Label htmlFor="bio">O tebi</Label>
      <Textarea
        id="bio"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="Reci ko si, šta voliš, kakav pristup imaš..."
        rows={4}
      />
    </div>
  );

  const specCipovi = specialties.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {specialties.map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1.5 pill bg-primary-soft text-primary-soft-foreground px-3 py-1.5 text-[12.5px] font-semibold"
        >
          {s}
          <button
            onClick={() => removeSpecialty(s)}
            aria-label={`Ukloni ${s}`}
            className="opacity-60 hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );

  const specUnos = (
    <div className="flex gap-2">
      <Input
        value={newSpec}
        onChange={(e) => setNewSpec(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addSpecialty(newSpec);
          }
        }}
        placeholder="Dodaj svoju specijalnost"
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => addSpecialty(newSpec)}
        disabled={!newSpec.trim()}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );

  const specPredlozi = (
    <div>
      <div className="text-[11px] text-muted-foreground mb-2">Predlozi</div>
      <div className="flex flex-wrap gap-1.5">
        {SPEC_SUGGESTIONS.filter((s) => !specialties.includes(s)).map((s) => (
          <button
            key={s}
            onClick={() => addSpecialty(s)}
            className="pill bg-surface border border-hairline hover:border-primary/40 hover:bg-primary-soft/40 px-3 py-1 text-[12px] text-muted-foreground hover:text-primary-soft-foreground transition"
          >
            + {s}
          </button>
        ))}
      </div>
    </div>
  );

  const javnoVidljivo = (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold tracking-tight">
          {desktop ? "Stranica je vidljiva" : "Vidljivo javnosti"}
        </div>
        <div className="text-[12px] text-muted-foreground mt-0.5">
          {desktop ? "Ako isključiš, niko ne može da otvori tvoj /t/ link" : "Ako isključiš, niko ne može otvoriti tvoj /t/ link."}
        </div>
      </div>
      <Switch
        checked={publicEnabled}
        onCheckedChange={desktop ? (v) => void prebaciJavnu(v) : setPublicEnabled}
        aria-label="Stranica je vidljiva"
      />
    </div>
  );

  const javnoSlug = (
    <div className="space-y-1.5">
      <Label htmlFor="slug">{desktop ? "Link" : "Tvoj slug"}</Label>
      <div className="flex items-stretch rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
        <span
          className="flex items-center px-3 text-[12.5px] text-muted-foreground bg-muted/50 border-r border-input max-w-[55%] truncate tnum"
          title={`${SITE_HOST}/t/`}
        >
          <span className="truncate">{SITE_HOST}</span>
          <span className="shrink-0">/t/</span>
        </span>
        <Input
          id="slug"
          value={publicSlug}
          onChange={(e) => {
            const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
            setPublicSlug(v);
            setSlugError(validateSlug(v));
          }}
          placeholder="dejan-pt"
          className="lowercase border-0 focus-visible:ring-0 focus-visible:ring-offset-0 flex-1 min-w-0"
        />
        <button
          type="button"
          disabled={!publicSlug || !!slugError}
          onClick={kopirajJavniLink}
          className="flex items-center justify-center px-3 border-l border-input text-muted-foreground hover:text-primary hover:bg-primary-soft/40 transition disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
          title="Kopiraj link"
          aria-label="Kopiraj link"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
      {slugError && (
        <div className="text-[11.5px] text-destructive">{slugError}</div>
      )}
    </div>
  );

  const javnoHeadline = (
    <div className="space-y-1.5">
      <Label htmlFor="headline">{desktop ? "Kratak opis" : "Slogan / headline"}</Label>
      <Input
        id="headline"
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        placeholder="Personal trener - snaga i mršavljenje za zauzete ljude"
        maxLength={140}
      />
      <div className="text-[11px] text-muted-foreground text-right tnum">
        {headline.length}/140
      </div>
    </div>
  );

  const javniLinkSpreman = !!publicSlug && publicEnabled && !slugError;

  const privatnostRed = (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold tracking-tight">
          Vidljivost učesnika
        </div>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          {showAttendees
            ? "Vežbači vide imena drugih koji su rezervisali isti termin."
            : "Vežbači vide samo broj rezervisanih (npr. 3 / 6)."}
        </p>
      </div>
      <Switch
        checked={showAttendees}
        onCheckedChange={setShowAttendees}
        aria-label="Prikaži učesnike vežbačima"
      />
    </div>
  );

  const otkazivanjeBlok = (
    <div className="space-y-2">
      <div className="text-[14px] font-semibold tracking-tight">
        Najkasnije otkazivanje
      </div>
      <p className="text-[12.5px] text-muted-foreground">
        Vežbač ne može otkazati rezervaciju ako je do termina ostalo manje od izabranog roka.
      </p>
      <Select
        value={String(cancelCutoff)}
        onValueChange={(v) => setCancelCutoff(parseInt(v, 10))}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0">Bez ograničenja (do početka termina)</SelectItem>
          <SelectItem value="2">2 sata pre termina</SelectItem>
          <SelectItem value="4">4 sata pre termina</SelectItem>
          <SelectItem value="6">6 sati pre termina</SelectItem>
          <SelectItem value="12">12 sati pre termina</SelectItem>
          <SelectItem value="24">24 sata pre termina</SelectItem>
          <SelectItem value="48">48 sati pre termina</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // Racunar: isti izbor roka i isti tekst kao u aplikaciji.
  const rezervacijeDesktop = (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <div>
          <div className="text-[14px] font-semibold tracking-tight">Besplatno otkazivanje</div>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
            {cancelCutoff === 0
              ? "Bez ograničenja, do početka termina"
              : `Najkasnije ${cancelCutoff} ${cancelCutoff >= 5 ? "sati" : "sata"} pre termina. Kasnije otkazivanje oslobađa mesto, ali se vežbaču računa kao trening.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Besplatno otkazivanje">
          {[0, 2, 4, 6, 12, 24, 48].map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={cancelCutoff === h}
              onClick={() => setCancelCutoff(h)}
              className={cn(
                "h-8 rounded-full px-3 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                cancelCutoff === h ? "bg-gradient-brand text-white" : "bg-surface-2 text-muted-foreground hover:text-foreground",
              )}
            >
              {h === 0 ? "Bez" : `${h}h`}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-hairline pt-4">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold tracking-tight">Vežbači vide ko dolazi</div>
          <div className="text-[11.5px] text-muted-foreground">Na grupnim terminima</div>
        </div>
        <Switch checked={showAttendees} onCheckedChange={setShowAttendees} aria-label="Vežbači vide ko dolazi" />
      </div>
    </div>
  );

  const bankaPrimalac = (
    <div className="space-y-1.5">
      <Label htmlFor="bankRecipient">Primalac</Label>
      <Input
        id="bankRecipient"
        value={bankRecipient}
        onChange={(e) => setBankRecipient(e.target.value)}
        placeholder="Marko Marković PR / Naziv firme"
        maxLength={100}
      />
    </div>
  );

  const bankaRacun = (
    <div className="space-y-1.5">
      <Label htmlFor="bankAccount">Broj računa</Label>
      <Input
        id="bankAccount"
        value={bankAccount}
        onChange={(e) => setBankAccount(e.target.value)}
        placeholder="160-0000000000000-00"
        maxLength={30}
        inputMode="numeric"
      />
    </div>
  );

  const bankaBanka = (
    <div className="space-y-1.5">
      <Label htmlFor="bankName">Banka</Label>
      <Input
        id="bankName"
        value={bankName}
        onChange={(e) => setBankName(e.target.value)}
        placeholder="Banca Intesa"
        maxLength={60}
      />
    </div>
  );

  const bankaModel = (
    <div className="space-y-1.5">
      <Label htmlFor="bankModel">Model</Label>
      <Input
        id="bankModel"
        value={bankModel}
        onChange={(e) => setBankModel(e.target.value)}
        placeholder="97"
        maxLength={3}
        inputMode="numeric"
      />
    </div>
  );

  const bankaPoziv = (
    <div className="space-y-1.5">
      <Label htmlFor="bankReference">Poziv na broj</Label>
      <Input
        id="bankReference"
        value={bankReference}
        onChange={(e) => setBankReference(e.target.value)}
        placeholder="opciono"
        maxLength={22}
      />
    </div>
  );

  const bankaSvrha = (
    <div className="space-y-1.5">
      <Label htmlFor="bankPurpose">{desktop ? "Svrha" : "Svrha uplate"}</Label>
      <Input
        id="bankPurpose"
        value={bankPurpose}
        onChange={(e) => setBankPurpose(e.target.value)}
        placeholder="Članarina za trening"
        maxLength={140}
      />
    </div>
  );

  // Nalog - brisanje naloga, mora biti vidljivo direktno na ekranu (Apple 5.1.1(v))
  const nalogKartica = (
    <Card className="p-5 space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Nalog
      </div>
      <button
        type="button"
        onClick={openDeleteSheet}
        className="text-[13.5px] font-semibold text-destructive hover:text-destructive/80 transition"
      >
        Obriši nalog
      </button>
    </Card>
  );

  // Racunar: dugme za cuvanje u zaglavlju i na dnu forme (forma je duga, pa gornje
  // dugme zna da bude daleko od polja koje se upravo menja).
  const dugmeSacuvajDesktop = (
    <Button
      onClick={handleSave}
      disabled={saving}
      className="h-10 rounded-full px-4 bg-gradient-brand text-white shadow-brand hover:opacity-95"
    >
      {saving ? (
        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
      ) : (
        <Save className="h-4 w-4 mr-1.5" />
      )}
      Sačuvaj izmene
    </Button>
  );

  const pretplataTekst = subLabel(sub);

  return (
    <>
      <PhoneShell
        hasBottomNav
        back="/trener"
        eyebrow="Tvoj profil"
        desktopWidth="wide"
        title={
          desktop ? (
            "Profil trenera"
          ) : (
            <h1 className="font-display text-[28px] leading-[1.05] font-bold tracking-tightest">
              Profil trenera
            </h1>
          )
        }
        // Dok se profil ucitava cuvanje bi upisalo prazna polja, pa dugme tada ne
        // postoji - isto kao na telefonu, gde je dugme deo ucitanog sadrzaja.
        action={desktop && !loading ? dugmeSacuvajDesktop : undefined}
      >
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : desktop ? (
          // Racunar: brojke u redu gore, pa forma levo i kratka podesavanja desno.
          // Jedna kolona kartica je na sirokom ekranu bila dugacak niz uskih polja.
          <>
            <ProfilVrh
              ime={fullName}
              studio={studio}
              grad={city}
              specijalnosti={specialties}
              slika={avatarUrl}
              nova={novaSlika}
              onNova={setNovaSlika}
            />

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <ProfilStat icon={Users} label="Vežbača" value={stats.athletes} />
              <ProfilStat icon={Dumbbell} label="Programa" value={stats.programs} />
              <ProfilStat icon={Apple} label="Ishrana" value={stats.nutrition} />
              <ProfilPretplata />
            </div>

            <ProfilMesec />

            <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-6 pt-2">
              <div className="min-w-0 space-y-4">
                <Card className="p-6 space-y-5">
                  <DeoNaslov icon={UserRound} naslov="Osnovno" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">{poljeIme}</div>
                    {poljeEmail}
                    {poljeTelefon}
                  </div>
                </Card>

                <Card className="p-6 space-y-5">
                  <DeoNaslov icon={Briefcase} naslov="Tvoj rad" />
                  <div className="grid grid-cols-2 gap-4">
                    {poljeStudio}
                    {poljeGrad}
                    {poljeGodine}
                    {poljeInstagram}
                    <div className="col-span-2">{poljeBio}</div>
                  </div>
                </Card>

                <Card className="p-6 space-y-5">
                  <DeoNaslov icon={Sparkles} naslov="Specijalnosti" />
                  {specCipovi}
                  <div className="max-w-md">{specUnos}</div>
                  {specPredlozi}
                </Card>

                <Card className="p-6 space-y-5">
                  <DeoNaslov
                    icon={Globe}
                    naslov="Javna stranica"
                    opis="Lični sajt sa tvojim paketima i bio-om - podeli na Instagramu ili WhatsApp-u."
                  />
                  <div className="rounded-xl border border-hairline p-4">{javnoVidljivo}</div>
                  <div className="grid grid-cols-2 gap-4">
                    {javnoSlug}
                    {javnoHeadline}
                  </div>
                  {publicSlug.length >= 3 && !slugError && (
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-full px-4"
                        onClick={kopirajJavniLink}
                      >
                        <Copy className="h-4 w-4 mr-1.5" /> Kopiraj link
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-full px-4"
                        onClick={() => void podeliJavniLink()}
                      >
                        <Share2 className="h-4 w-4 mr-1.5" /> Podeli
                      </Button>
                      {publicEnabled && sacuvaniSlug && (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 rounded-full px-4"
                          onClick={() => window.open(publicTrainerUrl(sacuvaniSlug), "_blank", "noopener")}
                        >
                          <ExternalLink className="h-4 w-4 mr-1.5" /> Otvori stranicu
                        </Button>
                      )}
                    </div>
                  )}
                </Card>

                <Card className="p-6 space-y-5">
                  <DeoNaslov
                    icon={Landmark}
                    naslov="Uplata na račun"
                    opis="Ovi podaci se prikazuju vežbaču kad odabere plaćanje na račun."
                  />
                  <div className="grid grid-cols-2 gap-4">
                    {bankaPrimalac}
                    {bankaRacun}
                    {bankaBanka}
                    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-4">
                      {bankaModel}
                      {bankaPoziv}
                    </div>
                    <div className="col-span-2">{bankaSvrha}</div>
                  </div>
                </Card>

                <div className="flex items-center justify-end gap-3 pt-1">
                  <span className="text-[12.5px] text-muted-foreground">
                    Izmene važe tek kad ih sačuvaš.
                  </span>
                  {dugmeSacuvajDesktop}
                </div>
              </div>

              <div className="space-y-4">
                <Card className="p-5 space-y-4">
                  <DeoNaslov icon={CalendarCheck} naslov="Rezervacije" />
                  {rezervacijeDesktop}
                </Card>

                <ProfilCeline />

                <PravnoIPodrska podrskaTo="/trener/podrska" izdavac />

                <ProfilOdjava />

                {nalogKartica}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-4 text-center">
                <Users className="h-4 w-4 mx-auto text-primary mb-1.5" />
                <div className="font-display text-[22px] font-bold tracking-tight">
                  {stats.athletes}
                </div>
                <div className="text-[11px] text-muted-foreground">Vežbača</div>
              </Card>
              <Card className="p-4 text-center">
                <Dumbbell className="h-4 w-4 mx-auto text-primary mb-1.5" />
                <div className="font-display text-[22px] font-bold tracking-tight">
                  {stats.programs}
                </div>
                <div className="text-[11px] text-muted-foreground">Programa</div>
              </Card>
              <Card className="p-4 text-center">
                <Apple className="h-4 w-4 mx-auto text-primary mb-1.5" />
                <div className="font-display text-[22px] font-bold tracking-tight">
                  {stats.nutrition}
                </div>
                <div className="text-[11px] text-muted-foreground">Ishrana</div>
              </Card>
            </div>

            {/* FitLink pretplata - samo status (upravljanje je na webu, bez dugmeta/linka) */}
            {pretplataTekst && (
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      FitLink pretplata
                    </div>
                    <div className="text-[14px] font-semibold tracking-tight text-foreground mt-0.5">
                      {pretplataTekst}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Osnovno */}
            <Card className="p-5 space-y-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Osnovno
              </div>
              {poljeIme}
              {poljeEmail}
              {poljeTelefon}
            </Card>

            {/* Posao */}
            <Card className="p-5 space-y-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Tvoj rad
              </div>
              {poljeStudio}
              <div className="grid grid-cols-2 gap-3">
                {poljeGrad}
                {poljeGodine}
              </div>
              {poljeInstagram}
              {poljeBio}
            </Card>

            {/* Specijalnosti */}
            <Card className="p-5 space-y-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Specijalnosti
              </div>
              {specCipovi}
              {specUnos}
              {specPredlozi}
            </Card>

            {/* Public landing */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Javna stranica
                </div>
              </div>
              <p className="text-[12.5px] text-muted-foreground -mt-2">
                Lični sajt sa tvojim paketima i bio-om - podeli na Instagramu ili WhatsApp-u.
              </p>

              {javnoVidljivo}
              {javnoSlug}
              {javnoHeadline}

              {javniLinkSpreman && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={kopirajJavniLink}
                  >
                    <Copy className="h-4 w-4 mr-2" /> Kopiraj link
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.open(publicTrainerUrl(publicSlug.trim().toLowerCase()), "_blank")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </Card>

            {/* Privatnost grupnih termina */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Privatnost termina
                </div>
              </div>
              {privatnostRed}
            </Card>

            {/* Pravila otkazivanja */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Ban className="h-4 w-4 text-primary" />
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Pravila otkazivanja
                </div>
              </div>
              {otkazivanjeBlok}
            </Card>

            {/* Podaci za uplatu na račun */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-primary" />
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Uplata na račun
                </div>
              </div>
              <p className="text-[12px] text-muted-foreground -mt-2">
                Ovi podaci se prikazuju vežbaču kad odabere plaćanje na račun.
              </p>

              {bankaPrimalac}
              {bankaRacun}
              {bankaBanka}
              <div className="grid grid-cols-2 gap-3">
                {bankaModel}
                {bankaPoziv}
              </div>
              {bankaSvrha}
            </Card>

            <Button
              onClick={handleSave}
              disabled={saving}
              size="lg"
              className="w-full bg-gradient-brand text-white shadow-brand hover:opacity-95"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Sačuvaj izmene
            </Button>

            <PravnoIPodrska />

            {nalogKartica}
          </>
        )}
      </PhoneShell>
      <BottomNav role="trainer" />

      {deleteEmail != null && (
        <DeleteAccountSheet
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          userEmail={deleteEmail}
          role="trainer"
        />
      )}
    </>
  );
};

export default Profile;
