import { useEffect, useState } from "react";
import { PhoneShell } from "@/components/PhoneShell";
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
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const SPEC_SUGGESTIONS = [
  "Mršavljenje", "Hipertrofija", "Snaga", "Funkcionalni trening",
  "Kondicija", "Mobilnost", "Rehabilitacija", "Sportska priprema",
  "Trudnice", "Senior", "Personalni trening", "Grupni trening",
];

const Profile = () => {
  const { user } = useAuth();
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
  const [slugError, setSlugError] = useState<string | null>(null);

  // read-only stats
  const [stats, setStats] = useState({
    athletes: 0,
    programs: 0,
    nutrition: 0,
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);

      const [pRes, tRes, aCount, prCount, nuCount] = await Promise.all([
        supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
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
          .from("nutrition_templates")
          .select("id", { count: "exact", head: true })
          .eq("trainer_id", user.id),
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
      

      setStats({
        athletes: aCount.count ?? 0,
        programs: prCount.count ?? 0,
        nutrition: nuCount.count ?? 0,
      });

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
      return "Slug: 3-40 znakova, mala slova, brojevi, crtice. Bez razmaka.";
    }
    return null;
  };

  const handleSave = async () => {
    if (!user) return;

    const slugClean = publicSlug.trim().toLowerCase();
    const slugErr = validateSlug(slugClean);
    setSlugError(slugErr);
    if (slugErr) {
      toast.error(slugErr);
      return;
    }

    setSaving(true);
    try {
      const { error: pErr } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
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
        } as any)
        .eq("id", user.id);
      if (tErr) {
        if ((tErr.message || "").toLowerCase().includes("uniq_trainers_public_slug")) {
          throw new Error("Taj slug je već zauzet, izaberi drugi.");
        }
        throw tErr;
      }

      toast.success("Profil sačuvan");
    } catch (e: any) {
      toast.error(e.message ?? "Greška pri čuvanju");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PhoneShell
        hasBottomNav
        back="/trener"
        eyebrow="Tvoj profil"
        title={
          <h1 className="font-display text-[28px] leading-[1.05] font-bold tracking-tightest">
            Profil trenera
          </h1>
        }
      >
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
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

            {/* Osnovno */}
            <Card className="p-5 space-y-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Osnovno
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fullName">Ime i prezime</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Marko Marković"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={user?.email ?? ""} disabled />
              </div>

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
            </Card>

            {/* Posao */}
            <Card className="p-5 space-y-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Tvoj rad
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="studio">Studio / teretana</Label>
                <Input
                  id="studio"
                  value={studio}
                  onChange={(e) => setStudio(e.target.value)}
                  placeholder="Naziv studia"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="city">Grad</Label>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Beograd"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="years">Godine iskustva</Label>
                  <Input
                    id="years"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={80}
                    value={years}
                    onChange={(e) => setYears(e.target.value)}
                    placeholder="5"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ig">Instagram</Label>
                <Input
                  id="ig"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="korisnicko_ime"
                />
              </div>

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
            </Card>

            {/* Specijalnosti */}
            <Card className="p-5 space-y-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Specijalnosti
              </div>

              {specialties.length > 0 && (
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
              )}

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
                Lični sajt sa tvojim paketima i bio-om — podeli na Instagramu ili WhatsApp-u.
              </p>

              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold tracking-tight">Vidljivo javnosti</div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">
                    Ako isključiš, niko ne može otvoriti tvoj /t/ link.
                  </div>
                </div>
                <Switch checked={publicEnabled} onCheckedChange={setPublicEnabled} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="slug">Tvoj slug</Label>
                <div className="flex items-stretch rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
                  <span
                    className="flex items-center px-3 text-[12.5px] text-muted-foreground bg-muted/50 border-r border-input max-w-[55%] truncate tnum"
                    title={`${window.location.host}/t/`}
                  >
                    <span className="truncate">{window.location.host}</span>
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
                    onClick={async () => {
                      const url = `${window.location.origin}/t/${publicSlug.trim().toLowerCase()}`;
                      try {
                        await navigator.clipboard.writeText(url);
                        toast.success("Link kopiran");
                      } catch {
                        toast.error("Ne mogu da kopiram");
                      }
                    }}
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

              <div className="space-y-1.5">
                <Label htmlFor="headline">Slogan / headline</Label>
                <Input
                  id="headline"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="Personal trener — snaga i mršavljenje za zauzete ljude"
                  maxLength={140}
                />
                <div className="text-[11px] text-muted-foreground text-right tnum">
                  {headline.length}/140
                </div>
              </div>

              {publicSlug && publicEnabled && !slugError && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={async () => {
                      const url = `${window.location.origin}/t/${publicSlug.trim().toLowerCase()}`;
                      try {
                        await navigator.clipboard.writeText(url);
                        toast.success("Link kopiran");
                      } catch {
                        toast.error("Ne mogu da kopiram");
                      }
                    }}
                  >
                    <Copy className="h-4 w-4 mr-2" /> Kopiraj link
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.open(`/t/${publicSlug.trim().toLowerCase()}`, "_blank")}
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
            </Card>

            {/* Pravila otkazivanja */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Ban className="h-4 w-4 text-primary" />
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Pravila otkazivanja
                </div>
              </div>

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

              <div className="grid grid-cols-2 gap-3">
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
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bankPurpose">Svrha uplate</Label>
                <Input
                  id="bankPurpose"
                  value={bankPurpose}
                  onChange={(e) => setBankPurpose(e.target.value)}
                  placeholder="Članarina za trening"
                  maxLength={140}
                />
              </div>
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
          </>
        )}
      </PhoneShell>
      <BottomNav role="trainer" />
    </>
  );
};

export default Profile;
