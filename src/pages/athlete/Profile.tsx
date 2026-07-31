import { useEffect, useState } from "react";
// no router nav needed; PhoneShell handles back
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Save, UserRound, Phone, Mail, HelpCircle, Activity, ChevronRight } from "lucide-react";
import { AthleteOnboardingTour } from "@/components/AthleteOnboardingTour";
import { HealthMetricsCard } from "@/components/wearables/HealthMetricsCard";
import { WearableTrendChart } from "@/components/wearables/WearableTrendChart";
import { WorkoutsList } from "@/components/wearables/WorkoutsList";
import { useWearableConnections } from "@/hooks/useWearableConnections";
import { Link } from "react-router-dom";
import { porukaGreske } from "@/lib/errorMessage";
import { toast } from "sonner";
import { DeleteAccountSheet } from "@/components/DeleteAccountSheet";
import { WatchResetCard } from "@/components/WatchResetCard";

type Goal = "lose_weight" | "gain_muscle" | "endurance" | "mobility" | "general";
type Gender = "male" | "female" | "other";

const Profile = () => {
  const { user } = useAuth();
  const { connections } = useWearableConnections();
  const hasConnection = connections.some((c) => c.status === "connected");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [goal, setGoal] = useState<Goal>("general");
  const [heightCm, setHeightCm] = useState<string>("");
  const [weightKg, setWeightKg] = useState<string>("");
  const [birthYear, setBirthYear] = useState<string>("");
  const [gender, setGender] = useState<Gender | "">("");
  const [notes, setNotes] = useState("");
  const [heightError, setHeightError] = useState<string | null>(null);
  const [weightError, setWeightError] = useState<string | null>(null);
  const [birthYearError, setBirthYearError] = useState<string | null>(null);
  const [trainer, setTrainer] = useState<{ name: string; phone: string | null; email: string | null } | null>(null);
  const [tourOpen, setTourOpen] = useState(false);

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
      const [pRes, aRes] = await Promise.all([
        supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
        supabase.from("athletes").select("*").eq("id", user.id).maybeSingle(),
      ]);
      const p: any = pRes.data ?? {};
      const a: any = aRes.data ?? {};
      setFullName(p.full_name ?? "");
      setPhone(p.phone ?? "");
      setGoal((a.goal as Goal) ?? "general");
      setHeightCm(a.height_cm != null ? String(a.height_cm) : "");
      setWeightKg(a.weight_kg != null ? String(a.weight_kg) : "");
      setBirthYear(a.birth_year != null ? String(a.birth_year) : "");
      setGender((a.gender as Gender) ?? "");
      setNotes(a.notes ?? "");

      // Fetch trener
      if (a.trainer_id) {
        const { data: tr } = await supabase
          .from("profiles")
          .select("full_name, phone")
          .eq("id", a.trainer_id)
          .maybeSingle();
        const t: any = tr;
        if (t) setTrainer({ name: t.full_name ?? "Trener", phone: t.phone, email: null });
      }

      setLoading(false);
    };
    load();
  }, [user]);

  // Validacija pre slanja - prazno polje je dozvoljeno (NULL kolone), samo
  // popunjeno polje van opsega se odbija OVDE, bez ijednog poziva ka bazi.
  const validate = (): boolean => {
    let ok = true;
    setHeightError(null);
    setWeightError(null);
    setBirthYearError(null);

    if (heightCm.trim()) {
      const h = Number(heightCm);
      if (!Number.isFinite(h) || h < 100 || h > 250) {
        setHeightError("Visina mora biti između 100 i 250 cm.");
        ok = false;
      }
    }
    if (weightKg.trim()) {
      const w = Number(weightKg);
      if (!Number.isFinite(w) || w < 30 || w > 300) {
        setWeightError("Težina mora biti između 30 i 300 kg.");
        ok = false;
      }
    }
    if (birthYear.trim()) {
      const y = Number(birthYear);
      const currentYear = new Date().getFullYear();
      if (!Number.isInteger(y) || y < 1900 || y > currentYear) {
        setBirthYearError(`Godina rođenja mora biti između 1900 i ${currentYear}.`);
        ok = false;
      }
    }
    return ok;
  };

  const handleSave = async () => {
    if (!user) return;
    if (!validate()) return;
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

      const heightNum = heightCm ? parseInt(heightCm, 10) : null;
      const weightNum = weightKg ? parseFloat(weightKg) : null;
      const yearNum = birthYear ? parseInt(birthYear, 10) : null;

      const { error: aErr } = await supabase
        .from("athletes")
        .update({
          goal,
          height_cm: heightNum,
          weight_kg: weightNum,
          birth_year: yearNum,
          gender: gender || null,
          notes: notes.trim() || null,
        } as any)
        .eq("id", user.id);
      if (aErr) throw aErr;

      toast.success("Profil sačuvan");
    } catch (e: any) {
      toast.error(porukaGreske(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PhoneShell
        hasBottomNav
        back="/vezbac"
        eyebrow="Tvoj profil"
        title={
          <h1 className="font-display text-[28px] leading-[1.05] font-bold tracking-tightest">
            Profil
          </h1>
        }
      >
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {trainer && (
              <Card className="p-5 bg-gradient-to-br from-primary/8 via-surface to-surface relative overflow-hidden">
                <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-gradient-brand opacity-10 blur-2xl" />
                <div className="relative flex items-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-brand text-white flex items-center justify-center shadow-brand shrink-0">
                    <UserRound className="h-6 w-6" strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                      Tvoj trener
                    </div>
                    <div className="font-display text-[20px] font-bold tracking-tightest leading-tight mt-0.5 truncate">
                      {trainer.name}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                      {trainer.phone && (
                        <a
                          href={`tel:${trainer.phone}`}
                          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition"
                        >
                          <Phone className="h-3 w-3" />
                          {trainer.phone}
                        </a>
                      )}
                      {trainer.email && (
                        <a
                          href={`mailto:${trainer.email}`}
                          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition truncate"
                        >
                          <Mail className="h-3 w-3" />
                          {trainer.email}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Zdravstveni podaci (wearable) */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  WEARABLE
                </div>
                <Link
                  to="/vezbac/integracije"
                  className="text-[12px] font-semibold text-primary inline-flex items-center gap-0.5 hover:opacity-80"
                >
                  Povezani uređaji <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="font-display text-[20px] font-bold tracking-tightest leading-tight">
                Zdravstveni podaci
              </div>

              {hasConnection ? (
                <>
                  <HealthMetricsCard />
                  <WearableTrendChart
                    dataType="heart_rate_avg"
                    days={30}
                    title="Prosečan puls, poslednjih 30 dana"
                  />
                  <WearableTrendChart
                    dataType="workout_duration"
                    days={30}
                    title="Trajanje treninga, poslednjih 30 dana"
                  />
                </>
              ) : (
                <Link to="/vezbac/integracije" className="block">
                  <Card className="p-4 bg-gradient-brand-soft border-0 hover:opacity-95 transition">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-gradient-brand text-primary-foreground flex items-center justify-center shadow-brand shrink-0">
                        <Activity className="h-5 w-5" strokeWidth={2.25} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-[15px] font-bold tracking-tight">
                          Poveži sat ili narukvicu
                        </div>
                        <div className="text-[12px] text-muted-foreground">
                          Apple Health, Fitbit, Garmin, Strava i još
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Card>
                </Link>
              )}
            </section>

            {hasConnection && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Treninzi sa sata
                  </div>
                  <Link
                    to="/vezbac/treninzi"
                    className="text-[12px] font-semibold text-primary inline-flex items-center gap-0.5 hover:opacity-80"
                  >
                    Vidi sve <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <WorkoutsList limit={5} />
              </section>
            )}

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
                <p className="text-[11px] text-muted-foreground">
                  Email se ne može menjati.
                </p>
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

            <Card className="p-5 space-y-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Cilj treninga
              </div>

              <div className="space-y-1.5">
                <Label>Cilj</Label>
                <Select value={goal} onValueChange={(v) => setGoal(v as Goal)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lose_weight">Mršavljenje</SelectItem>
                    <SelectItem value="gain_muscle">Masa</SelectItem>
                    <SelectItem value="endurance">Izdržljivost</SelectItem>
                    <SelectItem value="mobility">Mobilnost</SelectItem>
                    <SelectItem value="general">Opšte stanje</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>

            <Card className="p-5 space-y-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                O tebi
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="height">Visina (cm)</Label>
                  <Input
                    id="height"
                    type="number"
                    inputMode="numeric"
                    min={100}
                    max={250}
                    value={heightCm}
                    onChange={(e) => { setHeightCm(e.target.value); setHeightError(null); }}
                    placeholder="180"
                  />
                  {heightError && <p className="text-[11.5px] text-destructive">{heightError}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="weight">Težina (kg)</Label>
                  <Input
                    id="weight"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={30}
                    max={300}
                    value={weightKg}
                    onChange={(e) => { setWeightKg(e.target.value); setWeightError(null); }}
                    placeholder="80"
                  />
                  {weightError && <p className="text-[11.5px] text-destructive">{weightError}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="birthYear">Godina rođenja</Label>
                  <Input
                    id="birthYear"
                    type="number"
                    inputMode="numeric"
                    min={1900}
                    max={new Date().getFullYear()}
                    value={birthYear}
                    onChange={(e) => { setBirthYear(e.target.value); setBirthYearError(null); }}
                    placeholder="1995"
                  />
                  {birthYearError && <p className="text-[11.5px] text-destructive">{birthYearError}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Pol</Label>
                  <Select value={gender || undefined} onValueChange={(v) => setGender(v as Gender)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Izaberi" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Muški</SelectItem>
                      <SelectItem value="female">Ženski</SelectItem>
                      <SelectItem value="other">Drugo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes">Beleške za trenera</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Povrede, alergije, ograničenja..."
                  rows={4}
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

            <button
              type="button"
              onClick={() => setTourOpen(true)}
              className="w-full text-center text-[12.5px] font-semibold text-muted-foreground hover:text-primary inline-flex items-center justify-center gap-1.5 py-2"
            >
              <HelpCircle className="h-3.5 w-3.5" /> Pregled aplikacije
            </button>

            <WatchResetCard />

            {/* Nalog - brisanje naloga, mora biti vidljivo direktno na ekranu (Apple 5.1.1(v)) */}
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
          </>
        )}
      </PhoneShell>
      <BottomNav role="athlete" />
      {tourOpen && <AthleteOnboardingTour forceOpen onClose={() => setTourOpen(false)} />}

      {deleteEmail != null && (
        <DeleteAccountSheet
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          userEmail={deleteEmail}
          role="athlete"
        />
      )}
    </>
  );
};

export default Profile;
